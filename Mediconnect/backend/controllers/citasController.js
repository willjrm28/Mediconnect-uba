const db = require('../config/database');

const ESTADOS_CITA = ['Programada', 'Confirmada', 'Pendiente', 'Completada', 'Cancelada'];

function estaVacio(valor) {
  return valor === undefined || valor === null || String(valor).trim() === '';
}

async function crear(req, res) {
  const { fecha, hora, tipo_consulta } = req.body;

  const camposObligatorios = [
    ['fecha', fecha],
    ['hora', hora],
    ['tipo_consulta', tipo_consulta]
  ];

  for (const [campo, valor] of camposObligatorios) {
    if (estaVacio(valor)) {
      return res.status(400).json({ error: `El campo "${campo}" es obligatorio.` });
    }
  }

  let id_paciente;
  let id_medico;
  let estado;

  if (req.usuario.rol === 'paciente') {
    id_paciente = req.usuario.id;
    id_medico = req.body.id_medico;
    if (estaVacio(id_medico)) {
      return res.status(400).json({ error: 'El campo "id_medico" es obligatorio.' });
    }
    estado = 'Pendiente';
  } else {
    id_medico = req.usuario.id;
    id_paciente = req.body.id_paciente;
    if (estaVacio(id_paciente)) {
      return res.status(400).json({ error: 'El campo "id_paciente" es obligatorio.' });
    }
    estado = 'Confirmada';
  }

  try {
    const [pacientes] = await db.query('SELECT id FROM pacientes WHERE id = ?', [id_paciente]);
    if (pacientes.length === 0) {
      return res.status(404).json({ error: 'Paciente no encontrado.' });
    }

    const [medicos] = await db.query(
      `SELECT id FROM medicos WHERE id = ? AND estado_solicitud = 'aprobado'`,
      [id_medico]
    );
    if (medicos.length === 0) {
      return res.status(404).json({ error: 'Médico no encontrado o no aprobado.' });
    }

    const [conflictos] = await db.query(
      `SELECT id FROM citas
       WHERE id_medico = ? AND fecha = ? AND hora = ? AND estado != 'Cancelada'`,
      [id_medico, fecha, hora]
    );
    if (conflictos.length > 0) {
      return res.status(409).json({ error: 'El médico ya tiene una cita programada en ese horario.' });
    }

    const [resultado] = await db.query(
      `INSERT INTO citas (id_paciente, id_medico, fecha, hora, tipo_consulta, estado)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id_paciente, id_medico, fecha, hora, String(tipo_consulta).trim(), estado]
    );

    return res.status(201).json({
      id: resultado.insertId,
      id_paciente: Number(id_paciente),
      id_medico: Number(id_medico),
      fecha,
      hora,
      tipo_consulta: String(tipo_consulta).trim(),
      estado
    });
  } catch (error) {
    console.error('Error al crear cita:', error);
    return res.status(500).json({ error: 'Error del servidor al crear la cita.' });
  }
}

async function listar(req, res) {
  try {
    let filas;

    if (req.usuario.rol === 'medico') {
      [filas] = await db.query(
        `SELECT c.*, p.nombre AS nombre_paciente
         FROM citas c
         JOIN pacientes p ON c.id_paciente = p.id
         WHERE c.id_medico = ?
         ORDER BY c.fecha ASC, c.hora ASC`,
        [req.usuario.id]
      );
    } else {
      [filas] = await db.query(
        `SELECT c.*, m.nombre AS nombre_medico, e.nombre AS especialidad
         FROM citas c
         JOIN medicos m ON c.id_medico = m.id
         LEFT JOIN especialidades e ON m.id_especialidad = e.id
         WHERE c.id_paciente = ?
         ORDER BY c.fecha ASC, c.hora ASC`,
        [req.usuario.id]
      );
    }

    return res.status(200).json(filas);
  } catch (error) {
    console.error('Error al listar citas:', error);
    return res.status(500).json({ error: 'Error del servidor al obtener las citas.' });
  }
}

async function actualizarEstado(req, res) {
  const { id } = req.params;
  const { estado } = req.body;

  if (estaVacio(estado)) {
    return res.status(400).json({ error: 'El campo "estado" es obligatorio.' });
  }

  if (!ESTADOS_CITA.includes(estado)) {
    return res.status(400).json({ error: `estado debe ser uno de: ${ESTADOS_CITA.join(', ')}` });
  }

  try {
    const [citas] = await db.query('SELECT * FROM citas WHERE id = ?', [id]);
    if (citas.length === 0) {
      return res.status(404).json({ error: 'Cita no encontrada.' });
    }

    const cita = citas[0];

    if (req.usuario.rol === 'medico') {
      if (Number(cita.id_medico) !== Number(req.usuario.id)) {
        return res.status(403).json({ error: 'Esta cita no te pertenece.' });
      }
    } else {
      if (Number(cita.id_paciente) !== Number(req.usuario.id)) {
        return res.status(403).json({ error: 'Esta cita no te pertenece.' });
      }
      if (estado !== 'Cancelada') {
        return res.status(403).json({ error: 'Solo puedes cancelar tu propia cita.' });
      }
      if (cita.estado === 'Completada' || cita.estado === 'Cancelada') {
        return res.status(409).json({ error: 'Esta cita ya no puede ser cancelada.' });
      }
    }

    await db.query('UPDATE citas SET estado = ? WHERE id = ?', [estado, id]);

    const [actualizada] = await db.query('SELECT * FROM citas WHERE id = ?', [id]);
    return res.status(200).json(actualizada[0]);
  } catch (error) {
    console.error('Error al actualizar estado de la cita:', error);
    return res.status(500).json({ error: 'Error del servidor al actualizar la cita.' });
  }
}

module.exports = {
  crear,
  listar,
  actualizarEstado
};
