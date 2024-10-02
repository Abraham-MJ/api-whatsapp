const whatsappService = require("../services/whatsappService");
const puppeteer = require("puppeteer");
const Jimp = require("jimp");
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
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
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

const truncate = (text) => (text.length > 24 ? text.slice(0, 23) : text);

exports.editImagesBrand = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No se ha subido ninguna imagen" });
    }

    const { nombre, numero, documento } = req.body;   
    const imageBuffer = req.file.buffer;

    const image = await Jimp.read(imageBuffer);
    const font = await Jimp.loadFont(Jimp.FONT_SANS_12_BLACK    );

    const offset = 40;
    const padding = 5;

    const containerWidth = 170;
    const containerHeight = 55;

    const containerX = image.bitmap.width - containerWidth - 13;
    const containerY = image.bitmap.height - offset - containerHeight + 3;

    image.scan(
      containerX,
      containerY,
      containerWidth,
      containerHeight,
      (x, y, idx) => {
        image.bitmap.data[idx] = 255;
        image.bitmap.data[idx + 1] = 255;
        image.bitmap.data[idx + 2] = 255;
        image.bitmap.data[idx + 3] = 255;
      }
    );

    const borderColor = { r: 170, g: 26, b: 24 };
    const borderWidth = 2;

    for (let i = 0; i < containerWidth; i++) {
      for (let j = 0; j < containerHeight; j++) {
        const isBorder =
          i < borderWidth ||
          i >= containerWidth - borderWidth ||
          j < borderWidth ||
          j >= containerHeight - borderWidth;

        if (isBorder) {
          const idx =
            ((containerY + j) * image.bitmap.width + (containerX + i)) * 4;
          image.bitmap.data[idx] = borderColor.r;
          image.bitmap.data[idx + 1] = borderColor.g;
          image.bitmap.data[idx + 2] = borderColor.b;
          image.bitmap.data[idx + 3] = 255;
        }
      }
    }

    const nombreTruncado = truncate(nombre);
    const numeroTruncado = truncate(numero);
    const documentoTruncado = truncate(documento);

    const yNombre = containerY;
    const yNumero = containerY + 18;
    const yDocumento = containerY + 36;

    image.print(font, containerX + padding, yNombre, nombreTruncado);
    image.print(font, containerX + padding, yNumero, numeroTruncado);
    image.print(font, containerX + padding, yDocumento, documentoTruncado);

    const fileName = `edited-image-${Date.now()}.png`;

    const params = {
      Bucket: process.env.AWS_BUCKET,
      Key: fileName,
      Body: await image.getBufferAsync(Jimp.MIME_PNG),
      ContentType: Jimp.MIME_PNG,
      ACL: "public-read",
    };

    await s3.putObject(params);

    const imageUrl = `https://${process.env.AWS_BUCKET}.s3.amazonaws.com/${fileName}`;
    res.json({ image: imageUrl });
  } catch (error) {
    res.status(500).json({
      error: "Error al editar la imagen",
      details: error.message,
    });
  }
};
