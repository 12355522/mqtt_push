# MQTT推送服務

一個基於Node.js的MQTT推送服務，用於從Redis讀取感測器資料並發布到MQTT主題。

## 功能特點

- 📡 從Redis讀取感測器資料
- 🔄 自動處理和解碼中文感測器資訊
- 📨 批量發布資料到MQTT主題
- 🏷️ 自動設備註冊功能
- 🔧 靈活的配置管理
- 📊 完整的日誌記錄
- ⚡ 自動重連機制
- 🛡️ 優雅關閉支援

## 系統需求

- Node.js 14.0 或以上版本
- Redis 服務器
- MQTT 代理服務器（如Mosquitto）

## 安裝

1. 克隆項目：
```bash
git clone <repository-url>
cd mqtt_push
```

2. 安裝依賴：
```bash
npm install
```

3. 配置環境：
```bash
cp config.env.example config.env
# 編輯 config.env 檔案設置您的配置
```

## 配置

服務支援兩種配置方式：

### 1. 環境變數
```bash
export REDIS_HOST=127.0.0.1
export REDIS_PORT=6379
export MQTT_BROKER_URL=mqtt://localhost:1883
```

### 2. 配置檔案 (config.env)
```
# Redis配置
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0

# MQTT配置
MQTT_BROKER_URL=mqtt://localhost:1883
MQTT_CLIENT_ID=mqtt-push-service
MQTT_USERNAME=
MQTT_PASSWORD=

# 服務配置
POLL_INTERVAL=5000
LOG_LEVEL=info

# 感測器配置
SENSOR_DATA_KEY=SENINF
DEVICE_TOPIC_PREFIX=device

# 設備註冊配置
DEVICE_REGISTRATION_TOPIC=device/name
DEVICE_SN_KEY=DeviceSN
DEVICE_IP_KEY=ip
AUTO_REGISTER_ON_START=true
```

## 使用方法

### 啟動服務
```bash
npm start
```

### 開發模式
```bash
npm run dev
```

### 運行測試
```bash
npm test
```

## MQTT主題結構

### 感測器資料主題
服務將感測器資料發布到以下主題格式：
```
device/{devicename}/seninf
```

其中 `{devicename}` 是感測器的序號（SN）。

### 設備註冊主題
服務啟動時會自動發布設備註冊資訊到：
```
device/name
```

設備註冊訊息格式：
```json
{
  "deviceSN": "R02b5165",
  "ip": "192.168.0.13",
  "clientId": "mqtt-push-service",
  "registeredAt": "2023-12-07T10:30:00.000Z",
  "action": "register"
}
```

## 資料格式

### Redis輸入格式
服務從Redis讀取JSON格式的感測器陣列，支援UTF-8編碼的中文描述。

### MQTT輸出格式
```json
{
  "device_info": {
    "serial_number": "16A0885024",
    "description": "後溫度",
    "address": 1,
    "name": "溫度感測器",
    "status": "active"
  },
  "sensor_values": [
    {
      "id": "603db20ab7d71486ab441e20",
      "name": "溫度",
      "type": "溫度",
      "code": "A",
      "range": {
        "min": -1,
        "max": 60,
        "valid": true
      },
      "calculation": null
    }
  ],
  "profile": "",
  "metadata": {
    "processed_at": "2023-12-07T10:30:00.000Z",
    "total_sensors": 1
  },
  "timestamp": "2023-12-07T10:30:00.000Z",
  "published_by": "mqtt-push-service"
}
```

## 感測器類型支援

服務支援以下感測器類型：

| 代碼 | 類型 | 說明 |
|------|------|------|
| A | 溫度 | 溫度感測器 |
| B | 濕度 | 濕度感測器 |
| C | 二氧化碳 | CO2感測器 |
| S | 負壓 | 壓差計 |
| R | 風速 | 風速計 |
| L | 飲用水量 | 水錶 |

## 日誌

服務提供完整的日誌功能：

- `logs/combined.log` - 所有日誌
- `logs/error.log` - 錯誤日誌
- `logs/exceptions.log` - 異常日誌
- `logs/rejections.log` - Promise拒絕日誌

## 監控

服務提供健康檢查和統計資訊：

```javascript
const service = new MqttPushService();
const health = service.healthCheck();
const stats = service.getStats();
```

## 故障排除

### 常見問題

1. **Redis連接失敗**
   - 檢查Redis服務是否運行
   - 驗證連接資訊是否正確

2. **MQTT連接失敗**
   - 檢查MQTT代理是否運行
   - 驗證URL格式和認證資訊

3. **感測器資料為空**
   - 檢查Redis中是否存在指定鍵
   - 驗證資料格式是否正確

### 調試模式

設置LOG_LEVEL為debug以獲取詳細日誌：
```bash
export LOG_LEVEL=debug
```

## 授權

MIT License

## 貢獻

歡迎提交Issue和Pull Request來改進此項目。
