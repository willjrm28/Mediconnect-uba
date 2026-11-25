const db = require('../config/database');
const { emitirAlertaMedico } = require('../sockets');

const TIPOS_ALERTA = ['valor_critico', 'receta_por_vencer', 'resultado_disponible', 'sintoma_urgente'];
const PRIORIDADES_ALERTA = ['alta', 'media', 'baja'];

function estaVacio(valor) {
  return valor === undefined || valor === null || String(valor).trim() === '';
}

async function crearAlertaInterna(idPaciente, idMedico, tipo, prioridad, descripcion) {
  const [resultado] = await db.query(
    `INSERT INTO alertas (id_paciente, id_medico, tipo, prioridad, descripcion, resuelta)
     VALUES (?, ?, ?, ?, ?, 0)`,
    [idPaciente, idMedico, tipo, prioridad, descripcion]
  );

  const [filas] = await db.query(
    `SELECT a.*, p.nombre AS nombre_paciente, p.edad AS edad_paciente
     FROM alertas a
     JOIN pacientes p ON a.id_paciente = p.id
     WHERE a.id = ?`,
    [resultado.insertId]
  );
  const alerta = filas[0];

  emitirAlertaMedico(idMedico, alerta);

  return alerta;
}

async function crear(req, res) {
  const { id_paciente, tipo, prioridad, descripcion } = req.body;

  const camposObligatorios = [
    ['id_paciente', id_paciente],
    ['tipo', tipo],
    ['prioridad', prioridad],
    ['descripcion', descripcion]
  ];

  for (const [campo, valor] of camposObligatorios) {
    if (estaVacio(valor)) {
      return res.status(400).json({ error: `El campo "${campo}" es obligatorio.` });
    }
  }

  if (!TIPOS_ALERTA.includes(tipo)) {
    return res.status(400).json({ error: `tipo debe ser uno de: ${TIPOS_ALERTA.join(', ')}` });
  }

  if (!PRIORIDADES_ALERTA.includes(prioridad)) {
    return res.status(400).json({ error: `prioridad debe ser uno de: ${PRIORIDADES_ALERTA.join(', ')}` });
  }

  const id_medico = req.usuario.id;

  try {
    const [pacientes] = await db.query('SELECT id FROM pacientes WHERE id = ?', [id_paciente]);
    if (pacientes.length === 0) {
      return res.status(404).json({ error: 'Paciente no encontrado.' });
    }

    const fila = await crearAlertaInterna(id_paciente, id_medico, tipo, prioridad, descripcion);

    return res.status(201).json(fila);
  } catch (error) {
    console.error('Error al crear alerta:', error);
    return res.status(500).json({ error: 'Error del servidor al crear la alerta.' });
  }
}

async function listar(req, res) {
  const { resuelta } = req.query;

  try {
    let query = `
      SELECT a.*, p.nombre AS nombre_paciente, p.edad AS edad_paciente
      FROM alertas a
      JOIN pacientes p ON a.id_paciente = p.id
      WHERE a.id_medico = ?
    `;
    const params = [req.usuario.id];

    if (resuelta === '0' || resuelta === '1') {
      query += ' AND a.resuelta = ?';
      params.push(Number(resuelta));
    }

    query += `
      ORDER BY a.resuelta ASC, FIELD(a.prioridad, 'alta', 'media', 'baja'), a.fecha_hora DESC
    `;

    const [alertas] = await db.query(query, params);
    return res.status(200).json(alertas);
  } catch (error) {
    console.error('Error al listar alertas:', error);
    return res.status(500).json({ error: 'Error del servidor al obtener las alertas.' });
  }
}

async function marcarResuelta(req, res) {
  const { id } = req.params;

  try {
    const [alertas] = await db.query('SELECT * FROM alertas WHERE id = ?', [id]);
    if (alertas.length === 0) {
      return res.status(404).json({ error: 'Alerta no encontrada.' });
    }

    const alerta = alertas[0];

    if (Number(alerta.id_medico) !== Number(req.usuario.id)) {
      return res.status(403).json({ error: 'Esta alerta no te pertenece.' });
    }

    await db.query('UPDATE alertas SET resuelta = 1, fecha_resolucion = NOW() WHERE id = ?', [id]);

    const [actualizada] = await db.query('SELECT * FROM alertas WHERE id = ?', [id]);
    return res.status(200).json(actualizada[0]);
  } catch (error) {
    console.error('Error al marcar alerta como resuelta:', error);
    return res.status(500).json({ error: 'Error del servidor al actualizar la alerta.' });
  }
}

module.exports = {
  crear,
  listar,
  marcarResuelta,
  crearAlertaInterna
};
