/* ============================================================
   MediConnect — widget compartido de videollamada (WebRTC)
   Lo usan tanto la app de paciente como el panel de médico.
   Carga STUN + TURN opcional desde GET /api/config/ice.
   ============================================================ */

const Llamada = (() => {
  let iceServersCache = [{ urls: 'stun:stun.l.google.com:19302' }];

  let pc = null;
  let streamLocal = null;
  let destinoActual = null; // { id, rol, nombre }
  let estado = 'inactiva';  // inactiva | llamando | sonando | en_llamada
  let candidatosPendientes = [];
  let timerLlamada = null;
  let segundosLlamada = 0;

  async function obtenerIceServers() {
    try {
      const datos = await API.pedir('/config/ice');
      if (datos && Array.isArray(datos.iceServers) && datos.iceServers.length > 0) {
        iceServersCache = datos.iceServers;
      }
    } catch (e) {
      /* fallback al STUN público de Google */
    }
    return iceServersCache;
  }

  function formatearTiempo(seg) {
    const mm = String(Math.floor(seg / 60)).padStart(2, '0');
    const ss = String(seg % 60).padStart(2, '0');
    return `${mm}:${ss}`;
  }

  function iniciarCronometro() {
    detenerCronometro();
    segundosLlamada = 0;
    const el = document.getElementById('llamada-cronometro');
    if (el) el.textContent = '00:00';
    timerLlamada = setInterval(() => {
      segundosLlamada += 1;
      if (el) el.textContent = formatearTiempo(segundosLlamada);
    }, 1000);
  }

  function detenerCronometro() {
    if (timerLlamada) {
      clearInterval(timerLlamada);
      timerLlamada = null;
    }
  }

  function inyectarUI() {
    if (document.getElementById('overlay-llamada')) return;

    const div = document.createElement('div');
    div.id = 'overlay-llamada';
    div.className = 'llamada-fondo oculto';
    div.innerHTML = `
      <div class="llamada-caja" id="llamada-caja-entrante">
        <div class="llamada-avatar">📹</div>
        <h2 id="llamada-nombre">—</h2>
        <p class="texto-suave" id="llamada-estado-texto">Conectando…</p>
        <div class="llamada-botones">
          <button type="button" class="boton boton-peligro" id="btn-rechazar-llamada">Rechazar</button>
          <button type="button" class="boton" id="btn-aceptar-llamada">Aceptar</button>
        </div>
      </div>
      <div class="llamada-activa oculto" id="llamada-activa">
        <div class="llamada-barra-sup">
          <span id="llamada-nombre-activo">En videoconsulta</span>
          <span id="llamada-cronometro">00:00</span>
        </div>
        <video id="video-remoto" autoplay playsinline></video>
        <video id="video-local" autoplay playsinline muted></video>
        <div class="llamada-controles">
          <button type="button" class="boton-control" id="btn-mute" title="Silenciar micrófono">🎤</button>
          <button type="button" class="boton-control" id="btn-camara" title="Apagar cámara">📷</button>
          <button type="button" class="boton-control boton-colgar" id="btn-colgar" title="Colgar">📞</button>
        </div>
      </div>`;
    document.body.appendChild(div);

    document.getElementById('btn-rechazar-llamada').addEventListener('click', alColgarOCancelar);
    document.getElementById('btn-aceptar-llamada').addEventListener('click', aceptar);
    document.getElementById('btn-colgar').addEventListener('click', alColgarOCancelar);
    document.getElementById('btn-mute').addEventListener('click', alternarMicrofono);
    document.getElementById('btn-camara').addEventListener('click', alternarCamara);
  }

  function mostrarCajaEntrante(nombre, textoEstado, soyReceptor) {
    inyectarUI();
    document.getElementById('overlay-llamada').classList.remove('oculto');
    document.getElementById('llamada-caja-entrante').classList.remove('oculto');
    document.getElementById('llamada-activa').classList.add('oculto');
    document.getElementById('llamada-nombre').textContent = nombre;
    document.getElementById('llamada-estado-texto').textContent = textoEstado;
    document.getElementById('btn-aceptar-llamada').classList.toggle('oculto', !soyReceptor);
    document.getElementById('btn-rechazar-llamada').textContent = soyReceptor ? 'Rechazar' : 'Cancelar';
  }

  function mostrarPantallaActiva() {
    estado = 'en_llamada';
    document.getElementById('llamada-caja-entrante').classList.add('oculto');
    document.getElementById('llamada-activa').classList.remove('oculto');
    const nombreEl = document.getElementById('llamada-nombre-activo');
    if (nombreEl) nombreEl.textContent = (destinoActual && destinoActual.nombre) || 'Videoconsulta';
    iniciarCronometro();
  }

  function ocultarTodo() {
    const overlay = document.getElementById('overlay-llamada');
    if (overlay) overlay.classList.add('oculto');
  }

  async function obtenerMediosLocales() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('Tu navegador requiere HTTPS para acceder a la cámara y al micrófono.');
    }
    try {
      return await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    } catch (errVideo) {
      // Fallback a solo audio si el equipo no tiene cámara conectada
      return await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
    }
  }

  async function crearConexionYObtenerMedios() {
    const iceServers = await obtenerIceServers();
    streamLocal = await obtenerMediosLocales();
    document.getElementById('video-local').srcObject = streamLocal;

    pc = new RTCPeerConnection({ iceServers });
    streamLocal.getTracks().forEach((track) => pc.addTrack(track, streamLocal));

    pc.ontrack = (evento) => {
      document.getElementById('video-remoto').srcObject = evento.streams[0];
    };

    pc.onicecandidate = (evento) => {
      if (evento.candidate && destinoActual) {
        socket.emit('candidato_ice', { destino: destinoActual, candidato: evento.candidate });
      }
    };

    pc.onconnectionstatechange = () => {
      if (!pc) return;
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected' || pc.connectionState === 'closed') {
        if (estado === 'en_llamada') {
          limpiarTodo();
          alert('La conexión de videollamada se cerró.');
        }
      }
    };
  }

  async function aplicarCandidatosPendientes() {
    for (const candidato of candidatosPendientes) {
      try { await pc.addIceCandidate(candidato); } catch (e) { /* candidato tardío */ }
    }
    candidatosPendientes = [];
  }

  function limpiarTodo() {
    detenerCronometro();
    if (pc) {
      pc.onconnectionstatechange = null;
      pc.close();
      pc = null;
    }
    if (streamLocal) {
      streamLocal.getTracks().forEach((t) => t.stop());
      streamLocal = null;
    }
    const videoRemoto = document.getElementById('video-remoto');
    const videoLocal = document.getElementById('video-local');
    if (videoRemoto) videoRemoto.srcObject = null;
    if (videoLocal) videoLocal.srcObject = null;

    // Restablecer visualmente los botones de mute/cámara para la próxima llamada
    const btnMute = document.getElementById('btn-mute');
    const btnCam = document.getElementById('btn-camara');
    if (btnMute) btnMute.classList.remove('control-apagado');
    if (btnCam) btnCam.classList.remove('control-apagado');

    destinoActual = null;
    estado = 'inactiva';
    candidatosPendientes = [];
    ocultarTodo();
  }

  function iniciar(destino) {
    if (!destino || !destino.id || !destino.rol) return;
    if (estado !== 'inactiva') {
      alert('Ya tienes una llamada en curso.');
      return;
    }
    destinoActual = destino;
    estado = 'llamando';
    mostrarCajaEntrante(destino.nombre || 'Contacto', 'Llamando…', false);
    socket.emit('llamar', { destino });
  }

  async function aceptar() {
    const btn = document.getElementById('btn-aceptar-llamada');
    btn.disabled = true;
    try {
      await crearConexionYObtenerMedios();
      socket.emit('responder_llamada', { destino: destinoActual, aceptar: true });
      document.getElementById('llamada-estado-texto').textContent = 'Conectando…';
    } catch (error) {
      alert('No se pudo acceder a la cámara o al micrófono: ' + error.message);
      socket.emit('responder_llamada', { destino: destinoActual, aceptar: false });
      limpiarTodo();
    } finally {
      btn.disabled = false;
    }
  }

  function alColgarOCancelar() {
    if (estado === 'sonando') {
      socket.emit('responder_llamada', { destino: destinoActual, aceptar: false });
    } else if (destinoActual) {
      socket.emit('colgar', { destino: destinoActual });
    }
    limpiarTodo();
  }

  function alternarMicrofono() {
    if (!streamLocal) return;
    const pistas = streamLocal.getAudioTracks();
    if (pistas.length === 0) return;
    const activo = pistas[0].enabled;
    pistas.forEach((t) => { t.enabled = !activo; });
    document.getElementById('btn-mute').classList.toggle('control-apagado', activo);
  }

  function alternarCamara() {
    if (!streamLocal) return;
    const pistas = streamLocal.getVideoTracks();
    if (pistas.length === 0) return;
    const activo = pistas[0].enabled;
    pistas.forEach((t) => { t.enabled = !activo; });
    document.getElementById('btn-camara').classList.toggle('control-apagado', activo);
  }

  socket.on('llamar', ({ de }) => {
    if (estado !== 'inactiva') {
      socket.emit('responder_llamada', { destino: de, aceptar: false });
      return;
    }
    destinoActual = de;
    estado = 'sonando';
    mostrarCajaEntrante(de.nombre || 'Alguien', 'te está llamando…', true);
  });

  socket.on('responder_llamada', async ({ de, aceptar: aceptada }) => {
    if (estado !== 'llamando') return;
    if (!aceptada) {
      alert(`${de.nombre || 'La otra persona'} rechazó la llamada.`);
      limpiarTodo();
      return;
    }
    try {
      document.getElementById('llamada-estado-texto').textContent = 'Conectando…';
      await crearConexionYObtenerMedios();
      const oferta = await pc.createOffer();
      await pc.setLocalDescription(oferta);
      socket.emit('oferta_webrtc', { destino: destinoActual, sdp: pc.localDescription });
    } catch (error) {
      alert('No se pudo acceder a la cámara o al micrófono: ' + error.message);
      socket.emit('colgar', { destino: destinoActual });
      limpiarTodo();
    }
  });

  socket.on('oferta_webrtc', async ({ sdp }) => {
    if (!pc) return;
    await pc.setRemoteDescription(sdp);
    await aplicarCandidatosPendientes();
    const respuesta = await pc.createAnswer();
    await pc.setLocalDescription(respuesta);
    socket.emit('respuesta_webrtc', { destino: destinoActual, sdp: pc.localDescription });
    mostrarPantallaActiva();
  });

  socket.on('respuesta_webrtc', async ({ sdp }) => {
    if (!pc) return;
    await pc.setRemoteDescription(sdp);
    await aplicarCandidatosPendientes();
    mostrarPantallaActiva();
  });

  socket.on('candidato_ice', async ({ candidato }) => {
    if (pc && pc.remoteDescription) {
      try { await pc.addIceCandidate(candidato); } catch (e) { /* ignorar */ }
    } else {
      candidatosPendientes.push(candidato);
    }
  });

  socket.on('colgar', () => {
    if (estado !== 'inactiva') limpiarTodo();
  });

  socket.on('llamada_error', ({ motivo }) => {
    alert(motivo);
    limpiarTodo();
  });

  return { iniciar };
})();
