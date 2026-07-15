console.log("===== MQTT.JS LOADED =====");

const mqtt = require("mqtt");
const config = require("./config");

console.log("Starting MQTT connection...");
console.log("MQTT URL:", config.mqtt.host);

const otaStates = {};

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

client.on("message", (topic, payloadBuffer) => {
    try {
        const topicParts = topic.split("/");
        if (topicParts.length !== 3 || topicParts[0] !== "wash" || topicParts[2] !== "ota_status") return;

        const machineId = topicParts[1].toUpperCase();
        const payload = JSON.parse(payloadBuffer.toString());

        otaStates[machineId] = {
            machineId,
            status: payload.status || "unknown",
            version: payload.version || "",
            message: payload.message || "",
            progress: Number.isFinite(Number(payload.progress)) ? Number(payload.progress) : null,
            updatedAt: new Date().toISOString(),
            lastSeenMs: Date.now()
        };

        console.log("==================================");
        console.log("OTA STATUS RECEIVED");
        console.log(otaStates[machineId]);
        console.log("==================================");
    } catch (error) {
        console.error("Invalid OTA status payload:", error.message);
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

function deleteMachine(machineId) {
    const normalizedId = String(machineId || "").trim().toUpperCase();
    if (!normalizedId || !otaStates[normalizedId]) return false;
    delete otaStates[normalizedId];
    console.log("MACHINE REMOVED:", normalizedId);
    return true;
}

module.exports = { publishOTA, getOTAStatus, getAllMachines, deleteMachine };
