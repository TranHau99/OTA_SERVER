console.log("===== MQTT.JS LOADED =====");

const mqtt = require("mqtt");
const config = require("./config");
console.log("Starting MQTT connection...");
console.log("MQTT URL:", config.mqtt.host);


const client = mqtt.connect(config.mqtt.host, {
    clientId: `OTA_SERVER_${Math.random().toString(16).slice(2, 10)}`,
    reconnectPeriod: 3000,
    connectTimeout: 10000
});

client.on("connect", () => {
    console.log("==================================");
    console.log("MQTT Connected");
    console.log("Broker:", config.mqtt.host);
    console.log("==================================");
});

client.on("reconnect", () => {
    console.log("MQTT reconnecting...");
});

client.on("error", (err) => {
    console.error("MQTT Error:", err.message);
});

client.on("offline", () => {
    console.log("MQTT Offline");
});

client.on("close", () => {
    console.log("MQTT Connection Closed");
});

client.on("end", () => {
    console.log("MQTT Connection Ended");
});

function publishOTA(machineId, firmwareUrl, version = "")
{
    return new Promise((resolve, reject) => {
        if (!client.connected)
        {
            reject(new Error("MQTT chưa kết nối"));
            return;
        }

        const topic = `wash/${machineId}/ota`;

        const payload = JSON.stringify({
            cmd: "ota",
            url: firmwareUrl,
            version: version
        });

        client.publish(topic, payload, { qos: 1 }, (error) => {
            if (error)
            {
                reject(error);
                return;
            }

            console.log("==================================");
            console.log("OTA command published");
            console.log("Machine:", machineId);
            console.log("Topic:", topic);
            console.log("Payload:", payload);
            console.log("==================================");

            resolve();
        });
    });
}

module.exports = {
    publishOTA
};