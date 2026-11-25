const fs = require('fs');
const db = require('../config/database');
const { VALORES_PERMITIDOS } = require('./authController');
const { crearAlertaInterna } = require('./alertasController');

const CAMPOS_ACTUALIZABLES = [
  'edad', 'sexo', 'tipo_sangre', 'peso', 'altura',
  'telefono', 'fumador', 'alcohol', 'actividad_fisica'
];

const ESTADOS_LABORATORIO = ['Normal', 'Alta', 'Baja', 'Critico'];

function borrarArchivoSubido(file) {
  if (!file || !file.path) return;
  fs.unlink(file.path, () => {});
}

// Lista pacientes ordenados por prioridad clínica (pacientes con alertas sin
// resolver para este médico aparecen primero), manteniendo los campos base.
async function listar(req, res) {
  try {
    const [pacientes] = await db.query(
      `SELECT
         p.id, p.nombre, p.cedula, p.edad, p.sexo, p.telefono,
         COALESCE(al.alertas_pendientes, 0) AS alertas_pendientes,
         al.prioridad_maxima
       FROM pacientes p
       LEFT JOIN (
         SELECT
           id_paciente,
           COUNT(*) AS alertas_pendientes,
           MIN(FIELD(prioridad, 'alta', 'media', 'baja')) AS prioridad_maxima
         FROM alertas
         WHERE id_medico = ? AND resuelta = 0
         GROUP BY id_paciente
       ) al ON al.id_paciente = p.id
       ORDER BY (al.alertas_pendientes IS NULL) ASC, al.prioridad_maxima ASC, al.alertas_pendientes DESC, p.nombre ASC`,
      [req.usuario.id]
    );
    return res.status(200).json(pacientes);
  } catch (error) {
    console.error('Error al listar pacientes:', error);
    return res.status(500).json({ error: 'Error del servidor al obtener los pacientes.' });
  }
}

async function obtenerPerfil(req, res) {
  const { id } = req.params;

  try {
    const [filas] = await db.query('SELECT * FROM pacientes WHERE id = ?', [id]);
    if (filas.length === 0) {
      return res.status(404).json({ error: 'Paciente no encontrado.' });
    }

    const { password, ...datosPaciente } = filas[0];
    return res.status(200).json(datosPaciente);
  } catch (error) {
    console.error('Error al obtener perfil del paciente:', error);
    return res.status(500).json({ error: 'Error del servidor al obtener el perfil.' });
  }
}

async function actualizarPerfil(req, res) {
  const { id } = req.params;

  const camposAActualizar = CAMPOS_ACTUALIZABLES.filter(
    (campo) => req.body[campo] !== undefined && req.body[campo] !== ''
  );

  if (camposAActualizar.length === 0) {
    return res.status(400).json({ error: 'No se enviaron campos para actualizar.' });
  }

  for (const campo of camposAActualizar) {
    const valoresValidos = VALORES_PERMITIDOS[campo];
    if (valoresValidos && !valoresValidos.includes(req.body[campo])) {
      return res.status(400).json({
        error: `${campo} debe ser uno de: ${valoresValidos.join(', ')}`
      });
    }
    if (campo === 'edad') {
      const n = Number(req.body[campo]);
      if (!Number.isInteger(n) || n < 1 || n > 120) {
        return res.status(400).json({ error: 'La edad debe ser un número entre 1 y 120.' });
      }
    }
    if (campo === 'peso') {
      const n = Number(req.body[campo]);
      if (!Number.isFinite(n) || n <= 0 || n > 500) {
        return res.status(400).json({ error: 'El peso debe ser un número válido en kg.' });
      }
    }
    if (campo === 'altura') {
      const n = Number(req.body[campo]);
      if (!Number.isFinite(n) || n < 30 || n > 260) {
        return res.status(400).json({ error: 'La altura debe ser un número válido en cm.' });
      }
    }
  }

  try {
    const setClause = camposAActualizar.map((campo) => `${campo} = ?`).join(', ');
    const valores = camposAActualizar.map((campo) => req.body[campo]);

    const [resultado] = await db.query(
      `UPDATE pacientes SET ${setClause} WHERE id = ?`,
      [...valores, id]
    );

    if (resultado.affectedRows === 0) {
      return res.status(404).json({ error: 'Paciente no encontrado.' });
    }

    const [filas] = await db.query('SELECT * FROM pacientes WHERE id = ?', [id]);
    const { password, ...datosPaciente } = filas[0];

    return res.status(200).json(datosPaciente);
  } catch (error) {
    console.error('Error al actualizar perfil del paciente:', error);
    return res.status(500).json({ error: 'Error del servidor al actualizar el perfil.' });
  }
}

