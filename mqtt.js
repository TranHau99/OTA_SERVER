const mqtt = require("mqtt");
const config = require("./config");

const client = mqtt.connect(config.mqtt.host);

client.on("connect", () => {

    console.log("==================================");
    console.log(" MQTT Connected");
    console.log(" Broker :", config.mqtt.host);
    console.log("==================================");

});

client.on("error", (err) => {

    console.log("MQTT Error :", err.message);

});

function publishOTA(url)
{
    const msg =
    {
        cmd: "ota",
        url: url
    };

    client.publish(
        config.mqtt.topic_cmd,
        JSON.stringify(msg)
    );

    console.log("Publish OTA");
    console.log(msg);
}

module.exports =
{
    publishOTA
};