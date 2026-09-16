// =========================================================
// helpers/archivos.js — Subida de archivos (S3 super plan).
// Multer con disco local en backend/uploads/<subcarpeta>.
// REGLAS (transversales, configurables por .env):
//   - Solo pdf e imagenes (lista en ADJUNTOS_TIPOS_MIME).
//   - Tope por archivo: ADJUNTOS_MAX_MB (default 10).
//   - Nombres unicos en disco; se guarda el original aparte.
//   - La carpeta NUNCA se sirve como estatico: solo descarga
//     por rutas con auth + rol (ver adjuntos.js/documentos.js).
// =========================================================

const multer = require('multer');
const path = require('path');
const fs = require('fs');

const BASE_DIR = path.join(__dirname, '..', process.env.UPLOADS_DIR || 'uploads');

const MIME_PERMITIDOS = (process.env.ADJUNTOS_TIPOS_MIME ||
    'application/pdf,image/jpeg,image/png,image/gif,image/webp').split(',').map((s) => s.trim());

const MAX_BYTES = Math.max(1, parseInt(process.env.ADJUNTOS_MAX_MB) || 10) * 1024 * 1024;

function fabricaUpload(subcarpeta, maxArchivos = 5) {
    const dir = path.join(BASE_DIR, subcarpeta);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const storage = multer.diskStorage({
        destination: (req, file, cb) => cb(null, dir),
        filename: (req, file, cb) => {
            const ext = path.extname(file.originalname || '').toLowerCase().slice(0, 10);
            const unico = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
            cb(null, unico);
        }
    });

    return multer({
        storage,
        limits: { fileSize: MAX_BYTES, files: maxArchivos },
        fileFilter: (req, file, cb) => {
            if (MIME_PERMITIDOS.includes(file.mimetype)) return cb(null, true);
            const error = new Error(`Tipo no permitido: ${file.mimetype || 'desconocido'}. Solo PDF e imagenes.`);
            error.status = 400;
            cb(error);
        }
    });
}

// Resuelve una ruta guardada en BD contra BASE_DIR evitando
// path traversal (retorna null si se sale de la base).
function rutaSegura(rutaGuardada) {
    if (!rutaGuardada) return null;
    const abs = path.resolve(BASE_DIR, '.' + path.sep + rutaGuardada);
    if (!abs.startsWith(path.resolve(BASE_DIR) + path.sep)) return null;
    if (!fs.existsSync(abs)) return null;
    return abs;
}

module.exports = { BASE_DIR, MAX_BYTES, MIME_PERMITIDOS, fabricaUpload, rutaSegura };