async function listarAlergias(req, res) {
  const { id } = req.params;

  try {
    const [alergias] = await db.query('SELECT * FROM alergias WHERE id_paciente = ? ORDER BY id DESC', [id]);
    return res.status(200).json(alergias);
  } catch (error) {
    console.error('Error al listar alergias:', error);
    return res.status(500).json({ error: 'Error del servidor al obtener las alergias.' });
  }
}

async function agregarAlergia(req, res) {
  const { id } = req.params;
  const sustancia = req.body.sustancia ? String(req.body.sustancia).trim() : '';

  if (!sustancia) {
    return res.status(400).json({ error: 'El campo "sustancia" es obligatorio.' });
  }

  try {
    const [pacientes] = await db.query('SELECT id FROM pacientes WHERE id = ?', [id]);
    if (pacientes.length === 0) {
      return res.status(404).json({ error: 'Paciente no encontrado.' });
    }

    const [resultado] = await db.query(
      'INSERT INTO alergias (id_paciente, sustancia) VALUES (?, ?)',
      [id, sustancia]
    );

    return res.status(201).json({ id: resultado.insertId, id_paciente: Number(id), sustancia });
  } catch (error) {
    console.error('Error al agregar alergia:', error);
    return res.status(500).json({ error: 'Error del servidor al agregar la alergia.' });
  }
}

async function eliminarAlergia(req, res) {
  const { id, id_alergia } = req.params;

  try {
    const [resultado] = await db.query(
      'DELETE FROM alergias WHERE id = ? AND id_paciente = ?',
      [id_alergia, id]
    );
    if (resultado.affectedRows === 0) {
      return res.status(404).json({ error: 'Alergia no encontrada.' });
    }
    return res.status(200).json({ mensaje: 'Alergia eliminada.' });
  } catch (error) {
    console.error('Error al eliminar alergia:', error);
    return res.status(500).json({ error: 'Error del servidor al eliminar la alergia.' });
  }
}

async function listarAntecedentes(req, res) {
  const { id } = req.params;

  try {
    const [antecedentes] = await db.query(
      'SELECT * FROM antecedentes_familiares WHERE id_paciente = ? ORDER BY id DESC',
      [id]
    );
    return res.status(200).json(antecedentes);
  } catch (error) {
    console.error('Error al listar antecedentes familiares:', error);
    return res.status(500).json({ error: 'Error del servidor al obtener los antecedentes familiares.' });
  }
}

async function agregarAntecedente(req, res) {
  const { id } = req.params;
  const condicion = req.body.condicion ? String(req.body.condicion).trim() : '';

  if (!condicion) {
    return res.status(400).json({ error: 'El campo "condicion" es obligatorio.' });
  }

  try {
    const [pacientes] = await db.query('SELECT id FROM pacientes WHERE id = ?', [id]);
    if (pacientes.length === 0) {
      return res.status(404).json({ error: 'Paciente no encontrado.' });
    }

    const [resultado] = await db.query(
      'INSERT INTO antecedentes_familiares (id_paciente, condicion) VALUES (?, ?)',
      [id, condicion]
    );

    return res.status(201).json({ id: resultado.insertId, id_paciente: Number(id), condicion });
  } catch (error) {
    console.error('Error al agregar antecedente familiar:', error);
    return res.status(500).json({ error: 'Error del servidor al agregar el antecedente familiar.' });
  }
}

async function eliminarAntecedente(req, res) {
  const { id, id_antecedente } = req.params;

  try {
    const [resultado] = await db.query(
      'DELETE FROM antecedentes_familiares WHERE id = ? AND id_paciente = ?',
      [id_antecedente, id]
    );
    if (resultado.affectedRows === 0) {
      return res.status(404).json({ error: 'Antecedente familiar no encontrado.' });
    }
    return res.status(200).json({ mensaje: 'Antecedente familiar eliminado.' });
  } catch (error) {
    console.error('Error al eliminar antecedente familiar:', error);
    return res.status(500).json({ error: 'Error del servidor al eliminar el antecedente.' });
  }
}

