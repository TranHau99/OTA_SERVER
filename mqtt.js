console.log("===== MQTT.JS LOADED =====");

const mqtt = require("mqtt");
const config = require("./config");

console.log("Starting MQTT connection...");
console.log("MQTT URL:", config.mqtt.host);

const otaStates = {};
const machineData = {};
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

    client.subscribe("wash/+/ota_status", { qos: 0 }, (error) => {
        if (error) {
            console.error("OTA status subscribe failed:", error.message);
            return;
        }
        console.log("Subscribed: wash/+/ota_status");
    });
});
client.subscribe(
    "wash/+/data",
    { qos: 0 },
    (error) => {
        if (error)
        {
            console.error(
                "Machine data subscribe failed:",
                error.message
            );

            return;
        }

        console.log("Subscribed: wash/+/data");
    }
);
client.on("message", (topic, payloadBuffer) => {
    try
    {
        const topicParts = topic.split("/");

        if (
            topicParts.length !== 3 ||
            topicParts[0] !== "wash"
        )
        {
            return;
        }

        const machineId =
            topicParts[1].toUpperCase();

        const messageType =
            topicParts[2];

        const payload =
            JSON.parse(payloadBuffer.toString());

        // =====================================
        // TRẠNG THÁI OTA
        // wash/<MachineID>/ota_status
        // =====================================
        if (messageType === "ota_status")
        {
            otaStates[machineId] = {
                machineId: machineId,
                status: payload.status || "unknown",
                version: payload.version || "",
                message: payload.message || "",
                progress:
                    Number.isFinite(Number(payload.progress))
                        ? Number(payload.progress)
                        : null,
                updatedAt: new Date().toISOString()
            };

            console.log("==================================");
            console.log("OTA STATUS RECEIVED");
            console.log(otaStates[machineId]);
            console.log("==================================");

            return;
        }

        // =====================================
        // DỮ LIỆU DASHBOARD
        // wash/<MachineID>/data
        // =====================================
        if (messageType === "data")
        {
            machineData[machineId] = {
                machineId: machineId,

                firmware:
                    String(payload.firmware || ""),

                currentWeight:
                    Number(payload.currentWeight ?? payload.weight ?? 0),

                lastPetWeight:
                    Number(payload.lastPetWeight ?? 0),

                toiletCountToday:
                    Number(
                        payload.toiletCountToday ??
                        payload.toiletCount ??
                        0
                    ),

                temperature:
                    Number(payload.temperature ?? 0),

                mode:
                    Number(payload.mode ?? 0),

                error:
                    Number(payload.error ?? 0),

                wifiRssi:
                    Number(payload.wifiRssi ?? 0),

                uptime:
                    Number(payload.uptime ?? 0),

                systemLock:
                    Boolean(payload.systemLock),

                stopWash:
                    Boolean(payload.stopWash),

                faultLock:
                    Boolean(payload.faultLock),

                updatedAt:
                    new Date().toISOString()
            };

            console.log("==================================");
            console.log("MACHINE DATA RECEIVED");
            console.log(machineData[machineId]);
            console.log("==================================");

            return;
        }
    }
    catch (error)
    {
        console.error(
            "Invalid MQTT payload:",
            error.message
        );
    }
});

client.on("reconnect", () => console.log("MQTT reconnecting..."));
client.on("error", error => console.error("MQTT Error:", error.message));
client.on("offline", () => console.log("MQTT Offline"));
client.on("close", () => console.log("MQTT Connection Closed"));

function publishOTA(machineId, firmwareUrl, version = "") {
    return new Promise((resolve, reject) => {
        if (!client.connected) {
            reject(new Error("MQTT chưa kết nối"));
            return;
        }

        const normalizedId = String(machineId || "").trim().toUpperCase();
        const topic = `wash/${normalizedId}/ota`;
        const payload = JSON.stringify({ cmd: "ota", url: firmwareUrl, version });
        const previousState = otaStates[normalizedId] || {};

        otaStates[normalizedId] = {
            ...previousState,
            machineId: normalizedId,
            status: "command_sent",
            version,
            message: "Đã gửi lệnh OTA đến ESP32",
            progress: 0,
            updatedAt: previousState.updatedAt || new Date().toISOString(),
            lastSeenMs: previousState.lastSeenMs || 0
        };

        client.publish(topic, payload, { qos: 1 }, error => {
            if (error) {
                reject(error);
                return;
            }
            console.log("==================================");
            console.log("OTA command published");
            console.log("Machine:", normalizedId);
            console.log("Topic:", topic);
            console.log("Payload:", payload);
            console.log("==================================");
            resolve();
        });
    });
}

function calculateState(state) {
    const OFFLINE_TIMEOUT_MS = 15000;
    const lastSeenMs = Number(state.lastSeenMs) || new Date(state.updatedAt).getTime();
    const ageMs = Number.isFinite(lastSeenMs) ? Math.max(0, Date.now() - lastSeenMs) : Number.POSITIVE_INFINITY;
    return { ...state, ageMs, isOnline: ageMs <= OFFLINE_TIMEOUT_MS };
}

function getOTAStatus(machineId) {
    const state = otaStates[String(machineId || "").trim().toUpperCase()];
    return state ? calculateState(state) : null;
}

function getAllMachines() {
    return Object.values(otaStates)
        .map(calculateState)
        .sort((a, b) => a.isOnline !== b.isOnline ? (a.isOnline ? -1 : 1) : a.machineId.localeCompare(b.machineId));
}

function deleteMachine(machineId)
{
    return new Promise((resolve, reject) => {
        const normalizedId =
            String(machineId || "")
                .trim()
                .toUpperCase();

        if (!normalizedId)
        {
            reject(
                new Error("Machine ID không hợp lệ")
            );

            return;
        }

        const topic =
            `wash/${normalizedId}/ota_status`;

        // Payload rỗng + retain=true:
        // xóa retained message cũ trên MQTT broker
        client.publish(
            topic,
            Buffer.alloc(0),
            {
                qos: 1,
                retain: true
            },
            (error) => {
                if (error)
                {
                    reject(error);
                    return;
                }

                // Xóa khỏi RAM của server
                delete otaStates[normalizedId];

                console.log("==================================");
                console.log("MACHINE REMOVED");
                console.log("Machine:", normalizedId);
                console.log("Retained MQTT cleared:", topic);
                console.log("==================================");

                resolve(true);
            }
        );
    });
}
function getMachineData(machineId)
{
    return machineData[
        String(machineId)
            .trim()
            .toUpperCase()
    ] || null;
}
module.exports = {
    publishOTA,
    getOTAStatus,
    getAllMachines,
    getMachineData,
    deleteMachine
};
