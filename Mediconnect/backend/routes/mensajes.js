const express = require('express');
const router = express.Router();
const mensajesController = require('../controllers/mensajesController');
const { verificarToken, verificarRol } = require('../middlewares/auth');

router.post('/', verificarToken, verificarRol(['medico', 'paciente']), mensajesController.enviar);
router.get('/no-leidos', verificarToken, verificarRol(['medico', 'paciente']), mensajesController.contarNoLeidos);
router.get('/conversaciones', verificarToken, verificarRol(['medico', 'paciente']), mensajesController.listarConversaciones);

router.get(
  '/:id_paciente/:id_medico',
  verificarToken,
  verificarRol(['medico', 'paciente']),
  mensajesController.listarConversacion
);

router.put(
  '/:id_paciente/:id_medico/leidos',
  verificarToken,
  verificarRol(['medico', 'paciente']),
  mensajesController.marcarLeidos
);

module.exports = router;
