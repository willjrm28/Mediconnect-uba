const express = require('express');
const router = express.Router();
const medicamentosController = require('../controllers/medicamentosController');
const {
  verificarToken,
  verificarRol,
  verificarPropioOMedico,
  verificarPropioMedicamento,
  verificarPropioMedicamentoOMedico
} = require('../middlewares/auth');

router.post('/', verificarToken, verificarRol('medico'), medicamentosController.crear);

router.get(
  '/paciente/:id',
  verificarToken,
  verificarPropioOMedico,
  medicamentosController.listarPorPaciente
);

router.post(
  '/:id_medicamento/tomas',
  verificarToken,
  verificarRol('paciente'),
  verificarPropioMedicamento,
  medicamentosController.marcarToma
);

router.get(
  '/:id_medicamento/tomas',
  verificarToken,
  verificarPropioMedicamentoOMedico,
  medicamentosController.listarTomas
);

module.exports = router;
