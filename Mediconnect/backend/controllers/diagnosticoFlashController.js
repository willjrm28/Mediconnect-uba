const db = require('../config/database');
const iaService = require('../services/iaService');
const { crearAlertaInterna } = require('./alertasController');

const DISCLAIMER_LEGAL =
  'Diagnóstico Flash es una orientación rápida, NO un diagnóstico médico ni ' +
  'reemplaza a un profesional de la salud. Si tienes una emergencia (dolor de ' +
  'pecho intenso, dificultad para respirar, pérdida de conciencia), busca ' +
  'atención médica inmediata. Cuéntame qué síntomas tienes y te ayudo a ' +
  'orientarte.';

async function iniciar(req, res) {
  const id_paciente = req.usuario.id;

  try {
    const [resultado] = await db.query(
      `INSERT INTO diagnosticos_flash (id_paciente, estado) VALUES (?, 'en_curso')`,
      [id_paciente]
    );
    const id_diagnostico_flash = resultado.insertId;

    await db.query(
      `INSERT INTO mensajes_diagnostico_flash (id_diagnostico_flash, remitente, contenido)
       VALUES (?, 'bot', ?)`,
      [id_diagnostico_flash, DISCLAIMER_LEGAL]
    );

    const [diagnostico] = await db.query('SELECT * FROM diagnosticos_flash WHERE id = ?', [id_diagnostico_flash]);
    const [mensajes] = await db.query(
      'SELECT * FROM mensajes_diagnostico_flash WHERE id_diagnostico_flash = ? ORDER BY fecha_hora ASC, id ASC',
      [id_diagnostico_flash]
    );

    return res.status(201).json({ diagnostico: diagnostico[0], mensajes });
  } catch (error) {
    console.error('Error al iniciar Diagnóstico Flash:', error);
    return res.status(500).json({ error: 'Error del servidor al iniciar el Diagnóstico Flash.' });
  }
}

async function buscarMedicosEnLinea(idEspecialidad) {
  const [medicos] = await db.query(
    `SELECT id, nombre FROM medicos
     WHERE id_especialidad = ? AND en_linea = 1 AND estado_solicitud = 'aprobado'`,
    [idEspecialidad]
  );
  return medicos;
}

async function alertarEspecialidadCompleta(idPaciente, idEspecialidad, idDiagnosticoFlash) {
  let [medicos] = await db.query(
    `SELECT id FROM medicos WHERE id_especialidad = ? AND estado_solicitud = 'aprobado'`,
    [idEspecialidad]
  );

  // Si todavía no hay médicos registrados en esa especialidad específica,
  // alertar a los médicos aprobados disponibles para no dejar el caso desatendido.
  if (medicos.length === 0) {
    [medicos] = await db.query(`SELECT id FROM medicos WHERE estado_solicitud = 'aprobado'`);
  }

  const descripcion = `Diagnóstico Flash #${idDiagnosticoFlash} clasificado como urgente. Revisar conversación con el paciente.`;

  for (const medico of medicos) {
    await crearAlertaInterna(idPaciente, medico.id, 'sintoma_urgente', 'alta', descripcion);
  }
}

async function resolverIdEspecialidad(nombreSugerido) {
  const normalizado = iaService.normalizarEspecialidad(nombreSugerido) || 'Medicina Interna';
  const [filas] = await db.query('SELECT id FROM especialidades WHERE nombre = ?', [normalizado]);
  if (filas.length > 0) return filas[0].id;

  const [fallback] = await db.query('SELECT id FROM especialidades ORDER BY id ASC LIMIT 1');
  return fallback.length > 0 ? fallback[0].id : null;
}

async function procesarClasificacion(diagnostico, resultadoIA) {
  const id_diagnostico_flash = diagnostico.id;

  if (resultadoIA.estado === 'en_curso') {
    return { conectar_con: [] };
  }

  const idEspecialidad = resultadoIA.especialidad_sugerida || resultadoIA.estado === 'urgente'
    ? await resolverIdEspecialidad(resultadoIA.especialidad_sugerida)
    : null;

  await db.query(
    'UPDATE diagnosticos_flash SET estado = ?, id_especialidad_sugerida = ? WHERE id = ?',
    [resultadoIA.estado, idEspecialidad, id_diagnostico_flash]
  );

  if (resultadoIA.estado !== 'urgente' || !idEspecialidad) {
    return { conectar_con: [] };
  }

  const medicosEnLinea = await buscarMedicosEnLinea(idEspecialidad);

  if (medicosEnLinea.length > 0) {
    return { conectar_con: medicosEnLinea };
  }

  await alertarEspecialidadCompleta(diagnostico.id_paciente, idEspecialidad, id_diagnostico_flash);
  return { conectar_con: [] };
}

