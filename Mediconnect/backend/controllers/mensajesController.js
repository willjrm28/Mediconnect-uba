const db = require('../config/database');
const { emitirMensaje } = require('../sockets');

function estaVacio(valor) {
  return valor === undefined || valor === null || String(valor).trim() === '';
}

async function enviar(req, res) {
  const { contenido } = req.body;

  if (estaVacio(contenido)) {
    return res.status(400).json({ error: 'El campo "contenido" es obligatorio.' });
  }

  const textoLimpio = String(contenido).trim();
  let id_paciente;
  let id_medico;
  let remitente;

  if (req.usuario.rol === 'medico') {
    id_medico = req.usuario.id;
    id_paciente = req.body.id_paciente;
    if (estaVacio(id_paciente)) {
      return res.status(400).json({ error: 'El campo "id_paciente" es obligatorio.' });
    }
    remitente = 'medico';
  } else {
    id_paciente = req.usuario.id;
    id_medico = req.body.id_medico;
    if (estaVacio(id_medico)) {
      return res.status(400).json({ error: 'El campo "id_medico" es obligatorio.' });
    }
    remitente = 'paciente';
  }

  try {
    if (req.usuario.rol === 'medico') {
      const [pacientes] = await db.query('SELECT id FROM pacientes WHERE id = ?', [id_paciente]);
      if (pacientes.length === 0) {
        return res.status(404).json({ error: 'Paciente no encontrado.' });
      }
    } else {
      const [medicos] = await db.query(
        `SELECT id FROM medicos WHERE id = ? AND estado_solicitud = 'aprobado'`,
        [id_medico]
      );
      if (medicos.length === 0) {
        return res.status(404).json({ error: 'Médico no encontrado o no aprobado.' });
      }
    }

    const [resultado] = await db.query(
      `INSERT INTO mensajes (id_paciente, id_medico, remitente, contenido, leido)
       VALUES (?, ?, ?, ?, 0)`,
      [id_paciente, id_medico, remitente, textoLimpio]
    );

    const [filas] = await db.query('SELECT * FROM mensajes WHERE id = ?', [resultado.insertId]);
    const mensajeCreado = filas[0];

    // Notificación en tiempo real al destinatario (el polling sigue activo como respaldo).
    if (remitente === 'medico') {
      emitirMensaje('paciente', id_paciente, mensajeCreado);
    } else {
      emitirMensaje('medico', id_medico, mensajeCreado);
    }

    return res.status(201).json(mensajeCreado);
  } catch (error) {
    console.error('Error al enviar mensaje:', error);
    return res.status(500).json({ error: 'Error del servidor al enviar el mensaje.' });
  }
}

function verificarOwnershipConversacion(req, res) {
  const { id_paciente, id_medico } = req.params;

  if (req.usuario.rol === 'medico') {
    if (Number(req.usuario.id) !== Number(id_medico)) {
      res.status(403).json({ error: 'Esta conversación no te pertenece.' });
      return false;
    }
  } else if (Number(req.usuario.id) !== Number(id_paciente)) {
    res.status(403).json({ error: 'Esta conversación no te pertenece.' });
    return false;
  }

  return true;
}

async function listarConversacion(req, res) {
  const { id_paciente, id_medico } = req.params;

  if (!verificarOwnershipConversacion(req, res)) {
    return;
  }

  try {
    const [mensajes] = await db.query(
      'SELECT * FROM mensajes WHERE id_paciente = ? AND id_medico = ? ORDER BY fecha_hora ASC, id ASC',
      [id_paciente, id_medico]
    );
    return res.status(200).json(mensajes);
  } catch (error) {
    console.error('Error al listar conversación:', error);
    return res.status(500).json({ error: 'Error del servidor al obtener la conversación.' });
  }
}

async function marcarLeidos(req, res) {
  const { id_paciente, id_medico } = req.params;

  if (!verificarOwnershipConversacion(req, res)) {
    return;
  }

  const remitenteAMarcar = req.usuario.rol === 'medico' ? 'paciente' : 'medico';

  try {
    const [resultado] = await db.query(
      `UPDATE mensajes SET leido = 1
       WHERE id_paciente = ? AND id_medico = ? AND remitente = ? AND leido = 0`,
      [id_paciente, id_medico, remitenteAMarcar]
    );

    return res.status(200).json({ actualizados: resultado.affectedRows });
  } catch (error) {
    console.error('Error al marcar mensajes como leídos:', error);
    return res.status(500).json({ error: 'Error del servidor al marcar los mensajes como leídos.' });
  }
}