async function listarLaboratorio(req, res) {
  const { id } = req.params;

  try {
    const [pacientes] = await db.query('SELECT id FROM pacientes WHERE id = ?', [id]);
    if (pacientes.length === 0) {
      return res.status(404).json({ error: 'Paciente no encontrado.' });
    }

    const [resultados] = await db.query(
      `SELECT rl.*, m.nombre AS nombre_medico
       FROM resultados_laboratorio rl
       JOIN medicos m ON rl.id_medico = m.id
       WHERE rl.id_paciente = ?
       ORDER BY rl.fecha_orden DESC, rl.id DESC`,
      [id]
    );
    return res.status(200).json(resultados);
  } catch (error) {
    console.error('Error al listar resultados de laboratorio:', error);
    return res.status(500).json({ error: 'Error del servidor al obtener los resultados de laboratorio.' });
  }
}

async function crearOrdenLaboratorio(req, res) {
  const { id } = req.params;
  const tipo_examen = req.body.tipo_examen ? String(req.body.tipo_examen).trim() : '';

  if (!tipo_examen) {
    return res.status(400).json({ error: 'El campo "tipo_examen" es obligatorio.' });
  }

  const id_medico = req.usuario.id;

  try {
    const [pacientes] = await db.query('SELECT id FROM pacientes WHERE id = ?', [id]);
    if (pacientes.length === 0) {
      return res.status(404).json({ error: 'Paciente no encontrado.' });
    }

    const [resultado] = await db.query(
      `INSERT INTO resultados_laboratorio (id_paciente, id_medico, tipo_examen, fecha_orden, estado_orden)
       VALUES (?, ?, ?, CURDATE(), 'pendiente')`,
      [id, id_medico, tipo_examen]
    );

    const [filas] = await db.query('SELECT * FROM resultados_laboratorio WHERE id = ?', [resultado.insertId]);

    return res.status(201).json(filas[0]);
  } catch (error) {
    console.error('Error al crear orden de laboratorio:', error);
    return res.status(500).json({ error: 'Error del servidor al crear la orden de laboratorio.' });
  }
}

async function completarOrdenLaboratorio(req, res) {
  const { id_resultado } = req.params;
  const { valor, unidad, estado_clinico } = req.body;

  const camposObligatorios = [
    ['valor', valor],
    ['unidad', unidad],
    ['estado_clinico', estado_clinico]
  ];

  for (const [campo, valorCampo] of camposObligatorios) {
    if (valorCampo === undefined || valorCampo === null || String(valorCampo).trim() === '') {
      borrarArchivoSubido(req.file);
      return res.status(400).json({ error: `El campo "${campo}" es obligatorio.` });
    }
  }

  const valorNum = Number(valor);
  if (!Number.isFinite(valorNum)) {
    borrarArchivoSubido(req.file);
    return res.status(400).json({ error: 'El campo "valor" debe ser un número válido.' });
  }

  if (!req.file) {
    return res.status(400).json({ error: 'La foto del resultado es obligatoria.' });
  }

  if (!ESTADOS_LABORATORIO.includes(estado_clinico)) {
    borrarArchivoSubido(req.file);
    return res.status(400).json({
      error: `estado_clinico debe ser uno de: ${ESTADOS_LABORATORIO.join(', ')}`
    });
  }

  try {
    const [filas] = await db.query('SELECT * FROM resultados_laboratorio WHERE id = ?', [id_resultado]);
    if (filas.length === 0) {
      borrarArchivoSubido(req.file);
      return res.status(404).json({ error: 'Orden de laboratorio no encontrada.' });
    }

    const orden = filas[0];

    if (orden.estado_orden === 'completado') {
      borrarArchivoSubido(req.file);
      return res.status(409).json({ error: 'Este examen ya fue completado, no se puede modificar.' });
    }

    const fotoEvidencia = req.file.filename;

    await db.query(
      `UPDATE resultados_laboratorio
       SET valor = ?, unidad = ?, estado_clinico = ?, foto_evidencia = ?,
           fecha_resultado = CURDATE(), estado_orden = 'completado'
       WHERE id = ?`,
      [valorNum, String(unidad).trim(), estado_clinico, fotoEvidencia, id_resultado]
    );

    const [actualizada] = await db.query('SELECT * FROM resultados_laboratorio WHERE id = ?', [id_resultado]);
    const filaActualizada = actualizada[0];

    try {
      if (estado_clinico === 'Critico') {
        await crearAlertaInterna(
          filaActualizada.id_paciente,
          filaActualizada.id_medico,
          'valor_critico',
          'alta',
          `Resultado crítico en ${filaActualizada.tipo_examen}: ${filaActualizada.valor} ${filaActualizada.unidad}`
        );
      }

      await crearAlertaInterna(
        filaActualizada.id_paciente,
        filaActualizada.id_medico,
        'resultado_disponible',
        'media',
        `Resultado de ${filaActualizada.tipo_examen} disponible para revisión`
      );
    } catch (errorAlerta) {
      console.error('Error al crear alerta para resultado de laboratorio:', errorAlerta);
    }

    return res.status(200).json(filaActualizada);
  } catch (error) {
    borrarArchivoSubido(req.file);
    console.error('Error al completar orden de laboratorio:', error);
    return res.status(500).json({ error: 'Error del servidor al completar la orden de laboratorio.' });
  }
}

