console.log("===== MQTT.JS LOADED =====");

const mqtt = require("mqtt");
const config = require("./config");

console.log("Starting MQTT connection...");
console.log("MQTT URL:", config.mqtt.host);

const otaStates = {};

const client = mqtt.connect(config.mqtt.host, {
    clientId:
        `OTA_SERVER_${Math.random()
            .toString(16)
            .slice(2, 10)}`,

    reconnectPeriod: 3000,
    connectTimeout: 10000
});

client.on("connect", () => {
    console.log("==================================");
    console.log("MQTT Connected");
    console.log("Broker:", config.mqtt.host);
    console.log("==================================");

    client.subscribe(
        "wash/+/ota_status",
        { qos: 0 },
        (error) => {
            if (error) {
                console.error(
                    "OTA status subscribe failed:",
                    error.message
                );

                return;
            }

            console.log(
                "Subscribed: wash/+/ota_status"
            );
        }
    );
});

client.on("message", (topic, payloadBuffer) => {
    try {
        const topicParts = topic.split("/");

        if (
            topicParts.length !== 3 ||
            topicParts[0] !== "wash" ||
            topicParts[2] !== "ota_status"
        ) {
            return;
        }

        const machineId =
            topicParts[1].toUpperCase();

        const payload =
            JSON.parse(payloadBuffer.toString());

        otaStates[machineId] = {
            machineId: machineId,
            status: payload.status || "unknown",
            version: payload.version || "",
            message: payload.message || "",

            progress:
                Number.isFinite(Number(payload.progress))
                    ? Number(payload.progress)
                    : null,

            updatedAt: new Date().toISOString(),
            lastSeenMs: Date.now()
        };

        console.log("==================================");
        console.log("OTA STATUS RECEIVED");
        console.log(otaStates[machineId]);
        console.log("==================================");
    }
    catch (error) {
        console.error(
            "Invalid OTA status payload:",
            error.message
        );
    }
});

client.on("reconnect", () => {
    console.log("MQTT reconnecting...");
});

client.on("error", (error) => {
    console.error("MQTT Error:", error.message);
});

client.on("offline", () => {
    console.log("MQTT Offline");
});

client.on("close", () => {
    console.log("MQTT Connection Closed");
});

function publishOTA(
    machineId,
    firmwareUrl,
    version = ""
) {
    return new Promise((resolve, reject) => {
        if (!client.connected) {
            reject(
                new Error("MQTT chưa kết nối")
            );

            return;
        }

        const topic =
            `wash/${machineId}/ota`;

        const payload = JSON.stringify({
            cmd: "ota",
            url: firmwareUrl,
            version: version
        });

        // Đặt trạng thái chờ ngay khi gửi lệnh
        otaStates[machineId] = {
            machineId: machineId,
            status: "command_sent",
            version: version,
            message: "Đã gửi lệnh OTA đến ESP32",
            updatedAt: new Date().toISOString()
        };

        client.publish(
            topic,
            payload,
            { qos: 1 },
            (error) => {
                if (error) {
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
            }
        );
    });
}

function getOTAStatus(machineId)
{
    const normalizedId =
        String(machineId)
            .trim()
            .toUpperCase();

    const state = otaStates[normalizedId];

    if (!state)
    {
        return null;
    }

    const OFFLINE_TIMEOUT_MS = 15000;

    const ageMs =
        Date.now() - state.lastSeenMs;

    const isOnline =
        ageMs <= OFFLINE_TIMEOUT_MS;

    return {
        ...state,
        isOnline: isOnline,
        ageMs: ageMs
    };
}

module.exports = {
    publishOTA,
    getOTAStatus
};

