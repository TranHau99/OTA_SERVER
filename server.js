const express = require("express");
const path = require("path");

const config = require("./config");

// Khởi tạo Express
const app = express();

// Cho phép truy cập thư mục public
app.use(express.static(path.join(__dirname, "public")));

// Trang chủ
app.get("/", (req, res) => {

    res.sendFile(path.join(__dirname, "public", "index.html"));

});

// Khởi động Web Server
const PORT = process.env.PORT || config.web.port;

app.listen(PORT, () => {

    console.log("==================================");
    console.log("OTA SERVER START");
    console.log("Port:", PORT);
    console.log("==================================");

});