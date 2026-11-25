const db = require('../config/database');

async function listar(req, res) {
  try {
    const [especialidades] = await db.query('SELECT id, nombre FROM especialidades ORDER BY nombre');
    return res.status(200).json(especialidades);
  } catch (error) {
    console.error('Error al listar especialidades:', error);
    return res.status(500).json({ error: 'Error del servidor al obtener las especialidades.' });
  }
}

module.exports = { listar };
