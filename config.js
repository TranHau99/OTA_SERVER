module.exports = {
    mqtt: {
        host: "mqtt://broker.hivemq.com:1883",
        port: 1883
    },
    web: {
        port: 3000
    },
    security: {
        otaPassword: process.env.OTA_PASSWORD || "change-this-password"
    }
};
