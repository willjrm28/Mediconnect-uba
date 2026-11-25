const express = require('express');
const router = express.Router();
const alertasController = require('../controllers/alertasController');
const { verificarToken, verificarRol } = require('../middlewares/auth');

router.post('/', verificarToken, verificarRol('medico'), alertasController.crear);
router.get('/', verificarToken, verificarRol('medico'), alertasController.listar);
router.put('/:id/resolver', verificarToken, verificarRol('medico'), alertasController.marcarResuelta);

module.exports = router;
