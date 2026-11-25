const express = require('express');
const router = express.Router();
const diagnosticoFlashController = require('../controllers/diagnosticoFlashController');
const { verificarToken, verificarRol, verificarPropioDiagnostico } = require('../middlewares/auth');

router.post('/', verificarToken, verificarRol('paciente'), diagnosticoFlashController.iniciar);

router.get(
  '/:id_diagnostico_flash',
  verificarToken,
  verificarRol('paciente'),
  verificarPropioDiagnostico,
  diagnosticoFlashController.obtenerDetalle
);

router.post(
  '/:id_diagnostico_flash/mensajes',
  verificarToken,
  verificarRol('paciente'),
  verificarPropioDiagnostico,
  diagnosticoFlashController.enviarMensaje
);

router.get(
  '/:id_diagnostico_flash/mensajes',
  verificarToken,
  verificarRol('paciente'),
  verificarPropioDiagnostico,
  diagnosticoFlashController.listarMensajes
);

module.exports = router;
