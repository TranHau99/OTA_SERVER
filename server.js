const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const config = require("./config");
const {
    publishOTA,
    getOTAStatus,
    getAllMachines,
    deleteMachine
} = require("./mqtt");

const app = express();
const PUBLIC_DIR = path.join(__dirname, "public");
const UPLOAD_DIR = path.join(__dirname, "uploads");

if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

app.use(express.static(PUBLIC_DIR));
app.use("/uploads", express.static(UPLOAD_DIR));

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 4 * 1024 * 1024 },
    fileFilter(req, file, callback) {
        if (path.extname(file.originalname).toLowerCase() !== ".bin") {
            callback(new Error("Chỉ cho phép file .bin"));
            return;
        }
        callback(null, true);
    }
});

function disableCache(res) {
    res.set({
        "Cache-Control": "no-store, no-cache, must-revalidate, private",
        "Pragma": "no-cache",
        "Expires": "0"
    });
}

app.get("/", (req, res) => res.sendFile(path.join(PUBLIC_DIR, "index.html")));

app.get("/api/ota-status/:machineId", (req, res) => {
    disableCache(res);
    const machineId = String(req.params.machineId || "").trim().toUpperCase();
    const status = getOTAStatus(machineId);
    if (!status) return res.json({ success: true, found: false, machineId, status: "waiting", message: "Chưa nhận được trạng thái từ thiết bị" });
    return res.json({ success: true, found: true, ...status, connectionStatus: status.isOnline ? "online" : "offline" });
});

app.get("/api/machines", (req, res) => {
    disableCache(res);
    const machines = getAllMachines();
    return res.json({
        success: true,
        total: machines.length,
        online: machines.filter(machine => machine.isOnline).length,
        offline: machines.filter(machine => !machine.isOnline).length,
        machines
    });
});

app.delete(
    "/api/machines/:machineId",
    async (req, res) => {
        try
        {
            const machineId =
                String(
                    req.params.machineId || ""
                )
                    .trim()
                    .toUpperCase();

            if (!machineId)
            {
                return res
                    .status(400)
                    .json({
                        success: false,
                        message:
                            "Machine ID không hợp lệ"
                    });
            }

            await deleteMachine(machineId);

            return res.json({
                success: true,
                machineId: machineId,
                message:
                    `Đã xóa thiết bị ${machineId} và retained MQTT`
            });
        }
        catch (error)
        {
            console.error(
                "Delete machine error:",
                error
            );

            return res
                .status(500)
                .json({
                    success: false,
                    message:
                        error.message ||
                        "Không thể xóa thiết bị"
                });
        }
    }
);

app.post("/api/update", upload.single("firmware"), async (req, res) => {
    let savedFilePath = "";
    try {
        const otaPassword = String(req.body.otaPassword || "");
        if (!config.security?.otaPassword) return res.status(500).json({ success: false, message: "Server chưa được cấu hình mật khẩu OTA" });
        if (otaPassword !== config.security.otaPassword) return res.status(401).json({ success: false, message: "Mật khẩu OTA không đúng" });

        const machineId = String(req.body.machineId || "").trim().toUpperCase();
        const version = String(req.body.version || "").trim();

        if (!machineId) return res.status(400).json({ success: false, message: "Machine ID không được để trống" });
        if (!/^[A-Z0-9_-]+$/.test(machineId)) return res.status(400).json({ success: false, message: "Machine ID không hợp lệ" });
        if (!version) return res.status(400).json({ success: false, message: "Phiên bản firmware không được để trống" });
        if (!req.file) return res.status(400).json({ success: false, message: "Chưa chọn firmware.bin" });

        const safeVersion = version.replace(/[^a-zA-Z0-9._-]/g, "_");
        const firmwareFilename = `${machineId}_${safeVersion}_${Date.now()}.bin`;
        savedFilePath = path.join(UPLOAD_DIR, firmwareFilename);
        fs.writeFileSync(savedFilePath, req.file.buffer);

        const protocol = req.get("x-forwarded-proto") || req.protocol;
        const host = req.get("host");
        const firmwareUrl = `${protocol}://${host}/uploads/${firmwareFilename}`;

        await publishOTA(machineId, firmwareUrl, version);

        return res.json({ success: true, message: `Đã gửi lệnh OTA đến ${machineId}`, machineId, version, filename: firmwareFilename, firmwareUrl });
    } catch (error) {
        console.error("Update error:", error);
        if (savedFilePath && fs.existsSync(savedFilePath)) fs.unlinkSync(savedFilePath);
        return res.status(500).json({ success: false, message: error.message || "Không thể gửi lệnh OTA" });
    }
});

app.use((error, req, res, next) => {
    console.error("Server error:", error);
    if (error instanceof multer.MulterError) return res.status(400).json({ success: false, message: `Lỗi upload: ${error.message}` });
    return res.status(400).json({ success: false, message: error.message || "Có lỗi xảy ra" });
});

const PORT = process.env.PORT || config.web.port;
app.listen(PORT, "0.0.0.0", () => {
    console.log("==================================");
    console.log("PET WASH OTA SERVER START");
    console.log("Port:", PORT);
    console.log("==================================");
});
