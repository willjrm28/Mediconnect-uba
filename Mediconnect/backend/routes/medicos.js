const express = require('express');
const router = express.Router();
const medicosController = require('../controllers/medicosController');
const { verificarToken } = require('../middlewares/auth');

router.get('/', verificarToken, medicosController.listar);

module.exports = router;
