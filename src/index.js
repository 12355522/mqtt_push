const RedisService = require('./services/redisService');
const MqttService = require('./services/mqttService');
const SensorProcessor = require('./utils/sensorProcessor');
const Config = require('./utils/config');
const logger = require('./utils/logger');

class MqttPushService {
  constructor() {
    this.config = Config.getInstance();
    this.redisService = null;
    this.mqttService = null;
    this.sensorProcessor = new SensorProcessor();
    this.isRunning = false;
    this.pollTimer = null;
    this.stats = {
      startTime: new Date(),
      totalPublished: 0,
      lastPublishTime: null,
      errors: 0
    };
  }

  /**
   * 初始化服務
   */
  async initialize() {
    try {
      logger.info('正在初始化MQTT推送服務...');
      
      // 顯示配置資訊
      logger.info('服務配置:', this.config.getSafeConfig());

      // 初始化Redis服務
      this.redisService = new RedisService(this.config.getAll());
      await this.redisService.connect();

      // 初始化MQTT服務
      this.mqttService = new MqttService(this.config.getAll());
      await this.mqttService.connect();

      logger.info('MQTT推送服務初始化完成');
      
    } catch (error) {
      logger.error('服務初始化失敗:', error);
      throw error;
    }
  }

  /**
   * 啟動服務
   */
  async start() {
    try {
      if (this.isRunning) {
        logger.warn('服務已在運行中');
        return;
      }

      await this.initialize();
      
      this.isRunning = true;
      logger.info('MQTT推送服務已啟動');

      // 執行設備註冊（如果啟用）
      if (this.config.get('AUTO_REGISTER_ON_START')) {
        await this.registerDevice();
      }

      // 立即執行一次數據同步
      await this.processSensorData();

      // 開始定期輪詢
      this.startPolling();

      // 設置優雅關閉
      this.setupGracefulShutdown();

    } catch (error) {
      logger.error('啟動服務失敗:', error);
      await this.stop();
      throw error;
    }
  }

  /**
   * 註冊設備到伺服器
   */
  async registerDevice() {
    try {
      logger.info('開始設備註冊...');

      // 檢查連接狀態
      if (!this.redisService.isReady()) {
        throw new Error('Redis未就緒，無法讀取設備資訊');
      }

      if (!this.mqttService.isReady()) {
        throw new Error('MQTT未就緒，無法發送註冊資訊');
      }

      // 從Redis讀取設備資訊
      const deviceData = await this.redisService.getDeviceInfo();
      
      // 發布設備註冊資訊到 device/name 主題
      await this.mqttService.publishDeviceRegistration(deviceData);

      logger.info(`設備註冊完成 - SN: ${deviceData.deviceSN}, IP: ${deviceData.ip}`);

    } catch (error) {
      logger.error('設備註冊失敗:', error);
      // 註冊失敗不應該阻止服務啟動，只記錄錯誤
      this.stats.errors++;
    }
  }

  /**
   * 開始定期輪詢
   */
  startPolling() {
    const interval = this.config.get('POLL_INTERVAL');
    logger.info(`開始定期輪詢，間隔: ${interval}ms`);

    this.pollTimer = setInterval(async () => {
      try {
        await this.processSensorData();
      } catch (error) {
        logger.error('定期輪詢時發生錯誤:', error);
        this.stats.errors++;
      }
    }, interval);
  }

  /**
   * 處理感測器資料
   */
  async processSensorData() {
    try {
      // 檢查服務狀態
      if (!this.isRunning) {
        return;
      }

      // 檢查連接狀態
      if (!this.redisService.isReady()) {
        logger.warn('Redis未就緒，跳過此次處理');
        return;
      }

      if (!this.mqttService.isReady()) {
        logger.warn('MQTT未就緒，跳過此次處理');
        return;
      }

      // 從Redis讀取感測器資料
      const sensorDataKey = this.config.get('SENSOR_DATA_KEY');
      const rawSensorData = await this.redisService.getSensorData(sensorDataKey);

      if (!rawSensorData || rawSensorData.length === 0) {
        logger.debug('未找到感測器資料');
        return;
      }

      // 處理感測器資料
      const processedData = this.sensorProcessor.processAndFormat(rawSensorData);
      
      if (processedData.length === 0) {
        logger.warn('處理後無有效感測器資料');
        return;
      }

      // 發布到MQTT
      const results = await this.mqttService.publishBatchSensorData(processedData);
      
      // 更新統計資訊
      this.updateStats(processedData.length, results);

      logger.info(`成功處理並發布 ${processedData.length} 個感測器資料`);

    } catch (error) {
      logger.error('處理感測器資料時發生錯誤:', error);
      this.stats.errors++;
      throw error;
    }
  }

