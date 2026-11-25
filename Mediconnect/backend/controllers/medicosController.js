const db = require('../config/database');

async function listar(req, res) {
  try {
    const [medicos] = await db.query(
      `SELECT m.id, m.nombre, m.telefono, m.en_linea, e.nombre AS especialidad
       FROM medicos m
       JOIN especialidades e ON m.id_especialidad = e.id
       WHERE m.estado_solicitud = 'aprobado'
       ORDER BY e.nombre, m.nombre`
    );
    return res.status(200).json(medicos);
  } catch (error) {
    console.error('Error al listar médicos:', error);
    return res.status(500).json({ error: 'Error del servidor al obtener los médicos.' });
  }
}

module.exports = { listar };
