const express = require('express');
const router = express.Router();
const citasController = require('../controllers/citasController');
const { verificarToken, verificarRol } = require('../middlewares/auth');

router.post('/', verificarToken, verificarRol(['medico', 'paciente']), citasController.crear);
router.get('/', verificarToken, verificarRol(['medico', 'paciente']), citasController.listar);
router.put('/:id/estado', verificarToken, verificarRol(['medico', 'paciente']), citasController.actualizarEstado);

module.exports = router;
