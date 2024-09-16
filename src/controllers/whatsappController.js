const whatsappService = require("../services/whatsappService");
const puppeteer = require("puppeteer");
const { S3 } = require("@aws-sdk/client-s3");
require("dotenv").config();

const s3 = new S3({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

exports.getQRCode = async (req, res) => {
  const { deviceId } = req.params;
  const userID = deviceId || whatsappService.generateUniqueDeviceID();
  try {
    const result = await whatsappService.connectOrReconnect(userID);
    res.send(result);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error al iniciar la conexión", error: error });
  }
};

exports.disconnect = async (req, res) => {
  const { deviceId } = req.params;
  const result = await whatsappService.disconnectDevice(deviceId);
  res.send(result);
};

exports.getActiveDevices = async (req, res) => {
  try {
    const devices = await whatsappService.getActiveDevices();
    res.json(devices);
  } catch (error) {
    res.status(500).json({ error: "Error al obtener dispositivos activos" });
  }
};

exports.sendMessage = async (req, res) => {
  const { deviceId } = req.params;
  const { numero, mensaje, imagen } = req.body;

  try {
    const result = await whatsappService.sendMessage(
      deviceId,
      numero,
      mensaje,
      imagen
    );
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getUserInfo = async (req, res) => {
  const { deviceId } = req.params;
  try {
    const userInfo = await whatsappService.getUserInfo(deviceId);
    res.json(userInfo);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.converterImage = async (req, res) => {
  const { htmlContent } = req.body;

  if (!htmlContent) {
    return res.status(400).json({ error: "Se requiere contenido HTML" });
  }

  try {
    const browser = await puppeteer.launch({
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    const page = await browser.newPage();
    await page.setContent(htmlContent, { waitUntil: "networkidle0" });
    const imageBuffer = await page.screenshot({
      fullPage: false,
      clip: {
        x: 0,
        y: 0,
        width: 450,
        height: 650,
      },
    });

    await browser.close();

    const fileName = `image-${Date.now()}.png`;

    const params = {
      Bucket: process.env.AWS_BUCKET,
      Key: fileName,
      Body: imageBuffer,
      ContentType: "image/png",
      ACL: "public-read",
    };

    await s3.putObject(params);

    const imageUrl = `https://${process.env.AWS_BUCKET}.s3.amazonaws.com/${fileName}`;
    res.json({ image: imageUrl });
  } catch (error) {
    res.status(500).json({
      error: "Error al convertir HTML a imagen",
      details: error.message,
    });
  }
};

exports.converterHTMLToJS = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No se ha subido ningún archivo" });
    }

    const htmlString = req.file.buffer.toString("utf-8");

    const jsonResult = {
      htmlContent: htmlString,
    };

    res.json(jsonResult);
  } catch (error) {
    console.error("Error al procesar el archivo:", error);
    res
      .status(500)
      .json({ error: "Error al procesar el archivo", details: error.message });
  }
};

exports.uploadImagesAWS = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No se ha subido ninguna imagen" });
    }

    const fileName = `image-${Date.now()}.png`;

    const params = {
      Bucket: process.env.AWS_BUCKET,
      Key: fileName,
      Body: req.file.buffer,
      ContentType: req.file.mimetype,
      ACL: "public-read",
    };

    await s3.putObject(params);

    const imageUrl = `https://${process.env.AWS_BUCKET}.s3.amazonaws.com/${fileName}`;
    res.json({ image: imageUrl });
  } catch (error) {
    res.status(500).json({
      error: "Error al subir la imagen a AWS",
      details: error.message,
    });
  }
};
