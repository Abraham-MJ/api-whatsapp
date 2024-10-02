const express = require("express");
const router = express.Router();
const whatsappController = require("../controllers/whatsappController");

const multer = require("multer");
const upload = multer({ storage: multer.memoryStorage() });

router.get("/whatsapp-qrcode/:deviceId?", whatsappController.getQRCode);
router.post("/disconnect/:deviceId", whatsappController.disconnect);
router.get("/devices-active", whatsappController.getActiveDevices);
router.post("/send-message/:deviceId", whatsappController.sendMessage);
router.get("/user-info/:deviceId", whatsappController.getUserInfo);
router.post("/converter-image", whatsappController.converterImage);
router.post(
  "/converter-file",
  upload.single("file"),
  whatsappController.converterHTMLToJS
);
router.post(
  "/upload-image",
  upload.single("file"),
  whatsappController.uploadImagesAWS
);
router.post(
  "/edit-image-brand",
  upload.single("file"),
  whatsappController.editImagesBrand
);


module.exports = router;