  /**
   * 更新統計資訊
   * @param {number} publishedCount - 發布數量
   * @param {Array} results - 發布結果
   */
  updateStats(publishedCount, results) {
    this.stats.totalPublished += publishedCount;
    this.stats.lastPublishTime = new Date();

    // 計算失敗數量
    const failedCount = results.filter(result => 
      result.status === 'rejected' || result.value?.error
    ).length;

    if (failedCount > 0) {
      this.stats.errors += failedCount;
    }
  }

  /**
   * 獲取服務統計資訊
   * @returns {Object} 統計資訊
   */
  getStats() {
    const now = new Date();
    const uptime = Math.floor((now - this.stats.startTime) / 1000);

    return {
      ...this.stats,
      uptime: uptime,
      isRunning: this.isRunning,
      redisConnected: this.redisService?.isReady() || false,
      mqttConnected: this.mqttService?.isReady() || false
    };
  }

  /**
   * 停止服務
   */
  async stop() {
    try {
      logger.info('正在停止MQTT推送服務...');
      
      this.isRunning = false;

      // 停止定期輪詢
      if (this.pollTimer) {
        clearInterval(this.pollTimer);
        this.pollTimer = null;
      }

      // 關閉連接
      if (this.mqttService) {
        await this.mqttService.disconnect();
      }

      if (this.redisService) {
        await this.redisService.disconnect();
      }

      logger.info('MQTT推送服務已停止');

    } catch (error) {
      logger.error('停止服務時發生錯誤:', error);
    }
  }

  /**
   * 設置優雅關閉
   */
  setupGracefulShutdown() {
    const shutdown = async (signal) => {
      logger.info(`收到 ${signal} 信號，正在優雅關閉服務...`);
      
      try {
        await this.stop();
        logger.info('服務已優雅關閉');
        process.exit(0);
      } catch (error) {
        logger.error('優雅關閉失敗:', error);
        process.exit(1);
      }
    };

    // 監聽終止信號
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    // 監聽未捕獲的異常
    process.on('uncaughtException', (error) => {
      logger.error('未捕獲的異常:', error);
      shutdown('uncaughtException');
    });

    process.on('unhandledRejection', (reason, promise) => {
      logger.error('未處理的Promise拒絕:', reason);
      shutdown('unhandledRejection');
    });
  }

  /**
   * 手動執行設備註冊
   */
  async manualRegisterDevice() {
    await this.registerDevice();
  }

  /**
   * 健康檢查
   * @returns {Object} 健康狀態
   */
  healthCheck() {
    return {
      status: this.isRunning ? 'healthy' : 'stopped',
      timestamp: new Date().toISOString(),
      services: {
        redis: this.redisService?.isReady() || false,
        mqtt: this.mqttService?.isReady() || false
      },
      config: {
        autoRegister: this.config.get('AUTO_REGISTER_ON_START'),
        deviceRegistrationTopic: this.config.get('DEVICE_REGISTRATION_TOPIC'),
        pollInterval: this.config.get('POLL_INTERVAL')
      },
      stats: this.getStats()
    };
  }
}

// 如果直接執行此檔案，則啟動服務
if (require.main === module) {
  const service = new MqttPushService();
  
  service.start().catch(error => {
    logger.error('啟動服務失敗:', error);
    process.exit(1);
  });

  // 定期輸出統計資訊
  setInterval(() => {
    const stats = service.getStats();
    logger.info('服務統計:', stats);
  }, 60000); // 每分鐘輸出一次
}

module.exports = MqttPushService;
