const db = require('../config/database');

function estaVacio(valor) {
  return valor === undefined || valor === null || String(valor).trim() === '';
}

async function crear(req, res) {
  const { id_paciente, nombre, dosis, frecuencia, instrucciones, fecha_inicio, fecha_fin } = req.body;

  const camposObligatorios = [
    ['id_paciente', id_paciente],
    ['nombre', nombre],
    ['dosis', dosis],
    ['frecuencia', frecuencia],
    ['fecha_inicio', fecha_inicio]
  ];

  for (const [campo, valor] of camposObligatorios) {
    if (estaVacio(valor)) {
      return res.status(400).json({ error: `El campo "${campo}" es obligatorio.` });
    }
  }

  if (!estaVacio(fecha_fin) && String(fecha_fin) < String(fecha_inicio)) {
    return res.status(400).json({ error: 'La fecha de fin no puede ser anterior a la fecha de inicio.' });
  }

  const id_medico = req.usuario.id;

  try {
    const [pacientes] = await db.query('SELECT id FROM pacientes WHERE id = ?', [id_paciente]);
    if (pacientes.length === 0) {
      return res.status(404).json({ error: 'Paciente no encontrado.' });
    }

    const [resultado] = await db.query(
      `INSERT INTO medicamentos
        (id_paciente, id_medico, nombre, dosis, frecuencia, instrucciones, fecha_inicio, fecha_fin)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id_paciente, id_medico, String(nombre).trim(), String(dosis).trim(),
        String(frecuencia).trim(), estaVacio(instrucciones) ? null : String(instrucciones).trim(),
        fecha_inicio, estaVacio(fecha_fin) ? null : fecha_fin
      ]
    );

    return res.status(201).json({
      id: resultado.insertId,
      id_paciente: Number(id_paciente),
      id_medico,
      nombre: String(nombre).trim(),
      dosis: String(dosis).trim(),
      frecuencia: String(frecuencia).trim(),
      instrucciones: estaVacio(instrucciones) ? null : String(instrucciones).trim(),
      fecha_inicio,
      fecha_fin: estaVacio(fecha_fin) ? null : fecha_fin
    });
  } catch (error) {
    console.error('Error al crear medicamento:', error);
    return res.status(500).json({ error: 'Error del servidor al crear el medicamento.' });
  }
}

async function listarPorPaciente(req, res) {
  const { id } = req.params;

  try {
    const [pacientes] = await db.query('SELECT id FROM pacientes WHERE id = ?', [id]);
    if (pacientes.length === 0) {
      return res.status(404).json({ error: 'Paciente no encontrado.' });
    }

    const [medicamentos] = await db.query(
      `SELECT med.*, m.nombre AS nombre_medico
       FROM medicamentos med
       JOIN medicos m ON med.id_medico = m.id
       WHERE med.id_paciente = ?
       ORDER BY (med.fecha_fin IS NULL OR med.fecha_fin >= CURDATE()) DESC, med.fecha_inicio DESC`,
      [id]
    );
    return res.status(200).json(medicamentos);
  } catch (error) {
    console.error('Error al listar medicamentos:', error);
    return res.status(500).json({ error: 'Error del servidor al obtener los medicamentos.' });
  }
}

async function marcarToma(req, res) {
  const { id_medicamento } = req.params;

  try {
    const [medicamentos] = await db.query('SELECT id FROM medicamentos WHERE id = ?', [id_medicamento]);
    if (medicamentos.length === 0) {
      return res.status(404).json({ error: 'Medicamento no encontrado.' });
    }

    const [resultado] = await db.query(
      `INSERT INTO registro_tomas (id_medicamento, fecha, hora, tomado)
       VALUES (?, CURDATE(), CURTIME(), 1)`,
      [id_medicamento]
    );

    const [filas] = await db.query('SELECT * FROM registro_tomas WHERE id = ?', [resultado.insertId]);

    return res.status(201).json(filas[0]);
  } catch (error) {
    console.error('Error al registrar toma de medicamento:', error);
    return res.status(500).json({ error: 'Error del servidor al registrar la toma del medicamento.' });
  }
}

async function listarTomas(req, res) {
  const { id_medicamento } = req.params;

  try {
    const [medicamentos] = await db.query('SELECT id FROM medicamentos WHERE id = ?', [id_medicamento]);
    if (medicamentos.length === 0) {
      return res.status(404).json({ error: 'Medicamento no encontrado.' });
    }

    const [tomas] = await db.query(
      'SELECT * FROM registro_tomas WHERE id_medicamento = ? ORDER BY fecha DESC, hora DESC',
      [id_medicamento]
    );
    return res.status(200).json(tomas);
  } catch (error) {
    console.error('Error al listar tomas de medicamento:', error);
    return res.status(500).json({ error: 'Error del servidor al obtener las tomas del medicamento.' });
  }
}

module.exports = {
  crear,
  listarPorPaciente,
  marcarToma,
  listarTomas
};
