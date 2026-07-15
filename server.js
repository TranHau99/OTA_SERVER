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

console.log("server.js loaded mqtt.js");
const app = express();

const PUBLIC_DIR = path.join(__dirname, "public");
const UPLOAD_DIR = path.join(__dirname, "uploads");

// Tự tạo thư mục uploads nếu chưa tồn tại
if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Cho phép trình duyệt mở giao diện web
app.use(express.static(PUBLIC_DIR));

// Cho phép ESP32 tải file trong thư mục uploads
app.use("/uploads", express.static(UPLOAD_DIR));

// Cấu hình lưu file firmware
const upload = multer({
    storage: multer.memoryStorage(),

    limits: {
        fileSize: 4 * 1024 * 1024
    },

    fileFilter: function (req, file, callback) {
        const extension =
            path.extname(file.originalname).toLowerCase();

        if (extension !== ".bin") {
            callback(new Error("Chỉ cho phép file .bin"));
            return;
        }

        callback(null, true);
    }
});





// Trang chủ
app.get("/", (req, res) => {
    res.sendFile(path.join(PUBLIC_DIR, "index.html"));
});

app.get("/api/ota-status/:machineId", (req, res) => {
    res.set({
    "Cache-Control": "no-store, no-cache, must-revalidate, private",
    "Pragma": "no-cache",
    "Expires": "0"
});
    const machineId =
        String(req.params.machineId || "")
            .trim()
            .toUpperCase();

    const status = getOTAStatus(machineId);

    if (!status) {
        return res.json({
            success: true,
            found: false,
            machineId: machineId,
            status: "waiting",
            message: "Chưa nhận được trạng thái từ thiết bị"
        });
    }

    return res.json({
        success: true,
        found: true,
        ...status,

        connectionStatus:
            status.isOnline
                ? "online"
                : "offline"
    });
});

app.get("/api/machines", (req, res) => {
    res.set({
        "Cache-Control": "no-store, no-cache, must-revalidate, private",
        "Pragma": "no-cache",
        "Expires": "0"
    });

    const machines = getAllMachines();

    return res.json({
        success: true,
        total: machines.length,
        online: machines.filter(machine => machine.isOnline).length,
        offline: machines.filter(machine => !machine.isOnline).length,
        machines: machines
    });
});

app.delete("/api/machines/:machineId", (req, res) => {
    const machineId =
        String(req.params.machineId || "")
            .trim()
            .toUpperCase();

    if (!machineId)
    {
        return res.status(400).json({
            success: false,
            message: "Machine ID không hợp lệ"
        });
    }

    const deleted =
        deleteMachine(machineId);

    if (!deleted)
    {
        return res.status(404).json({
            success: false,
            message: "Không tìm thấy thiết bị"
        });
    }

    return res.json({
        success: true,
        machineId: machineId,
        message: `Đã xóa thiết bị ${machineId}`
    });
});
// API upload firmware và gửi MQTT
app.post("/api/update", upload.single("firmware"), async (req, res) => {
    let savedFilePath = "";

    try {
        const machineId = String(req.body.machineId || "")
            .trim()
            .toUpperCase();

        const version = String(req.body.version || "")
            .trim();

        // ==============================
        // Kiểm tra Machine ID
        // ==============================
        if (!machineId) {
            return res.status(400).json({
                success: false,
                message: "Machine ID không được để trống"
            });
        }

        if (!/^[A-Z0-9_-]+$/.test(machineId)) {
            return res.status(400).json({
                success: false,
                message: "Machine ID không hợp lệ"
            });
        }

        // ==============================
        // Kiểm tra Version
        // ==============================
        if (!version) {
            return res.status(400).json({
                success: false,
                message: "Phiên bản firmware không được để trống"
            });
        }

        // ==============================
        // Kiểm tra file
        // ==============================
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: "Chưa chọn firmware.bin"
            });
        }

        // Làm sạch chuỗi version để dùng trong tên file
        const safeVersion =
            version.replace(/[^a-zA-Z0-9._-]/g, "_");

        // ==============================
        // Tạo tên file riêng
        // ==============================
        const timestamp = Date.now();

        const firmwareFilename =
            `${machineId}_${safeVersion}_${timestamp}.bin`;

        savedFilePath =
            path.join(UPLOAD_DIR, firmwareFilename);

        // Vì upload đang dùng memoryStorage,
        // phải tự ghi buffer xuống file
        fs.writeFileSync(
            savedFilePath,
            req.file.buffer
        );

        console.log("==================================");
        console.log("Firmware saved");
        console.log("Machine:", machineId);
        console.log("Version:", version);
        console.log("Filename:", firmwareFilename);
        console.log("Size:", req.file.size, "bytes");
        console.log("==================================");

        // ==============================
        // Tạo URL tải firmware
        // ==============================
        const protocol =
            req.get("x-forwarded-proto") ||
            req.protocol;

        const host = req.get("host");

        const firmwareUrl =
            `${protocol}://${host}/uploads/${firmwareFilename}`;

        // ==============================
        // Gửi lệnh MQTT
        // ==============================
        await publishOTA(
            machineId,
            firmwareUrl,
            version
        );

        return res.json({
            success: true,
            message: `Đã gửi lệnh OTA đến ${machineId}`,
            machineId: machineId,
            version: version,
            filename: firmwareFilename,
            firmwareUrl: firmwareUrl
        });
    }
    catch (error) {
        console.error("Update error:", error);
        console.error(error.stack);

        // Nếu gửi MQTT lỗi thì xóa file vừa lưu
        if (
            savedFilePath &&
            fs.existsSync(savedFilePath)
        ) {
            fs.unlinkSync(savedFilePath);
        }

        return res.status(500).json({
            success: false,
            message:
                error.message ||
                "Không thể gửi lệnh OTA"
        });
    }
});

// Xử lý lỗi Multer và lỗi upload
app.use((error, req, res, next) => {
    console.error("Server error:", error);

    if (error instanceof multer.MulterError) {
        return res.status(400).json({
            success: false,
            message: `Lỗi upload: ${error.message}`
        });
    }

    return res.status(400).json({
        success: false,
        message:
            error.message ||
            "Có lỗi xảy ra"
    });
});

const PORT = process.env.PORT || config.web.port;

app.listen(PORT, "0.0.0.0", () => {
    console.log("==================================");
    console.log("OTA SERVER START");
    console.log("Port:", PORT);
    console.log("==================================");
});