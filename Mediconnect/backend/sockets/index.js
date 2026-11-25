const jwt = require('jsonwebtoken');
const db = require('../config/database');

let io = null;

function nombreRoom(rol, id) {
  return `${rol}_${id}`;
}

async function marcarEnLinea(idMedico, enLinea) {
  try {
    await db.query('UPDATE medicos SET en_linea = ? WHERE id = ?', [enLinea ? 1 : 0, idMedico]);
  } catch (error) {
    console.error('Error al actualizar en_linea del médico:', error);
  }
}

const EVENTOS_LLAMADA = [
  'llamar',
  'responder_llamada',
  'oferta_webrtc',
  'respuesta_webrtc',
  'candidato_ice',
  'colgar'
];

function registrarSenalizacionLlamada(socket) {
  const yo = socket.usuario;

  EVENTOS_LLAMADA.forEach((evento) => {
    socket.on(evento, (datos) => {
      const destino = datos && datos.destino;
      if (!destino || !destino.id || !destino.rol) return;

      const room = nombreRoom(destino.rol, destino.id);
      const haySocketsAhi = io.sockets.adapter.rooms.get(room);

      if (!haySocketsAhi || haySocketsAhi.size === 0) {
        if (evento === 'llamar') {
          socket.emit('llamada_error', { motivo: 'La otra persona no está conectada en este momento.' });
        }
        return;
      }

      io.to(room).emit(evento, { ...datos, de: { id: yo.id, rol: yo.rol, nombre: yo.nombre } });
    });
  });
}

function inicializarSockets(server) {
  const { Server } = require('socket.io');
  const corsOrigin = process.env.CORS_ORIGIN || '*';
  io = new Server(server, {
    cors: { origin: corsOrigin }
  });

  io.use((socket, next) => {
    const token = socket.handshake.auth && socket.handshake.auth.token;
    if (!token) {
      return next(new Error('Token no proporcionado.'));
    }

    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      if (payload.rol !== 'medico' && payload.rol !== 'paciente') {
        return next(new Error('Rol no reconocido.'));
      }
      socket.usuario = { id: payload.id, rol: payload.rol };
      next();
    } catch (error) {
      next(new Error('Token inválido o expirado.'));
    }
  });

  io.on('connection', async (socket) => {
    const { id, rol } = socket.usuario;

    try {
      if (rol === 'medico') {
        const [filas] = await db.query(
          'SELECT id, nombre, estado_solicitud FROM medicos WHERE id = ?',
          [id]
        );
        if (filas.length === 0 || filas[0].estado_solicitud !== 'aprobado') {
          socket.disconnect(true);
          return;
        }
        socket.usuario.nombre = filas[0].nombre;
      } else {
        const [filas] = await db.query('SELECT id, nombre FROM pacientes WHERE id = ?', [id]);
        if (filas.length === 0) {
          socket.disconnect(true);
          return;
        }
        socket.usuario.nombre = filas[0].nombre;
      }

      const roomPropia = nombreRoom(rol, id);
      socket.join(roomPropia);
      registrarSenalizacionLlamada(socket);

      if (rol === 'medico') {
        await marcarEnLinea(id, true);
      }

      socket.on('disconnect', async () => {
        if (rol === 'medico') {
          // Solo marcar fuera de línea si ya no queda ninguna pestaña/dispositivo abierto del mismo médico.
          const socketsRestantes = io.sockets.adapter.rooms.get(roomPropia);
          if (!socketsRestantes || socketsRestantes.size === 0) {
            await marcarEnLinea(id, false);
          }
        }
      });
    } catch (error) {
      console.error('Error al inicializar conexión de socket:', error);
      socket.disconnect(true);
    }
  });

  return io;
}

function emitirAlertaMedico(idMedico, alerta) {
  if (!io) return;
  io.to(nombreRoom('medico', idMedico)).emit('nueva_alerta', alerta);
}

function emitirMensaje(rolDestino, idDestino, mensaje) {
  if (!io) return;
  io.to(nombreRoom(rolDestino, idDestino)).emit('nuevo_mensaje', mensaje);
}

module.exports = {
  inicializarSockets,
  emitirAlertaMedico,
  emitirMensaje
};
