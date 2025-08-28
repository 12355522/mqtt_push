const path = require('path');
const fs = require('fs');

class Config {
  constructor() {
    this.config = {};
    this.loadConfig();
  }

  /**
   * 載入配置
   */
  loadConfig() {
    try {
      // 載入環境變數
      this.loadEnvironmentVariables();
      
      // 載入配置檔案
      this.loadConfigFile();
      
      // 設置預設值
      this.setDefaults();
      
      // 驗證配置
      this.validateConfig();

    } catch (error) {
      console.error('載入配置失敗:', error);
      throw error;
    }
  }

  /**
   * 載入環境變數
   */
  loadEnvironmentVariables() {
    // 嘗試載入dotenv
    try {
      require('dotenv').config();
    } catch (error) {
      // dotenv不是必需的，忽略錯誤
    }

    // 從process.env載入配置
    const envConfig = {
      // Redis配置
      REDIS_HOST: process.env.REDIS_HOST,
      REDIS_PORT: process.env.REDIS_PORT ? parseInt(process.env.REDIS_PORT) : undefined,
      REDIS_PASSWORD: process.env.REDIS_PASSWORD,
      REDIS_DB: process.env.REDIS_DB ? parseInt(process.env.REDIS_DB) : undefined,
      
      // MQTT配置
      MQTT_BROKER_URL: process.env.MQTT_BROKER_URL,
      MQTT_CLIENT_ID: process.env.MQTT_CLIENT_ID,
      MQTT_USERNAME: process.env.MQTT_USERNAME,
      MQTT_PASSWORD: process.env.MQTT_PASSWORD,
      
      // 服務配置
      POLL_INTERVAL: process.env.POLL_INTERVAL ? parseInt(process.env.POLL_INTERVAL) : undefined,
      LOG_LEVEL: process.env.LOG_LEVEL,
      
      // 感測器配置
      SENSOR_DATA_KEY: process.env.SENSOR_DATA_KEY,
      DEVICE_TOPIC_PREFIX: process.env.DEVICE_TOPIC_PREFIX,
      
      // 設備註冊配置
      DEVICE_REGISTRATION_TOPIC: process.env.DEVICE_REGISTRATION_TOPIC,
      DEVICE_SN_KEY: process.env.DEVICE_SN_KEY,
      DEVICE_IP_KEY: process.env.DEVICE_IP_KEY,
      AUTO_REGISTER_ON_START: process.env.AUTO_REGISTER_ON_START === 'true'
    };

    // 移除undefined值
    Object.keys(envConfig).forEach(key => {
      if (envConfig[key] !== undefined) {
        this.config[key] = envConfig[key];
      }
    });
  }

  /**
   * 載入配置檔案
   */
  loadConfigFile() {
    // 嘗試載入config.env檔案
    const configPath = path.join(process.cwd(), 'config.env');
    
    if (fs.existsSync(configPath)) {
      try {
        const configContent = fs.readFileSync(configPath, 'utf8');
        const configLines = configContent.split('\n');
        
        configLines.forEach(line => {
          line = line.trim();
          if (line && !line.startsWith('#')) {
            const [key, ...valueParts] = line.split('=');
            if (key && valueParts.length > 0) {
              const value = valueParts.join('=').trim();
              
              // 如果環境變數中沒有設置，則使用配置檔案中的值
              if (this.config[key] === undefined && value) {
                // 嘗試轉換數字類型
                if (/^\d+$/.test(value)) {
                  this.config[key] = parseInt(value);
                } else {
                  this.config[key] = value;
                }
              }
            }
          }
        });
      } catch (error) {
        console.warn('讀取配置檔案失敗:', error.message);
      }
    }
  }

  /**
   * 設置預設值
   */
  setDefaults() {
    const defaults = {
      // Redis預設值
      REDIS_HOST: '127.0.0.1',
      REDIS_PORT: 6379,
      REDIS_DB: 0,
      
      // MQTT預設值
      MQTT_BROKER_URL: 'mqtt://localhost:1883',
      MQTT_CLIENT_ID: `mqtt-push-service-${Date.now()}`,
      
      // 服務預設值
      POLL_INTERVAL: 5000, // 5秒
      LOG_LEVEL: 'info',
      
      // 感測器預設值
      SENSOR_DATA_KEY: 'SENINF',
      DEVICE_TOPIC_PREFIX: 'device',
      
      // 設備註冊預設值
      DEVICE_REGISTRATION_TOPIC: 'device/name',
      DEVICE_SN_KEY: 'DeviceSN',
      DEVICE_IP_KEY: 'ip',
      AUTO_REGISTER_ON_START: true
    };

    Object.keys(defaults).forEach(key => {
      if (this.config[key] === undefined) {
        this.config[key] = defaults[key];
      }
    });
  }

  /**
   * 驗證配置
   */
  validateConfig() {
    const required = [
      'REDIS_HOST',
      'REDIS_PORT',
      'MQTT_BROKER_URL',
      'SENSOR_DATA_KEY'
    ];

    const missing = required.filter(key => 
      this.config[key] === undefined || this.config[key] === ''
    );

    if (missing.length > 0) {
      throw new Error(`缺少必要配置: ${missing.join(', ')}`);
    }

    // 驗證數值範圍
    if (this.config.REDIS_PORT < 1 || this.config.REDIS_PORT > 65535) {
      throw new Error('Redis端口號必須在1-65535範圍內');
    }

    if (this.config.POLL_INTERVAL < 1000) {
      console.warn('輪詢間隔小於1秒，可能會對系統造成負載');
    }

    // 驗證URL格式
    if (!this.isValidUrl(this.config.MQTT_BROKER_URL)) {
      throw new Error('MQTT代理URL格式無效');
    }
  }

  /**
   * 檢查URL是否有效
   * @param {string} url - 要檢查的URL
   * @returns {boolean} URL是否有效
   */
  isValidUrl(url) {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 獲取配置值
   * @param {string} key - 配置鍵
   * @returns {*} 配置值
   */
  get(key) {
    return this.config[key];
  }

  /**
   * 獲取所有配置
   * @returns {Object} 所有配置
   */
  getAll() {
    return { ...this.config };
  }

  /**
   * 設置配置值（僅用於測試）
   * @param {string} key - 配置鍵
   * @param {*} value - 配置值
   */
  set(key, value) {
    this.config[key] = value;
  }

  /**
   * 顯示配置資訊（隱藏敏感資訊）
   * @returns {Object} 安全的配置資訊
   */
  getSafeConfig() {
    const safeConfig = { ...this.config };
    
    // 隱藏敏感資訊
    const sensitiveKeys = ['REDIS_PASSWORD', 'MQTT_PASSWORD'];
    sensitiveKeys.forEach(key => {
      if (safeConfig[key]) {
        safeConfig[key] = '***';
      }
    });

    return safeConfig;
  }
}

// 單例模式
let configInstance = null;

module.exports = {
  getInstance: () => {
    if (!configInstance) {
      configInstance = new Config();
    }
    return configInstance;
  },
  
  // 用於測試的工廠方法
  createNew: () => new Config()
};
