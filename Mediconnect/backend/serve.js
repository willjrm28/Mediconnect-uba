const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const http = require('http');
const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const db = require('./config/database');
const { asegurarEsquema } = require('./config/migrarEsquema');
const { verificarToken, verificarRol } = require('./middlewares/auth');
const { revisarRecetasPorVencer } = require('./jobs/revisarRecetas');
const { inicializarSockets } = require('./sockets');

const app = express();
const servidorHttp = http.createServer(app);
inicializarSockets(servidorHttp);

app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'frontend')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.get('/api/health', async (req, res) => {
  try {
    await db.query('SELECT 1');
    return res.status(200).json({ ok: true, mensaje: 'Servidor MediConnect funcionando' });
  } catch (error) {
    return res.status(503).json({ ok: false, error: 'Base de datos no disponible' });
  }
});

// Configuración WebRTC (STUN + TURN opcional desde variables de entorno).
app.get('/api/config/ice', verificarToken, (req, res) => {
  const iceServers = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ];

  if (process.env.TURN_URL) {
    const turn = { urls: process.env.TURN_URL };
    if (process.env.TURN_USERNAME) turn.username = process.env.TURN_USERNAME;
    if (process.env.TURN_CREDENTIAL) turn.credential = process.env.TURN_CREDENTIAL;
    iceServers.push(turn);
  }

  return res.status(200).json({ iceServers });
});

app.use('/api/auth', require('./routes/auth'));
app.use('/api/especialidades', require('./routes/especialidades'));
app.use('/api/medicos', require('./routes/medicos'));
app.use('/api/pacientes', require('./routes/pacientes'));
app.use('/api/citas', require('./routes/citas'));
app.use('/api/mensajes', require('./routes/mensajes'));
app.use('/api/alertas', require('./routes/alertas'));
app.use('/api/medicamentos', require('./routes/medicamentos'));
app.use('/api/diagnostico-flash', require('./routes/diagnosticoFlash'));

if (process.env.NODE_ENV !== 'production') {
  app.get(
    '/api/debug/ejecutar-revision-recetas',
    verificarToken,
    verificarRol('medico'),
    async (req, res) => {
      await revisarRecetasPorVencer();
      return res.status(200).json({ mensaje: 'Revisión de recetas por vencer ejecutada manualmente.' });
    }
  );
}

// Captura de JSON mal formado en peticiones POST/PUT
app.use((err, req, res, next) => {
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'El cuerpo de la petición no es un JSON válido.' });
  }
  return next(err);
});

cron.schedule('0 8 * * *', revisarRecetasPorVencer);

const PORT = Number(process.env.PORT) || 3000;

async function verificarConexionDB() {
  try {
    await db.query('SELECT 1');
    console.log('Conexión a la base de datos exitosa');
    await asegurarEsquema();
  } catch (error) {
    console.error('Error al conectar a la base de datos:', error.message);
  }
}

servidorHttp.listen(PORT, '0.0.0.0', async () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
  await verificarConexionDB();
});
