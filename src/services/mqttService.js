const mqtt = require('mqtt');
const logger = require('../utils/logger');

class MqttService {
  constructor(config) {
    this.config = config;
    this.client = null;
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
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
        
        // 發送在線狀態
        this.publishStatus('online');
      });

      this.client.on('error', (error) => {
        logger.error('MQTT連接錯誤:', error);
        this.isConnected = false;
      });

      this.client.on('offline', () => {
        logger.warn('MQTT離線');
        this.isConnected = false;
      });

      this.client.on('reconnect', () => {
        this.reconnectAttempts++;
        logger.info(`MQTT重新連接中... (嘗試 ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
        
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
          logger.error('MQTT重連次數超過限制，停止重連');
          this.client.end();
        }
      });

      this.client.on('close', () => {
        logger.info('MQTT連接已關閉');
        this.isConnected = false;
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
   * 批量發布多個設備的感測器資料
   * @param {Array} sensorDataArray - 感測器資料陣列
   */
  async publishBatchSensorData(sensorDataArray) {
    const publishPromises = [];
    
    for (const sensorData of sensorDataArray) {
      // 使用設備序號作為設備名稱，如果沒有則使用ADDRESS
      const deviceName = sensorData.SN || `device_${sensorData.ADDRESS}`;
      
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
   * 關閉MQTT連接
   */
  async disconnect() {
    try {
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
