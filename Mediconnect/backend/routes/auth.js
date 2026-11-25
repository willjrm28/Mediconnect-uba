const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

router.post('/registro-paciente', authController.registrarPaciente);
router.post('/registro-medico', authController.registrarMedico);
router.post('/login-paciente', authController.loginPaciente);
router.post('/login-medico', authController.loginMedico);

module.exports = router;
