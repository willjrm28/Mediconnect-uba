const jwt = require('jsonwebtoken');
const db = require('../config/database');

function verificarToken(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token no proporcionado.' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.usuario = { id: payload.id, rol: payload.rol };
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Token inválido o expirado.' });
  }
}

function verificarRol(rolesPermitidos) {
  const roles = Array.isArray(rolesPermitidos) ? rolesPermitidos : [rolesPermitidos];

  return (req, res, next) => {
    if (!roles.includes(req.usuario.rol)) {
      return res.status(403).json({ error: 'Acceso denegado para tu rol.' });
    }
    next();
  };
}

function verificarPropioOMedico(req, res, next) {
  if (req.usuario.rol === 'medico') {
    return next();
  }

  if (String(req.usuario.id) !== String(req.params.id)) {
    return res.status(403).json({ error: 'Solo puedes acceder a tu propio perfil.' });
  }

  next();
}

async function verificarPropioMedicamento(req, res, next) {
  const { id_medicamento } = req.params;

  try {
    const [medicamentos] = await db.query(
      'SELECT id_paciente FROM medicamentos WHERE id = ?',
      [id_medicamento]
    );
    if (medicamentos.length === 0) {
      return res.status(404).json({ error: 'Medicamento no encontrado.' });
    }

    if (String(medicamentos[0].id_paciente) !== String(req.usuario.id)) {
      return res.status(403).json({ error: 'Este medicamento no te pertenece.' });
    }

    next();
  } catch (error) {
    console.error('Error al verificar el medicamento:', error);
    return res.status(500).json({ error: 'Error del servidor al verificar el medicamento.' });
  }
}

function verificarPropioMedicamentoOMedico(req, res, next) {
  if (req.usuario.rol === 'medico') {
    return next();
  }

  return verificarPropioMedicamento(req, res, next);
}

async function verificarPropioDiagnostico(req, res, next) {
  const { id_diagnostico_flash } = req.params;

  try {
    const [diagnosticos] = await db.query(
      'SELECT id_paciente FROM diagnosticos_flash WHERE id = ?',
      [id_diagnostico_flash]
    );
    if (diagnosticos.length === 0) {
      return res.status(404).json({ error: 'Diagnóstico Flash no encontrado.' });
    }

    if (String(diagnosticos[0].id_paciente) !== String(req.usuario.id)) {
      return res.status(403).json({ error: 'Este Diagnóstico Flash no te pertenece.' });
    }

    next();
  } catch (error) {
    console.error('Error al verificar el Diagnóstico Flash:', error);
    return res.status(500).json({ error: 'Error del servidor al verificar el Diagnóstico Flash.' });
  }
}

module.exports = {
  verificarToken,
  verificarRol,
  verificarPropioOMedico,
  verificarPropioMedicamento,
  verificarPropioMedicamentoOMedico,
  verificarPropioDiagnostico
};
