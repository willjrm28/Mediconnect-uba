const fs = require('fs');
const multer = require('multer');
const path = require('path');

const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const TIPOS_PERMITIDOS = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp'
};
const LIMITE_TAMANO_BYTES = 5 * 1024 * 1024;

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const sufijoUnico = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = TIPOS_PERMITIDOS[file.mimetype] || path.extname(file.originalname).toLowerCase() || '.jpg';
    cb(null, `${sufijoUnico}${ext}`);
  }
});

function fileFilter(req, file, cb) {
  if (!TIPOS_PERMITIDOS[file.mimetype]) {
    return cb(new Error('Solo se permiten imágenes en formato JPG, PNG o WebP.'));
  }
  cb(null, true);
}

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: LIMITE_TAMANO_BYTES }
});

module.exports = upload;