async function listarHistorial(req, res) {
  const { id } = req.params;

  try {
    const [pacientes] = await db.query('SELECT id FROM pacientes WHERE id = ?', [id]);
    if (pacientes.length === 0) {
      return res.status(404).json({ error: 'Paciente no encontrado.' });
    }

    const [historial] = await db.query(
      `SELECT hc.*, m.nombre AS nombre_medico
       FROM historial_consultas hc
       JOIN medicos m ON hc.id_medico = m.id
       WHERE hc.id_paciente = ?
       ORDER BY hc.fecha DESC, hc.id DESC`,
      [id]
    );
    return res.status(200).json(historial);
  } catch (error) {
    console.error('Error al listar historial de consultas:', error);
    return res.status(500).json({ error: 'Error del servidor al obtener el historial de consultas.' });
  }
}

async function agregarHistorial(req, res) {
  const { id } = req.params;
  const { fecha, motivo, notas } = req.body;
  // Seguridad: siempre se usa el ID del médico autenticado en el JWT, nunca del body.
  const id_medico = req.usuario.id;

  const camposObligatorios = [
    ['fecha', fecha],
    ['motivo', motivo]
  ];

  for (const [campo, valorCampo] of camposObligatorios) {
    if (valorCampo === undefined || valorCampo === null || String(valorCampo).trim() === '') {
      return res.status(400).json({ error: `El campo "${campo}" es obligatorio.` });
    }
  }

  const notasLimpias = notas && String(notas).trim() !== '' ? String(notas).trim() : null;

  try {
    const [pacientes] = await db.query('SELECT id FROM pacientes WHERE id = ?', [id]);
    if (pacientes.length === 0) {
      return res.status(404).json({ error: 'Paciente no encontrado.' });
    }

    const [resultado] = await db.query(
      `INSERT INTO historial_consultas (id_paciente, id_medico, fecha, motivo, notas)
       VALUES (?, ?, ?, ?, ?)`,
      [id, id_medico, fecha, String(motivo).trim(), notasLimpias]
    );

    return res.status(201).json({
      id: resultado.insertId,
      id_paciente: Number(id),
      id_medico,
      fecha,
      motivo: String(motivo).trim(),
      notas: notasLimpias
    });
  } catch (error) {
    console.error('Error al agregar historial de consulta:', error);
    return res.status(500).json({ error: 'Error del servidor al agregar el historial de consulta.' });
  }
}

async function listarIndicaciones(req, res) {
  const { id } = req.params;

  try {
    const [pacientes] = await db.query('SELECT id FROM pacientes WHERE id = ?', [id]);
    if (pacientes.length === 0) {
      return res.status(404).json({ error: 'Paciente no encontrado.' });
    }

    const [indicaciones] = await db.query(
      `SELECT im.*, m.nombre AS nombre_medico
       FROM indicaciones_medicas im
       JOIN medicos m ON im.id_medico = m.id
       WHERE im.id_paciente = ?
       ORDER BY im.fecha_creacion DESC, im.id DESC`,
      [id]
    );
    return res.status(200).json(indicaciones);
  } catch (error) {
    console.error('Error al listar indicaciones médicas:', error);
    return res.status(500).json({ error: 'Error del servidor al obtener las indicaciones médicas.' });
  }
}

async function agregarIndicacion(req, res) {
  const { id } = req.params;
  const { descripcion, id_cita } = req.body;
  // Seguridad: siempre se toma el médico del JWT.
  const id_medico = req.usuario.id;

  if (descripcion === undefined || descripcion === null || String(descripcion).trim() === '') {
    return res.status(400).json({ error: 'El campo "descripcion" es obligatorio.' });
  }

  try {
    const [pacientes] = await db.query('SELECT id FROM pacientes WHERE id = ?', [id]);
    if (pacientes.length === 0) {
      return res.status(404).json({ error: 'Paciente no encontrado.' });
    }

    const [resultado] = await db.query(
      `INSERT INTO indicaciones_medicas (id_paciente, id_medico, id_cita, descripcion)
       VALUES (?, ?, ?, ?)`,
      [id, id_medico, id_cita ?? null, String(descripcion).trim()]
    );

    return res.status(201).json({
      id: resultado.insertId,
      id_paciente: Number(id),
      id_medico,
      id_cita: id_cita ?? null,
      descripcion: String(descripcion).trim()
    });
  } catch (error) {
    console.error('Error al agregar indicación médica:', error);
    return res.status(500).json({ error: 'Error del servidor al agregar la indicación médica.' });
  }
}