async function obtenerDetalle(req, res) {
  const { id_diagnostico_flash } = req.params;

  try {
    const [diagnosticos] = await db.query('SELECT * FROM diagnosticos_flash WHERE id = ?', [id_diagnostico_flash]);
    if (diagnosticos.length === 0) {
      return res.status(404).json({ error: 'Diagnóstico Flash no encontrado.' });
    }
    const diagnostico = diagnosticos[0];

    const [mensajes] = await db.query(
      'SELECT * FROM mensajes_diagnostico_flash WHERE id_diagnostico_flash = ? ORDER BY fecha_hora ASC, id ASC',
      [id_diagnostico_flash]
    );

    let conectar_con = [];
    if (diagnostico.estado === 'urgente' && diagnostico.id_especialidad_sugerida) {
      conectar_con = await buscarMedicosEnLinea(diagnostico.id_especialidad_sugerida);
    }

    return res.status(200).json({ diagnostico, mensajes, conectar_con });
  } catch (error) {
    console.error('Error al obtener Diagnóstico Flash:', error);
    return res.status(500).json({ error: 'Error del servidor al obtener el Diagnóstico Flash.' });
  }
}

async function enviarMensaje(req, res) {
  const { id_diagnostico_flash } = req.params;
  const { contenido } = req.body;

  if (!contenido || String(contenido).trim() === '') {
    return res.status(400).json({ error: 'El campo "contenido" es obligatorio.' });
  }

  const textoLimpio = String(contenido).trim();
  let idMensajePaciente = null;

  try {
    const [diagnosticos] = await db.query('SELECT * FROM diagnosticos_flash WHERE id = ?', [id_diagnostico_flash]);
    if (diagnosticos.length === 0) {
      return res.status(404).json({ error: 'Diagnóstico Flash no encontrado.' });
    }
    const diagnostico = diagnosticos[0];

    if (diagnostico.estado === 'urgente') {
      return res.status(409).json({
        error: 'Este Diagnóstico Flash ya fue clasificado como urgente. Un médico ha sido notificado; espera contacto o busca atención inmediata si empeora.'
      });
    }

    const [insPac] = await db.query(
      `INSERT INTO mensajes_diagnostico_flash (id_diagnostico_flash, remitente, contenido) VALUES (?, 'paciente', ?)`,
      [id_diagnostico_flash, textoLimpio]
    );
    idMensajePaciente = insPac.insertId;

    const [historialFilas] = await db.query(
      `SELECT remitente, contenido FROM mensajes_diagnostico_flash
       WHERE id_diagnostico_flash = ? ORDER BY fecha_hora ASC, id ASC`,
      [id_diagnostico_flash]
    );
    const historialParaIA = historialFilas.slice(1);

    let resultadoIA;
    try {
      resultadoIA = await iaService.conversar(historialParaIA);
    } catch (errorIA) {
      // Revertir el mensaje del paciente si la IA no pudo responder para no dejar el chat inconsistente.
      if (idMensajePaciente) {
        await db.query('DELETE FROM mensajes_diagnostico_flash WHERE id = ?', [idMensajePaciente]);
      }
      console.error('Error al consultar Gemini API:', errorIA);
      return res.status(503).json({
        error: 'El asistente de IA no está disponible en este momento. Intenta de nuevo en unos segundos o contacta a tu médico.'
      });
    }

    await db.query(
      `INSERT INTO mensajes_diagnostico_flash (id_diagnostico_flash, remitente, contenido) VALUES (?, 'bot', ?)`,
      [id_diagnostico_flash, resultadoIA.mensaje]
    );

    const { conectar_con } = await procesarClasificacion(diagnostico, resultadoIA);

    const [diagnosticoActualizado] = await db.query('SELECT * FROM diagnosticos_flash WHERE id = ?', [
      id_diagnostico_flash
    ]);

    return res.status(200).json({
      diagnostico: diagnosticoActualizado[0],
      mensaje_bot: resultadoIA.mensaje,
      conectar_con
    });
  } catch (error) {
    console.error('Error al procesar mensaje de Diagnóstico Flash:', error);
    return res.status(500).json({ error: 'Error del servidor al procesar el mensaje.' });
  }
}

async function listarMensajes(req, res) {
  const { id_diagnostico_flash } = req.params;

  try {
    const [mensajes] = await db.query(
      'SELECT * FROM mensajes_diagnostico_flash WHERE id_diagnostico_flash = ? ORDER BY fecha_hora ASC, id ASC',
      [id_diagnostico_flash]
    );
    return res.status(200).json(mensajes);
  } catch (error) {
    console.error('Error al listar mensajes de Diagnóstico Flash:', error);
    return res.status(500).json({ error: 'Error del servidor al obtener los mensajes.' });
  }
}

module.exports = {
  iniciar,
  obtenerDetalle,
  enviarMensaje,
  listarMensajes
};