async function contarNoLeidos(req, res) {
  try {
    let filas;

    if (req.usuario.rol === 'medico') {
      [filas] = await db.query(
        `SELECT COUNT(*) AS no_leidos FROM mensajes
         WHERE id_medico = ? AND remitente = 'paciente' AND leido = 0`,
        [req.usuario.id]
      );
    } else {
      [filas] = await db.query(
        `SELECT COUNT(*) AS no_leidos FROM mensajes
         WHERE id_paciente = ? AND remitente = 'medico' AND leido = 0`,
        [req.usuario.id]
      );
    }

    return res.status(200).json({ no_leidos: filas[0].no_leidos });
  } catch (error) {
    console.error('Error al contar mensajes no leídos:', error);
    return res.status(500).json({ error: 'Error del servidor al contar los mensajes no leídos.' });
  }
}

// Bandeja de conversaciones con último mensaje y contador individual de no leídos.
async function listarConversaciones(req, res) {
  try {
    if (req.usuario.rol === 'medico') {
      const [filas] = await db.query(
        `SELECT
           p.id,
           p.nombre,
           p.edad,
           ult.contenido AS ultimo_mensaje,
           ult.fecha_hora AS ultima_fecha,
           ult.remitente AS ultimo_remitente,
           COALESCE(nl.no_leidos, 0) AS no_leidos
         FROM pacientes p
         LEFT JOIN (
           SELECT m1.id_paciente, m1.contenido, m1.fecha_hora, m1.remitente
           FROM mensajes m1
           INNER JOIN (
             SELECT id_paciente, MAX(id) AS max_id
             FROM mensajes
             WHERE id_medico = ?
             GROUP BY id_paciente
           ) m2 ON m1.id = m2.max_id
         ) ult ON ult.id_paciente = p.id
         LEFT JOIN (
           SELECT id_paciente, COUNT(*) AS no_leidos
           FROM mensajes
           WHERE id_medico = ? AND remitente = 'paciente' AND leido = 0
           GROUP BY id_paciente
         ) nl ON nl.id_paciente = p.id
         ORDER BY (COALESCE(nl.no_leidos, 0) > 0) DESC, (ult.fecha_hora IS NULL) ASC, ult.fecha_hora DESC, p.nombre ASC`,
        [req.usuario.id, req.usuario.id]
      );
      return res.status(200).json(filas);
    }

    const [filas] = await db.query(
      `SELECT
         m.id,
         m.nombre,
         m.en_linea,
         e.nombre AS especialidad,
         ult.contenido AS ultimo_mensaje,
         ult.fecha_hora AS ultima_fecha,
         ult.remitente AS ultimo_remitente,
         COALESCE(nl.no_leidos, 0) AS no_leidos
       FROM medicos m
       JOIN especialidades e ON m.id_especialidad = e.id
       LEFT JOIN (
         SELECT m1.id_medico, m1.contenido, m1.fecha_hora, m1.remitente
         FROM mensajes m1
         INNER JOIN (
           SELECT id_medico, MAX(id) AS max_id
           FROM mensajes
           WHERE id_paciente = ?
           GROUP BY id_medico
         ) m2 ON m1.id = m2.max_id
       ) ult ON ult.id_medico = m.id
       LEFT JOIN (
         SELECT id_medico, COUNT(*) AS no_leidos
         FROM mensajes
         WHERE id_paciente = ? AND remitente = 'medico' AND leido = 0
         GROUP BY id_medico
       ) nl ON nl.id_medico = m.id
       WHERE m.estado_solicitud = 'aprobado'
       ORDER BY (COALESCE(nl.no_leidos, 0) > 0) DESC, (ult.fecha_hora IS NULL) ASC, ult.fecha_hora DESC, m.nombre ASC`,
      [req.usuario.id, req.usuario.id]
    );
    return res.status(200).json(filas);
  } catch (error) {
    console.error('Error al listar conversaciones:', error);
    return res.status(500).json({ error: 'Error del servidor al obtener las conversaciones.' });
  }
}

module.exports = {
  enviar,
  listarConversacion,
  marcarLeidos,
  contarNoLeidos,
  listarConversaciones
};