async function listarSignosVitales(req, res) {
  const { id } = req.params;

  try {
    const [pacientes] = await db.query('SELECT id FROM pacientes WHERE id = ?', [id]);
    if (pacientes.length === 0) {
      return res.status(404).json({ error: 'Paciente no encontrado.' });
    }

    const [signos] = await db.query(
      'SELECT * FROM signos_vitales WHERE id_paciente = ? ORDER BY fecha_hora DESC, id DESC',
      [id]
    );
    return res.status(200).json(signos);
  } catch (error) {
    console.error('Error al listar signos vitales:', error);
    return res.status(500).json({ error: 'Error del servidor al obtener los signos vitales.' });
  }
}

async function obtenerMedicosRelacionados(idPaciente) {
  const [relacionados] = await db.query(
    `SELECT DISTINCT id_medico FROM (
       SELECT id_medico FROM citas WHERE id_paciente = ?
       UNION
       SELECT id_medico FROM medicamentos WHERE id_paciente = ?
       UNION
       SELECT id_medico FROM resultados_laboratorio WHERE id_paciente = ?
       UNION
       SELECT id_medico FROM mensajes WHERE id_paciente = ?
     ) AS rel
     JOIN medicos m ON m.id = rel.id_medico AND m.estado_solicitud = 'aprobado'`,
    [idPaciente, idPaciente, idPaciente, idPaciente]
  );

  if (relacionados.length > 0) {
    return relacionados;
  }

  // Fallback para pacientes recién registrados sin citas/mensajes previos:
  // alertar a los médicos aprobados para que ningún valor crítico se pierda en silencio.
  const [aprobados] = await db.query(
    `SELECT id AS id_medico FROM medicos WHERE estado_solicitud = 'aprobado'`
  );
  return aprobados;
}

