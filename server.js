const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const config = require("./config");
const { publishOTA } = require("./mqtt");
console.log("server.js loaded mqtt.js");
const app = express();

const PUBLIC_DIR = path.join(__dirname, "public");
const UPLOAD_DIR = path.join(__dirname, "uploads");

// Tự tạo thư mục uploads nếu chưa tồn tại
if (!fs.existsSync(UPLOAD_DIR))
{
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Cho phép trình duyệt mở giao diện web
app.use(express.static(PUBLIC_DIR));

// Cho phép ESP32 tải file trong thư mục uploads
app.use("/uploads", express.static(UPLOAD_DIR));

// Cấu hình lưu file firmware
const storage = multer.diskStorage({
    destination: function (req, file, callback)
    {
        callback(null, UPLOAD_DIR);
    },

    filename: function (req, file, callback)
    {
        // Tạm thời luôn lưu thành firmware.bin
        callback(null, config.firmware.filename);
    }
});

const upload = multer({
    storage: storage,

    limits: {
        // Cho phép tối đa 4 MB
        fileSize: 4 * 1024 * 1024
    },

    fileFilter: function (req, file, callback)
    {
        const extension = path.extname(file.originalname).toLowerCase();

        if (extension !== ".bin")
        {
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

// API upload firmware và gửi MQTT
app.post("/api/update", upload.single("firmware"), async (req, res) => {
    try
    {
        const machineId = String(req.body.machineId || "")
            .trim()
            .toUpperCase();

        const version = String(req.body.version || "").trim();

        if (!machineId)
        {
            return res.status(400).json({
                success: false,
                message: "Machine ID không được để trống"
            });
        }

        // Chỉ chấp nhận chữ, số, dấu gạch dưới và gạch ngang
        if (!/^[A-Z0-9_-]+$/.test(machineId))
        {
            return res.status(400).json({
                success: false,
                message: "Machine ID không hợp lệ"
            });
        }

        if (!req.file)
        {
            return res.status(400).json({
                success: false,
                message: "Chưa chọn firmware.bin"
            });
        }

        // Render cung cấp hostname thật trong request
        const protocol = req.get("x-forwarded-proto") || req.protocol;
        const host = req.get("host");

        const firmwareUrl =
            `${protocol}://${host}/uploads/${config.firmware.filename}`;

        await publishOTA(machineId, firmwareUrl, version);

        return res.json({
            success: true,
            message: `Đã gửi lệnh OTA đến ${machineId}`,
            machineId: machineId,
            firmwareUrl: firmwareUrl,
            version: version
        });
    }
    catch (error)
    {
        console.error("Update error:", error);

        return res.status(500).json({
            success: false,
            message: error.message || "Không thể gửi lệnh OTA"
        });
    }
});

// Xử lý lỗi Multer và lỗi upload
app.use((error, req, res, next) => {
    console.error("Server error:", error);

    if (error instanceof multer.MulterError)
    {
        return res.status(400).json({
            success: false,
            message: `Lỗi upload: ${error.message}`
        });
    }

    return res.status(400).json({
        success: false,
        message: error.message || "Có lỗi xảy ra"
    });
});

const PORT = process.env.PORT || config.web.port;

app.listen(PORT, "0.0.0.0", () => {
    console.log("==================================");
    console.log("OTA SERVER START");
    console.log("Port:", PORT);
    console.log("==================================");
});