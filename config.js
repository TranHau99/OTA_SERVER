module.exports = {

    //==========================
    // MQTT
    //==========================
    mqtt: {

        host: "mqtt://broker.hivemq.com:1883",

        port: 1883,

        topic_cmd: "wash/cmd",

        topic_status: "wash/status"

    },

    //==========================
    // WEB SERVER
    //==========================
    web: {

        port: 3000

    },

    //==========================
    // Firmware
    //==========================
    firmware: {

        filename: "firmware.bin"

    }

};