async function agregarSignosVitales(req, res) {
  const { id } = req.params;
  const { presion_arterial, frecuencia_cardiaca, spo2, temperatura, glicemia } = req.body;

  const camposObligatorios = [
    ['presion_arterial', presion_arterial],
    ['frecuencia_cardiaca', frecuencia_cardiaca],
    ['spo2', spo2],
    ['temperatura', temperatura]
  ];

  for (const [campo, valorCampo] of camposObligatorios) {
    if (valorCampo === undefined || valorCampo === null || String(valorCampo).trim() === '') {
      borrarArchivoSubido(req.file);
      return res.status(400).json({ error: `El campo "${campo}" es obligatorio.` });
    }
  }

  const presionLimpia = String(presion_arterial).trim();
  const matchPresion = presionLimpia.match(/^(\d{2,3})\s*\/\s*(\d{2,3})$/);
  if (!matchPresion) {
    borrarArchivoSubido(req.file);
    return res.status(400).json({ error: 'La presión arterial debe tener el formato sistólica/diastólica (ej: 120/80).' });
  }
  const sistolica = Number(matchPresion[1]);
  const diastolica = Number(matchPresion[2]);
  if (sistolica <= diastolica || sistolica < 50 || sistolica > 300 || diastolica < 30 || diastolica > 200) {
    borrarArchivoSubido(req.file);
    return res.status(400).json({ error: 'Los valores de presión arterial están fuera de un rango fisiológico válido.' });
  }

  const frecuenciaNum = Number(frecuencia_cardiaca);
  const spo2Num = Number(spo2);
  const temperaturaNum = Number(temperatura);
  const tieneGlicemia = glicemia !== undefined && glicemia !== null && String(glicemia).trim() !== '';
  const glicemiaNum = tieneGlicemia ? Number(glicemia) : null;

  if (!Number.isFinite(frecuenciaNum) || frecuenciaNum < 20 || frecuenciaNum > 250) {
    borrarArchivoSubido(req.file);
    return res.status(400).json({ error: 'La frecuencia cardíaca debe estar entre 20 y 250 bpm.' });
  }
  if (!Number.isFinite(spo2Num) || spo2Num < 50 || spo2Num > 100) {
    borrarArchivoSubido(req.file);
    return res.status(400).json({ error: 'La saturación SpO2 debe estar entre 50 y 100%.' });
  }
  if (!Number.isFinite(temperaturaNum) || temperaturaNum < 30 || temperaturaNum > 45) {
    borrarArchivoSubido(req.file);
    return res.status(400).json({ error: 'La temperatura debe estar entre 30 y 45 °C.' });
  }
  if (tieneGlicemia && (!Number.isFinite(glicemiaNum) || glicemiaNum < 20 || glicemiaNum > 700)) {
    borrarArchivoSubido(req.file);
    return res.status(400).json({ error: 'La glicemia debe estar entre 20 y 700 mg/dL.' });
  }

  const esPaciente = req.usuario.rol === 'paciente';
  const origen = esPaciente ? 'app_paciente' : 'consulta';

  if (esPaciente && !req.file) {
    return res.status(400).json({ error: 'La foto del aparato es obligatoria.' });
  }

  const idCita = esPaciente ? null : (req.body.id_cita ?? null);
  const fotoEvidencia = req.file ? req.file.filename : null;
  const presionNormalizada = `${sistolica}/${diastolica}`;

  try {
    const [pacientes] = await db.query('SELECT id FROM pacientes WHERE id = ?', [id]);
    if (pacientes.length === 0) {
      borrarArchivoSubido(req.file);
      return res.status(404).json({ error: 'Paciente no encontrado.' });
    }

    const [resultado] = await db.query(
      `INSERT INTO signos_vitales
        (id_paciente, id_cita, presion_arterial, frecuencia_cardiaca, spo2, temperatura, glicemia, origen, foto_evidencia)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, idCita, presionNormalizada, frecuenciaNum, spo2Num, temperaturaNum, glicemiaNum, origen, fotoEvidencia]
    );

    const alertasCriticas = [];
    if (sistolica >= 180 || sistolica <= 90 || diastolica >= 120 || diastolica <= 60) {
      alertasCriticas.push(`Presión arterial crítica: ${presionNormalizada} mmHg.`);
    }
    if (frecuenciaNum < 50 || frecuenciaNum > 120) {
      alertasCriticas.push(`Frecuencia cardíaca crítica: ${frecuenciaNum} bpm.`);
    }
    if (spo2Num < 90) {
      alertasCriticas.push(`SpO2 crítico: ${spo2Num}%.`);
    }
    if (temperaturaNum < 35 || temperaturaNum > 39) {
      alertasCriticas.push(`Temperatura crítica: ${temperaturaNum}°C.`);
    }
    if (glicemiaNum !== null && (glicemiaNum < 70 || glicemiaNum > 250)) {
      alertasCriticas.push(`Glicemia crítica: ${glicemiaNum} mg/dL.`);
    }

    if (alertasCriticas.length > 0) {
      try {
        const descripcion = alertasCriticas.join(' ');
        const medicos = await obtenerMedicosRelacionados(id);
        for (const { id_medico } of medicos) {
          await crearAlertaInterna(id, id_medico, 'valor_critico', 'alta', descripcion);
        }
      } catch (errorAlerta) {
        console.error('Error al evaluar/crear alertas de signos vitales:', errorAlerta);
      }
    }

    return res.status(201).json({
      id: resultado.insertId,
      id_paciente: Number(id),
      id_cita: idCita,
      presion_arterial: presionNormalizada,
      frecuencia_cardiaca: frecuenciaNum,
      spo2: spo2Num,
      temperatura: temperaturaNum,
      glicemia: glicemiaNum,
      origen,
      foto_evidencia: fotoEvidencia,
      alerta_generada: alertasCriticas.length > 0
    });
  } catch (error) {
    borrarArchivoSubido(req.file);
    console.error('Error al agregar signos vitales:', error);
    return res.status(500).json({ error: 'Error del servidor al agregar los signos vitales.' });
  }
}

module.exports = {
  listar,
  obtenerPerfil,
  actualizarPerfil,
  listarAlergias,
  agregarAlergia,
  eliminarAlergia,
  listarAntecedentes,
  agregarAntecedente,
  eliminarAntecedente,
  listarLaboratorio,
  crearOrdenLaboratorio,
  completarOrdenLaboratorio,
  listarHistorial,
  agregarHistorial,
  listarIndicaciones,
  agregarIndicacion,
  listarSignosVitales,
  agregarSignosVitales
};
