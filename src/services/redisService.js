const redis = require('redis');
const logger = require('../utils/logger');

class RedisService {
  constructor(config) {
    this.config = config;
    this.client = null;
    this.isConnected = false;
  }

  /**
   * 初始化Redis連接
   */
  async connect() {
    try {
      this.client = redis.createClient({
        host: this.config.REDIS_HOST || '127.0.0.1',
        port: this.config.REDIS_PORT || 6379,
        password: this.config.REDIS_PASSWORD || undefined,
        database: this.config.REDIS_DB || 0,
        retry_strategy: (options) => {
          if (options.error && options.error.code === 'ECONNREFUSED') {
            logger.error('Redis服務器拒絕連接');
            return new Error('Redis服務器拒絕連接');
          }
          if (options.total_retry_time > 1000 * 60 * 60) {
            logger.error('Redis重試時間超過1小時');
            return new Error('Redis重試時間超過1小時');
          }
          if (options.attempt > 10) {
            logger.error('Redis重試次數超過10次');
            return undefined;
          }
          // 重試間隔遞增
          return Math.min(options.attempt * 100, 3000);
        }
      });

      this.client.on('error', (err) => {
        logger.error('Redis連接錯誤:', err);
        this.isConnected = false;
      });

      this.client.on('connect', () => {
        logger.info('Redis連接成功');
        this.isConnected = true;
      });

      this.client.on('reconnecting', () => {
        logger.info('Redis重新連接中...');
        this.isConnected = false;
      });

      this.client.on('end', () => {
        logger.info('Redis連接已關閉');
        this.isConnected = false;
      });

      await this.client.connect();
      logger.info('Redis服務初始化完成');
      
    } catch (error) {
      logger.error('Redis連接失敗:', error);
      throw error;
    }
  }

  /**
   * 讀取感測器資料
   * @param {string} key - Redis鍵名
   * @returns {Promise<Array>} 感測器資料陣列
   */
  async getSensorData(key = 'SENINF') {
    try {
      if (!this.isConnected || !this.client) {
        throw new Error('Redis未連接');
      }

      const data = await this.client.get(key);
      if (!data) {
        logger.warn(`Redis中未找到鍵: ${key}`);
        return [];
      }

      const sensorData = JSON.parse(data);
      logger.debug(`成功讀取感測器資料，共${sensorData.length}個設備`);
      
      return sensorData;
    } catch (error) {
      logger.error('讀取感測器資料失敗:', error);
      throw error;
    }
  }

  /**
   * 讀取設備資訊
   * @returns {Promise<Object>} 設備資訊物件
   */
  async getDeviceInfo() {
    try {
      if (!this.isConnected || !this.client) {
        throw new Error('Redis未連接');
      }

      // 同時讀取DeviceSN和ip
      const [deviceSN, ip] = await Promise.all([
        this.client.get('DeviceSN'),
        this.client.get('ip')
      ]);

      if (!deviceSN) {
        throw new Error('Redis中未找到DeviceSN');
      }

      if (!ip) {
        throw new Error('Redis中未找到ip');
      }

      const deviceData = {
        deviceSN,
        ip
      };

      logger.info('成功讀取設備資訊:', deviceData);
      return deviceData;

    } catch (error) {
      logger.error('讀取設備資訊失敗:', error);
      throw error;
    }
  }

  /**
   * 讀取單個鍵值
   * @param {string} key - Redis鍵名
   * @returns {Promise<string|null>} 鍵值
   */
  async getValue(key) {
    try {
      if (!this.isConnected || !this.client) {
        throw new Error('Redis未連接');
      }

      const value = await this.client.get(key);
      logger.debug(`讀取鍵 ${key}:`, value);
      
      return value;
    } catch (error) {
      logger.error(`讀取鍵 ${key} 失敗:`, error);
      throw error;
    }
  }

  /**
   * 讀取單個感測器的數值資料
   * @param {string} sensorId - 感測器序號
   * @returns {Promise<Object|null>} 感測器數值資料
   */
  async getSensorValue(sensorId) {
    try {
      if (!this.isConnected || !this.client) {
        throw new Error('Redis未連接');
      }

      const data = await this.client.get(sensorId);
      if (!data) {
        logger.debug(`感測器 ${sensorId} 未找到數值資料`);
        return null;
      }

      // 解析JSON數據
      const sensorValue = JSON.parse(data);
      logger.debug(`成功讀取感測器 ${sensorId} 數值:`, sensorValue);
      
      return {
        sensorId,
        values: sensorValue,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      logger.error(`讀取感測器 ${sensorId} 數值失敗:`, error);
      throw error;
    }
  }

  /**
   * 批量讀取多個感測器的數值資料
   * @param {Array} sensorIds - 感測器序號陣列
   * @returns {Promise<Array>} 感測器數值資料陣列
   */
  async getBatchSensorValues(sensorIds) {
    try {
      if (!this.isConnected || !this.client) {
        throw new Error('Redis未連接');
      }

      // 使用mget批量讀取
      const values = await this.client.mGet(sensorIds);
      const results = [];

      for (let i = 0; i < sensorIds.length; i++) {
        if (values[i]) {
          try {
            const sensorValue = JSON.parse(values[i]);
            results.push({
              sensorId: sensorIds[i],
              values: sensorValue,
              timestamp: new Date().toISOString()
            });
          } catch (parseError) {
            logger.warn(`解析感測器 ${sensorIds[i]} 數值失敗:`, parseError);
          }
        } else {
          logger.debug(`感測器 ${sensorIds[i]} 未找到數值資料`);
        }
      }

      logger.info(`批量讀取完成，成功讀取 ${results.length}/${sensorIds.length} 個感測器數值`);
      return results;

    } catch (error) {
      logger.error('批量讀取感測器數值失敗:', error);
      throw error;
    }
  }

  /**
   * 檢查Redis連接狀態
   * @returns {boolean} 連接狀態
   */
  isReady() {
    return this.isConnected && this.client && this.client.isReady;
  }

  /**
   * 關閉Redis連接
   */
  async disconnect() {
    try {
      if (this.client) {
        await this.client.quit();
        logger.info('Redis連接已關閉');
      }
    } catch (error) {
      logger.error('關閉Redis連接時發生錯誤:', error);
    }
  }

  /**
   * 測試Redis連接
   */
  async ping() {
    try {
      if (!this.client) {
        throw new Error('Redis客戶端未初始化');
      }
      
      const result = await this.client.ping();
      logger.debug('Redis ping測試:', result);
      return result === 'PONG';
    } catch (error) {
      logger.error('Redis ping測試失敗:', error);
      return false;
    }
  }
}

module.exports = RedisService;
