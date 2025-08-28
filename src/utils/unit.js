let unit = [
    {
        "name": "濕度",
        "unit": "%",
        "code": "B",
        "img": "humidity.png"
    },
    {
        "name": "二氧化碳",
        "unit": "ppm",
        "code": "C",
        "img": "co2.png"
    },
    {
        "name": "氨氣濃度",
        "unit": "ppm",
        "code": "D",
        "img": "gas.png"
    },
    {
        "name": "PM 1.0",
        "unit": "µg/m³",
        "code": "E",
        "img": "gas.png"
    },
    {
        "name": "PM 2.5",
        "unit": "µg/m³",
        "code": "F",
        "img": "gas.png"
    },
    {
        "name": "PM10",
        "unit": "µg/m³",
        "code": "G",
        "img": "gas.png"
    },
    {
        "name": "溫度",
        "unit": "℃",
        "code": "A",
        "img": "temperature.png"
    },
    {
        "name": "硫化氫濃度",
        "unit": "ppm",
        "code": "H",
        "img": "gas.png"
    },
    {
        "name": "照度",
        "unit": "lux",
        "code": "I",
        "img": "gas.png"
    },
    {
        "name": "氧氣濃度",
        "unit": "%",
        "code": "J",
        "img": "gas.png"
    },
    {
        "name": "飼料供給量",
        "unit": "kg",
        "code": "K",
        "img": "gas.png"
    },
    {
        "name": "飲用水量",
        "unit": "L",
        "code": "L",
        "img": "gas.png"
    },
    {
        "name": "液位",
        "unit": "cm",
        "code": "M",
        "img": "gas.png"
    },
    {
        "name": "水位狀態",
        "unit": "state",
        "code": "N",
        "img": "gas.png"
    },
    {
        "name": "即時重量",
        "unit": "g",
        "code": "O",
        "img": "gas.png"
    },
    {
        "name": "瞬間功率",
        "unit": "KW",
        "code": "P",
        "img": "gas.png"
    },
    {
        "name": "重量",
        "unit": "g",
        "code": "Q",
        "img": "gas.png"
    },
    {
        "name": "風速",
        "unit": "m/s",
        "code": "R",
        "img": "gas.png"
    },
    {
        "name": "負壓",
        "unit": "pa",
        "code": "S",
        "img": "gas.png"
    },
    {
        "name": "虛擬",
        "unit": "虛擬",
        "code": "9",
        "img": "gas.png"
    },
    {
        "name": "開關量",
        "unit": "開關量",
        "code": "T",
        "img": "gas.png"
    },
    {
        "name": "電流",
        "unit": "A",
        "code": "X",
        "img": "gas.png"
    },
    {
        "name": "電壓",
        "unit": "V",
        "code": "W",
        "img": "gas.png"
    },
    {
        "name": "度",
        "unit": "KWh",
        "code": "Z",
        "img": "gas.png"
    },
    {
        "name": "即時功率",
        "unit": "W",
        "code": "Y",
        "img": "gas.png"
    },
    {
        "name": "功率因數",
        "unit": "PF",
        "code": "U",
        "img": "gas.png"
    },
    {
        "name": "風向",
        "unit": "°",
        "code": "V",
        "img": "gas.png"
    },
    {
        "name": "紫外線強度",
        "unit": "mW/cm²",
        "code": "a",
        "img": "gas.png"
    },
    {
        "name": "光量子",
        "unit": "umol/m²s",
        "code": "b",
        "img": "gas.png"
    },
    {
        "name": "雨滴感知",
        "unit": " ",
        "code": "c",
        "img": "gas.png"
    },
    {
        "name": "電導度",
        "unit": "us/cm",
        "code": "d",
        "img": "gas.png"
    },
    {
        "name": "PH",
        "unit": "PH",
        "code": "e",
        "img": "gas.png"
    },
    {
        "name": "水活性",
        "unit": "aw",
        "code": "f",
        "img": "gas.png"
    },
    {
        "name": "異常值",
        "unit": "",
        "code": "g",
        "img": "gas.png"
    }
];

/**
 * 根據代碼獲取感測器類型資訊
 * @param {string} code - 感測器代碼
 * @returns {Object|null} 感測器類型資訊
 */
function getUnitByCode(code) {
    return unit.find(u => u.code === code) || null;
}

/**
 * 獲取所有感測器類型
 * @returns {Array} 所有感測器類型陣列
 */
function getAllUnits() {
    return unit;
}

/**
 * 根據名稱獲取感測器類型資訊
 * @param {string} name - 感測器名稱
 * @returns {Object|null} 感測器類型資訊
 */
function getUnitByName(name) {
    return unit.find(u => u.name === name) || null;
}

module.exports = {
    unit,
    getUnitByCode,
    getAllUnits,
    getUnitByName
};
