const express = require('express');
const router = express.Router();
const pacientesController = require('../controllers/pacientesController');
const { verificarToken, verificarRol, verificarPropioOMedico } = require('../middlewares/auth');
const upload = require('../middlewares/upload');
const db = require('../config/database');

function manejarErrorSubida(err, req, res, next) {
  if (err) {
    return res.status(400).json({ error: err.message || 'Error al subir el archivo.' });
  }
  next();
}

async function verificarPropiaOrdenLaboratorio(req, res, next) {
  const { id_resultado } = req.params;

  try {
    const [filas] = await db.query(
      'SELECT id_paciente FROM resultados_laboratorio WHERE id = ?',
      [id_resultado]
    );
    if (filas.length === 0) {
      return res.status(404).json({ error: 'Orden de laboratorio no encontrada.' });
    }

    if (Number(filas[0].id_paciente) !== Number(req.usuario.id)) {
      return res.status(403).json({ error: 'Esta orden de laboratorio no te pertenece.' });
    }

    next();
  } catch (error) {
    console.error('Error al verificar la orden de laboratorio:', error);
    return res.status(500).json({ error: 'Error del servidor al verificar la orden de laboratorio.' });
  }
}

router.get('/', verificarToken, verificarRol('medico'), pacientesController.listar);
router.get('/:id', verificarToken, verificarPropioOMedico, pacientesController.obtenerPerfil);
router.put('/:id', verificarToken, verificarPropioOMedico, pacientesController.actualizarPerfil);

router.get('/:id/alergias', verificarToken, verificarPropioOMedico, pacientesController.listarAlergias);
router.post('/:id/alergias', verificarToken, verificarPropioOMedico, pacientesController.agregarAlergia);
router.delete('/:id/alergias/:id_alergia', verificarToken, verificarPropioOMedico, pacientesController.eliminarAlergia);

router.get(
  '/:id/antecedentes-familiares',
  verificarToken,
  verificarPropioOMedico,
  pacientesController.listarAntecedentes
);
router.post(
  '/:id/antecedentes-familiares',
  verificarToken,
  verificarPropioOMedico,
  pacientesController.agregarAntecedente
);
router.delete(
  '/:id/antecedentes-familiares/:id_antecedente',
  verificarToken,
  verificarPropioOMedico,
  pacientesController.eliminarAntecedente
);

router.get('/:id/laboratorio', verificarToken, verificarPropioOMedico, pacientesController.listarLaboratorio);
router.post('/:id/laboratorio', verificarToken, verificarRol('medico'), pacientesController.crearOrdenLaboratorio);
router.put(
  '/laboratorio/:id_resultado',
  verificarToken,
  verificarRol('paciente'),
  verificarPropiaOrdenLaboratorio,
  upload.single('foto_evidencia'),
  manejarErrorSubida,
  pacientesController.completarOrdenLaboratorio
);

router.get('/:id/historial', verificarToken, verificarPropioOMedico, pacientesController.listarHistorial);
router.post('/:id/historial', verificarToken, verificarRol('medico'), pacientesController.agregarHistorial);

router.get('/:id/indicaciones', verificarToken, verificarPropioOMedico, pacientesController.listarIndicaciones);
router.post('/:id/indicaciones', verificarToken, verificarRol('medico'), pacientesController.agregarIndicacion);

router.get(
  '/:id/signos-vitales',
  verificarToken,
  verificarPropioOMedico,
  pacientesController.listarSignosVitales
);
router.post(
  '/:id/signos-vitales',
  verificarToken,
  verificarPropioOMedico,
  upload.single('foto_evidencia'),
  manejarErrorSubida,
  pacientesController.agregarSignosVitales
);

module.exports = router;
