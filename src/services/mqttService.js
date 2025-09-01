const mqtt = require('mqtt');
const logger = require('../utils/logger');

class MqttService {
  constructor(config) {
    this.config = config;
    this.client = null;
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.reconnectTimer = null;
    this.reconnectInterval = 20000; // 20秒重連間隔
    this.manualReconnectEnabled = false;
  }

  /**
   * 初始化MQTT連接
   */
  async connect() {
    try {
      const options = {
        clientId: this.config.MQTT_CLIENT_ID || `mqtt-push-service-${Date.now()}`,
        username: this.config.MQTT_USERNAME || undefined,
        password: this.config.MQTT_PASSWORD || undefined,
        reconnectPeriod: 5000, // 5秒重連間隔
        connectTimeout: 30000, // 30秒連接超時
        keepalive: 60, // 60秒心跳間隔
        clean: true,
        will: {
          topic: `${this.config.DEVICE_TOPIC_PREFIX}/status`,
          payload: JSON.stringify({
            clientId: this.config.MQTT_CLIENT_ID,
            status: 'offline',
            timestamp: new Date().toISOString()
          }),
          qos: 1,
          retain: true
        }
      };

      this.client = mqtt.connect(this.config.MQTT_BROKER_URL || 'mqtt://localhost:1883', options);

      // 連接事件處理
      this.client.on('connect', () => {
        logger.info(`MQTT已連接到 ${this.config.MQTT_BROKER_URL}`);
        this.isConnected = true;
        this.reconnectAttempts = 0;
        
        // 停止手動重連機制
        this.stopManualReconnect();
        
        // 發送在線狀態
        this.publishStatus('online');
      });

      this.client.on('error', (error) => {
        logger.error('MQTT連接錯誤:', error);
        this.isConnected = false;
        this.startManualReconnect();
      });

      this.client.on('offline', () => {
        logger.warn('MQTT離線');
        this.isConnected = false;
        this.startManualReconnect();
      });

      this.client.on('reconnect', () => {
        this.reconnectAttempts++;
        logger.info(`MQTT重新連接中... (嘗試 ${this.reconnectAttempts})`);
      });

      this.client.on('close', () => {
        logger.info('MQTT連接已關閉');
        this.isConnected = false;
        this.startManualReconnect();
      });

      // 等待連接建立
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('MQTT連接超時'));
        }, 30000);

        this.client.on('connect', () => {
          clearTimeout(timeout);
          resolve();
        });

        this.client.on('error', (error) => {
          clearTimeout(timeout);
          reject(error);
        });
      });

    } catch (error) {
      logger.error('MQTT初始化失敗:', error);
      throw error;
    }
  }

  /**
   * 啟動手動重新連接
   */
  startManualReconnect() {
    if (this.manualReconnectEnabled || this.reconnectTimer) {
      return; // 已經在重連中
    }

    this.manualReconnectEnabled = true;
    logger.info('啟動手動重新連接機制，每20秒嘗試一次');

    this.reconnectTimer = setInterval(async () => {
      if (this.isConnected) {
        logger.info('MQTT已重新連接，停止手動重連機制');
        this.stopManualReconnect();
        return;
      }

      try {
        logger.info(`嘗試手動重新連接... (第 ${this.reconnectAttempts + 1} 次)`);
        await this.attemptReconnect();
      } catch (error) {
        logger.error('手動重新連接失敗:', error);
        this.reconnectAttempts++;
        // 無限重連，不停止重連機制
      }
    }, this.reconnectInterval);
  }

  /**
   * 停止手動重新連接
   */
  stopManualReconnect() {
    if (this.reconnectTimer) {
      clearInterval(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.manualReconnectEnabled = false;
    logger.info('手動重新連接機制已停止');
  }

  /**
   * 嘗試重新連接
   */
  async attemptReconnect() {
    try {
      if (this.client) {
        // 關閉現有連接
        this.client.end(true);
        this.client = null;
      }

      // 重新建立連接
      await this.connect();
      
    } catch (error) {
      logger.error('重新連接嘗試失敗:', error);
      throw error;
    }
  }

  /**
   * 發布感測器資料到MQTT主題
   * @param {string} deviceName - 設備名稱
   * @param {Object} sensorData - 感測器資料
   */
  async publishSensorData(deviceName, sensorData) {
    try {
      if (!this.isConnected || !this.client) {
        throw new Error('MQTT未連接');
      }

      const topic = `${this.config.DEVICE_TOPIC_PREFIX}/${deviceName}/seninf`;
      const payload = JSON.stringify({
        ...sensorData,
        timestamp: new Date().toISOString(),
        published_by: this.config.MQTT_CLIENT_ID
      });

      return new Promise((resolve, reject) => {
        this.client.publish(topic, payload, { qos: 1, retain: false }, (error) => {
          if (error) {
            logger.error(`發布感測器資料失敗 [${topic}]:`, error);
            reject(error);
          } else {
            logger.debug(`成功發布感測器資料到 ${topic}`);
            resolve();
          }
        });
      });

    } catch (error) {
      logger.error('發布感測器資料時發生錯誤:', error);
      throw error;
    }
  }

  /**
   * 批量發布多個設備的感測器資料（使用統一設備名稱）
   * 將所有感測器資料合併為一個完整的設備感測器列表
   * @param {Array} sensorDataArray - 感測器資料陣列
   * @param {string} deviceName - 統一的設備名稱
   */
  async publishBatchSensorDataWithDeviceName(sensorDataArray, deviceName) {
    try {
      if (!this.isConnected || !this.client) {
        throw new Error('MQTT未連接');
      }

      // 合併所有感測器資料為完整的設備感測器列表
      const deviceSensorList = {
        device_info: {
          device_name: deviceName,
          total_sensors: sensorDataArray.length,
          status: 'active'
        },
        sensors: sensorDataArray.map(sensorData => ({
          device_info: sensorData.device_info,
          sensor_values: sensorData.sensor_values,
          profile: sensorData.profile,
          metadata: sensorData.metadata
        })),
        timestamp: new Date().toISOString(),
        published_by: this.config.MQTT_CLIENT_ID
      };

      const topic = `${this.config.DEVICE_TOPIC_PREFIX}/${deviceName}/seninf`;
      const payload = JSON.stringify(deviceSensorList);

      // 直接打印要發布的數據
      console.log('=== 要發布到MQTT的數據 ===');
      console.log('主題:', topic);
      console.log('數據:', JSON.stringify(deviceSensorList, null, 2));
      console.log('=== MQTT發布數據結束 ===');

      return new Promise((resolve, reject) => {
        this.client.publish(topic, payload, { qos: 1, retain: false }, (error) => {
          if (error) {
            logger.error(`發布設備感測器列表失敗 [${topic}]:`, error);
            reject(error);
          } else {
            logger.info(`成功發布設備 ${deviceName} 的完整感測器列表，共 ${sensorDataArray.length} 個感測器`);
            resolve([{ status: 'fulfilled', deviceName }]);
          }
        });
      });

    } catch (error) {
      logger.error('批量發布感測器資料失敗:', error);
      throw error;
    }
  }

  /**
   * 批量發布多個設備的感測器資料（舊版本，保持向後兼容）
   * @param {Array} sensorDataArray - 感測器資料陣列
   */
  async publishBatchSensorData(sensorDataArray) {
    const publishPromises = [];
    
    for (const sensorData of sensorDataArray) {
      // 嘗試從不同位置獲取設備名稱
      let deviceName;
      if (sensorData.device_info && sensorData.device_info.serial_number) {
        deviceName = sensorData.device_info.serial_number;
      } else if (sensorData.SN) {
        deviceName = sensorData.SN;
      } else if (sensorData.ADDRESS) {
        deviceName = `device_${sensorData.ADDRESS}`;
      } else {
        deviceName = 'unknown_device';
        logger.warn('無法確定設備名稱，使用預設值:', deviceName);
      }
      
      publishPromises.push(
        this.publishSensorData(deviceName, sensorData).catch(error => {
          logger.error(`發布設備 ${deviceName} 資料失敗:`, error);
          return { deviceName, error: error.message };
        })
      );
    }

    try {
      const results = await Promise.allSettled(publishPromises);
      const failed = results.filter(result => result.status === 'rejected' || result.value?.error);
      
      if (failed.length > 0) {
        logger.warn(`批量發布完成，${failed.length}個設備發布失敗`);
      } else {
        logger.info(`成功批量發布 ${sensorDataArray.length} 個設備的感測器資料`);
      }
      
      return results;
    } catch (error) {
      logger.error('批量發布感測器資料失敗:', error);
      throw error;
    }
  }

  /**
   * 發布單個感測器數值資料
   * @param {string} deviceName - 設備名稱
   * @param {string} sensorId - 感測器序號
   * @param {Object} sensorValue - 感測器數值資料
   */
  async publishSensorValue(deviceName, sensorId, sensorValue) {
    try {
      if (!this.isConnected || !this.client) {
        throw new Error('MQTT未連接');
      }

      const topic = `${this.config.DEVICE_TOPIC_PREFIX}/${deviceName}/${sensorId}`;
      const payload = JSON.stringify({
        ...sensorValue.values,
        timestamp: new Date().toISOString(),
        sensorId: sensorId,
        published_by: this.config.MQTT_CLIENT_ID
      });

      return new Promise((resolve, reject) => {
        this.client.publish(topic, payload, { qos: 1, retain: false }, (error) => {
          if (error) {
            logger.error(`發布感測器數值失敗 [${topic}]:`, error);
            reject(error);
          } else {
            logger.debug(`成功發布感測器數值到 ${topic}`);
            resolve();
          }
        });
      });

    } catch (error) {
      logger.error('發布感測器數值時發生錯誤:', error);
      throw error;
    }
  }

  /**
   * 批量發布多個感測器的數值資料
   * @param {string} deviceName - 設備名稱
   * @param {Array} sensorValues - 感測器數值資料陣列
   */
  async publishBatchSensorValues(deviceName, sensorValues) {
    const publishPromises = [];
    
    for (const sensorValue of sensorValues) {
      publishPromises.push(
        this.publishSensorValue(deviceName, sensorValue.sensorId, sensorValue).catch(error => {
          logger.error(`發布感測器 ${sensorValue.sensorId} 數值失敗:`, error);
          return { sensorId: sensorValue.sensorId, error: error.message };
        })
      );
    }

    try {
      const results = await Promise.allSettled(publishPromises);
      const failed = results.filter(result => result.status === 'rejected' || result.value?.error);
      
      if (failed.length > 0) {
        logger.warn(`批量發布完成，${failed.length}個感測器數值發布失敗`);
      } else {
        logger.info(`成功批量發布 ${sensorValues.length} 個感測器數值到設備 ${deviceName}`);
      }
      
      return results;
    } catch (error) {
      logger.error('批量發布感測器數值失敗:', error);
      throw error;
    }
  }

  /**
   * 發布設備註冊資訊
   * @param {Object} deviceData - 設備資料 {deviceSN, ip}
   */
  async publishDeviceRegistration(deviceData) {
    try {
      if (!this.isConnected || !this.client) {
        throw new Error('MQTT未連接');
      }

      const { deviceSN, ip } = deviceData;
      
      if (!deviceSN || !ip) {
        throw new Error('設備資料不完整，需要deviceSN和ip');
      }

      const topic = 'device/name';
      const payload = JSON.stringify({
        deviceSN,
        ip,
        clientId: this.config.MQTT_CLIENT_ID,
        registeredAt: new Date().toISOString(),
        action: 'register'
      });

      return new Promise((resolve, reject) => {
        this.client.publish(topic, payload, { qos: 1, retain: false }, (error) => {
          if (error) {
            logger.error('發布設備註冊失敗:', error);
            reject(error);
          } else {
            logger.info(`設備註冊成功 - SN: ${deviceSN}, IP: ${ip}`);
            resolve();
          }
        });
      });

    } catch (error) {
      logger.error('發布設備註冊時發生錯誤:', error);
      throw error;
    }
  }

  /**
   * 發布服務狀態
   * @param {string} status - 狀態 (online/offline)
   */
  async publishStatus(status) {
    try {
      if (!this.client) {
        return;
      }

      const topic = `${this.config.DEVICE_TOPIC_PREFIX}/service/status`;
      const payload = JSON.stringify({
        clientId: this.config.MQTT_CLIENT_ID,
        status: status,
        timestamp: new Date().toISOString()
      });

      this.client.publish(topic, payload, { qos: 1, retain: true }, (error) => {
        if (error) {
          logger.error('發布狀態失敗:', error);
        } else {
          logger.debug(`狀態已更新: ${status}`);
        }
      });
    } catch (error) {
      logger.error('發布狀態時發生錯誤:', error);
    }
  }

  /**
   * 檢查MQTT連接狀態
   * @returns {boolean} 連接狀態
   */
  isReady() {
    return this.isConnected && this.client && this.client.connected;
  }

  /**
   * 發布飼養數據
   * @param {string} deviceName - 設備名稱
   * @param {Object} feedingData - 飼養數據
   */
  async publishFeedingData(deviceName, feedingData) {
    try {
      if (!this.isConnected || !this.client) {
        throw new Error('MQTT未連接');
      }

      const topic = `${this.config.DEVICE_TOPIC_PREFIX}/${deviceName}/feeding`;
      const payload = JSON.stringify({
        feedDay: feedingData.feedDay,
        timestamp: feedingData.timestamp
      });

      // 直接打印要發布的飼養數據
      console.log('=== 要發布的飼養數據 ===');
      console.log('主題:', topic);
      console.log('數據:', JSON.stringify(payload, null, 2));
      console.log('=== 飼養數據結束 ===');

      return new Promise((resolve, reject) => {
        this.client.publish(topic, payload, { qos: 1, retain: false }, (error) => {
          if (error) {
            logger.error(`發布飼養數據失敗 [${topic}]:`, error);
            reject(error);
          } else {
            logger.info(`成功發布飼養數據到 ${topic}`);
            resolve();
          }
        });
      });

    } catch (error) {
      logger.error('發布飼養數據時發生錯誤:', error);
      throw error;
    }
  }

  /**
   * 關閉MQTT連接
   */
  async disconnect() {
    try {
      // 停止手動重連機制
      this.stopManualReconnect();
      
      if (this.client) {
        // 發送離線狀態
        await this.publishStatus('offline');
        
        // 等待消息發送完成後關閉連接
        setTimeout(() => {
          this.client.end(true, () => {
            logger.info('MQTT連接已關閉');
          });
        }, 1000);
      }
    } catch (error) {
      logger.error('關閉MQTT連接時發生錯誤:', error);
    }
  }
}

module.exports = MqttService;
