const logger = require('./logger');

class SensorProcessor {
  constructor() {
    // 感測器類型映射
    this.sensorTypes = {
      'A': '溫度',
      'B': '濕度', 
      'C': '二氧化碳',
      'S': '負壓',
      'R': '風速',
      'L': '飲用水量'
    };
  }

  /**
   * 處理感測器資料
   * @param {Array} sensorDataArray - 原始感測器資料陣列
   * @returns {Array} 處理後的感測器資料
   */
  processSensorData(sensorDataArray) {
    try {
      if (!Array.isArray(sensorDataArray)) {
        logger.warn('感測器資料不是陣列格式');
        return [];
      }

      const processedData = sensorDataArray.map(sensor => {
        return this.processSingleSensor(sensor);
      }).filter(sensor => sensor !== null);

      logger.debug(`處理完成，共 ${processedData.length} 個有效感測器`);
      return processedData;

    } catch (error) {
      logger.error('處理感測器資料時發生錯誤:', error);
      return [];
    }
  }

  /**
   * 處理單個感測器資料
   * @param {Object} sensor - 單個感測器資料
   * @returns {Object|null} 處理後的感測器資料
   */
  processSingleSensor(sensor) {
    try {
      // 基本資料驗證
      if (!sensor || typeof sensor !== 'object') {
        logger.warn('無效的感測器資料格式');
        return null;
      }

      // 必要欄位檢查
      if (!sensor.SN || !sensor.ADDRESS) {
        logger.warn('感測器缺少必要欄位 (SN或ADDRESS)');
        return null;
      }

      // 解碼中文描述和名稱
      const decodedSensor = {
        SN: sensor.SN,
        DES: this.decodeUTF8(sensor.DES || ''),
        ADDRESS: sensor.ADDRESS,
        name: this.decodeUTF8(sensor.name || ''),
        profile: sensor.profile || '',
        value: this.processValueArray(sensor.value || []),
        processed_at: new Date().toISOString()
      };

      // 添加感測器狀態資訊
      decodedSensor.status = this.determineSensorStatus(decodedSensor);
      
      return decodedSensor;

    } catch (error) {
      logger.error(`處理感測器 ${sensor?.SN || 'unknown'} 時發生錯誤:`, error);
      return null;
    }
  }

  /**
   * 處理感測器數值陣列
   * @param {Array} valueArray - 感測器數值陣列
   * @returns {Array} 處理後的數值陣列
   */
  processValueArray(valueArray) {
    if (!Array.isArray(valueArray)) {
      return [];
    }

    return valueArray.map(value => {
      try {
        const processedValue = {
          _id: value._id,
          name: this.decodeUTF8(value.name || ''),
          max: this.parseNumber(value.max),
          min: this.parseNumber(value.min),
          code: value.code,
          calc: value.calc || null,
          type: this.sensorTypes[value.code] || '未知類型'
        };

        // 驗證數值範圍
        processedValue.range_valid = this.validateRange(processedValue.min, processedValue.max);
        
        return processedValue;
      } catch (error) {
        logger.warn('處理感測器數值時發生錯誤:', error);
        return value; // 返回原始資料
      }
    });
  }

  /**
   * 解碼UTF-8編碼的中文字串
   * @param {string} encodedString - 編碼的字串
   * @returns {string} 解碼後的字串
   */
  decodeUTF8(encodedString) {
    try {
      if (!encodedString || typeof encodedString !== 'string') {
        return '';
      }

      // 如果已經是正常的中文，直接返回
      if (!/\\x[0-9a-fA-F]{2}/.test(encodedString)) {
        return encodedString;
      }

      // 處理\xXX格式的編碼
      const decoded = encodedString.replace(/\\x([0-9a-fA-F]{2})/g, (match, hex) => {
        return String.fromCharCode(parseInt(hex, 16));
      });

      // 嘗試將其轉換為UTF-8
      const buffer = Buffer.from(decoded, 'latin1');
      return buffer.toString('utf8');
      
    } catch (error) {
      logger.warn('解碼UTF-8字串失敗:', error);
      return encodedString; // 返回原始字串
    }
  }

  /**
   * 解析數值
   * @param {*} value - 要解析的值
   * @returns {number|null} 解析後的數值
   */
  parseNumber(value) {
    if (value === null || value === undefined || value === '') {
      return null;
    }
    
    const parsed = parseFloat(value);
    return isNaN(parsed) ? null : parsed;
  }

  /**
   * 驗證數值範圍
   * @param {number} min - 最小值
   * @param {number} max - 最大值
   * @returns {boolean} 範圍是否有效
   */
  validateRange(min, max) {
    if (min === null || max === null) {
      return false;
    }
    return min < max;
  }

  /**
   * 判斷感測器狀態
   * @param {Object} sensor - 感測器資料
   * @returns {string} 感測器狀態
   */
  determineSensorStatus(sensor) {
    try {
      // 檢查是否有有效的數值配置
      if (!sensor.value || sensor.value.length === 0) {
        return 'no_values';
      }

      // 檢查數值範圍是否有效
      const validValues = sensor.value.filter(v => v.range_valid);
      if (validValues.length === 0) {
        return 'invalid_range';
      }

      // 檢查是否有必要的資訊
      if (!sensor.name || !sensor.DES) {
        return 'incomplete_info';
      }

      return 'active';
      
    } catch (error) {
      logger.error('判斷感測器狀態時發生錯誤:', error);
      return 'error';
    }
  }

  /**
   * 格式化感測器資料用於MQTT發布
   * @param {Object} sensor - 處理後的感測器資料
   * @returns {Object} 格式化後的資料
   */
  formatForMqtt(sensor) {
    try {
      return {
        device_info: {
          serial_number: sensor.SN,
          description: sensor.DES,
          address: sensor.ADDRESS,
          name: sensor.name,
          status: sensor.status
        },
        sensor_values: sensor.value.map(value => ({
          id: value._id,
          name: value.name,
          type: value.type,
          code: value.code,
          range: {
            min: value.min,
            max: value.max,
            valid: value.range_valid
          },
          calculation: value.calc
        })),
        profile: sensor.profile,
        metadata: {
          processed_at: sensor.processed_at,
          total_sensors: sensor.value.length
        }
      };
    } catch (error) {
      logger.error('格式化MQTT資料時發生錯誤:', error);
      return sensor; // 返回原始資料
    }
  }

  /**
   * 批量處理並格式化感測器資料
   * @param {Array} sensorDataArray - 原始感測器資料陣列
   * @returns {Array} 格式化後的資料陣列
   */
  processAndFormat(sensorDataArray) {
    const processedData = this.processSensorData(sensorDataArray);
    return processedData.map(sensor => this.formatForMqtt(sensor));
  }
}

module.exports = SensorProcessor;
