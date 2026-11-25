/* ============================================================
   MediConnect — lógica de la app del paciente
   Requiere js/api.js y socket.io cargados antes.
   ============================================================ */

exigirSesion('paciente');

const usuario = API.usuario();
const miId = usuario.id;

function iniciales(nombre) {
  if (!nombre) return '--';
  const partes = nombre.trim().split(/\s+/);
  const primeras = partes.length === 1 ? partes[0].slice(0, 2) : partes[0][0] + partes[1][0];
  return primeras.toUpperCase();
}

document.getElementById('avatar-topbar').textContent = iniciales(usuario.nombre);
document.getElementById('saludo').textContent = `Hola, ${usuario.nombre.split(' ')[0]}`;
document.getElementById('btn-salir').addEventListener('click', () => API.cerrarSesion());

function saludoSegunHora() {
  const hora = new Date().getHours();
  if (hora < 12) return 'Buenos días';
  if (hora < 19) return 'Buenas tardes';
  return 'Buenas noches';
}

document.getElementById('riel-pac-iniciales').textContent = iniciales(usuario.nombre);
document.getElementById('riel-pac-saludo').textContent = `${saludoSegunHora()}, ${usuario.nombre.split(' ')[0]}`;
document.getElementById('riel-pac-fecha').textContent = new Date().toLocaleDateString('es-VE', {
  weekday: 'long', day: 'numeric', month: 'long'
});

async function cargarRielPaciente() {
  const hoy = fechaLocalISO();
  try {
    const citas = await API.pedir('/citas');
    const proximas = citas
      .filter((c) => c.estado !== 'Cancelada' && c.estado !== 'Completada' && String(c.fecha).slice(0, 10) >= hoy)
      .sort((a, b) => (String(a.fecha).slice(0, 10) + a.hora).localeCompare(String(b.fecha).slice(0, 10) + b.hora));

    document.getElementById('riel-pac-citas').textContent = proximas.length;

    const contLista = document.getElementById('riel-pac-lista-citas');
    contLista.innerHTML = proximas.length === 0
      ? '<div class="vacio">Sin citas próximas.</div>'
      : proximas.slice(0, 4).map((c) => `
          <div class="item-cita-mini">
            <span class="hora-cita">${formatearHora(c.hora)}</span>
            <div class="crece">
              <div class="titulo">${escaparHtml(c.nombre_medico || 'Médico')}</div>
              <div class="detalle">${formatearFecha(c.fecha)} · ${escaparHtml(c.tipo_consulta || '')}</div>
            </div>
            ${chipEstadoCita(c.estado)}
          </div>`).join('');
  } catch (error) {
    document.getElementById('riel-pac-citas').textContent = '—';
  }

  try {
    const medicamentos = await API.pedir(`/medicamentos/paciente/${miId}`);
    const activos = medicamentos.filter((m) => !m.fecha_fin || String(m.fecha_fin).slice(0, 10) >= hoy);
    document.getElementById('riel-pac-medicamentos').textContent = activos.length;
  } catch (error) {
    document.getElementById('riel-pac-medicamentos').textContent = '—';
  }
}

/* ============================================================
   Socket.io — videollamadas y mensajes en tiempo real
   ============================================================ */

const socket = io(API.socketUrl(), { auth: { token: API.token() } });
socket.on('connect_error', (error) => {
  console.warn('No se pudo conectar el canal en vivo:', error.message);
});

socket.on('nuevo_mensaje', (msg) => {
  actualizarBadgeMensajes();
  if (chatMedicoActual && Number(msg.id_medico) === Number(chatMedicoActual)) {
    refrescarConversacion(true);
  } else if (!document.getElementById('seccion-mensajes').classList.contains('oculto')) {
    cargarListaMedicosChat();
  }
});

/* ============================================================
   Navegación entre secciones
   ============================================================ */

const SECCIONES = ['inicio', 'salud', 'flash', 'citas', 'mensajes', 'perfil'];
const TITULOS_PACIENTE = {
  inicio: `Hola, ${usuario.nombre.split(' ')[0]}`,
  salud: 'Mi salud',
  flash: 'Diagnóstico Flash',
  citas: 'Citas',
  mensajes: 'Mensajes',
  perfil: 'Mi perfil'
};

function mostrarSeccion(nombre) {
  SECCIONES.forEach((s) => {
    document.getElementById(`seccion-${s}`).classList.toggle('oculto', s !== nombre);
  });
  document.querySelectorAll('.nav-inferior button').forEach((btn) => {
    btn.classList.toggle('activo', btn.dataset.seccion === nombre);
  });
  if (TITULOS_PACIENTE[nombre]) document.getElementById('saludo').textContent = TITULOS_PACIENTE[nombre];

  if (nombre !== 'mensajes') detenerPollingChat();

  if (nombre === 'inicio') cargarInicio();
  if (nombre === 'salud') { cargarSignosVitales(); cargarLaboratorio(); }
  if (nombre === 'citas') { cargarSelectMedicos(); cargarCitas(); }
  if (nombre === 'mensajes') cargarListaMedicosChat();
  if (nombre === 'perfil') cargarPerfil();
}

document.querySelectorAll('.nav-inferior button').forEach((btn) => {
  btn.addEventListener('click', () => mostrarSeccion(btn.dataset.seccion));
});
document.querySelectorAll('[data-ir]').forEach((btn) => {
  btn.addEventListener('click', () => mostrarSeccion(btn.dataset.ir));
});
document.getElementById('btn-perfil').addEventListener('click', () => mostrarSeccion('perfil'));

document.querySelectorAll('#seccion-salud .pestanas button').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#seccion-salud .pestanas button').forEach((b) => b.classList.remove('activo'));
    btn.classList.add('activo');
    document.getElementById('subseccion-signos').classList.toggle('oculto', btn.dataset.subseccion !== 'signos');
    document.getElementById('subseccion-laboratorio').classList.toggle('oculto', btn.dataset.subseccion !== 'laboratorio');
  });
});

/* ============================================================
   INICIO — aviso crítico, citas, medicamentos e indicaciones
   ============================================================ */

async function cargarInicio() {
  cargarBannerCritico();
  cargarInicioCitas();
  cargarMedicamentos();
  cargarIndicaciones();
  cargarRielPaciente();
}

async function cargarBannerCritico() {
  const cont = document.getElementById('inicio-banner-critico');
  try {
    const signos = await API.pedir(`/pacientes/${miId}/signos-vitales`);
    if (signos.length === 0) { cont.innerHTML = ''; return; }
    const ultimo = signos[0];
    const criticos = evaluarSignoCritico(ultimo);
    if (criticos.length === 0) { cont.innerHTML = ''; return; }
    cont.innerHTML = `
      <div class="banner-critico">
        <strong>Última medición fuera de rango (${formatearFechaHora(ultimo.fecha_hora)})</strong>
        <p>${escaparHtml(criticos.join(' · '))}. Tu médico fue alertado automáticamente. Si sientes síntomas fuertes, usa Diagnóstico Flash o acude a urgencias.</p>
      </div>`;
  } catch (e) {
    cont.innerHTML = '';
  }
}

async function cargarInicioCitas() {
  const contenedor = document.getElementById('inicio-citas');
  try {
    const citas = await API.pedir('/citas');
    const hoy = fechaLocalISO();
    const proximas = citas
      .filter((c) => c.estado !== 'Cancelada' && c.estado !== 'Completada' && String(c.fecha).slice(0, 10) >= hoy)
      .slice(0, 3);

    if (proximas.length === 0) {
      contenedor.innerHTML = '<div class="vacio">No tienes citas próximas.</div>';
      return;
    }

    contenedor.innerHTML = proximas.map((c) => `
      <div class="item-lista">
        <div>
          <div class="titulo">${escaparHtml(c.nombre_medico || 'Médico')}</div>
          <div class="detalle">${formatearFecha(c.fecha)} · ${formatearHora(c.hora)} — ${escaparHtml(c.tipo_consulta || '')}</div>
        </div>
        ${chipEstadoCita(c.estado)}
      </div>`).join('');
  } catch (error) {
    contenedor.innerHTML = `<div class="vacio">${escaparHtml(error.message)}</div>`;
  }
}

function chipEstadoCita(estado) {
  const clases = {
    Pendiente: 'chip-ambar', Programada: 'chip-morado', Confirmada: 'chip-verde',
    Completada: 'chip', Cancelada: 'chip-rojo'
  };
  return `<span class="chip ${clases[estado] || ''}">${escaparHtml(estado)}</span>`;
}

async function cargarMedicamentos() {
  const contenedor = document.getElementById('inicio-medicamentos');
  try {
    const medicamentos = await API.pedir(`/medicamentos/paciente/${miId}`);
    if (medicamentos.length === 0) {
      contenedor.innerHTML = '<div class="vacio">Aún no tienes medicamentos recetados.</div>';
      return;
    }

    const hoy = fechaLocalISO();
    contenedor.innerHTML = medicamentos.map((m) => {
      const vigente = !m.fecha_fin || String(m.fecha_fin).slice(0, 10) >= hoy;
      return `
        <div class="item-lista">
          <div class="crece">
            <div class="titulo">${escaparHtml(m.nombre)} — ${escaparHtml(m.dosis || '')}</div>
            <div class="detalle">${escaparHtml(m.frecuencia || '')}${m.instrucciones ? ' · ' + escaparHtml(m.instrucciones) : ''}</div>
            <div class="detalle">Recetado por ${escaparHtml(m.nombre_medico || 'tu médico')} · hasta ${m.fecha_fin ? formatearFecha(m.fecha_fin) : 'indefinido'}</div>
            <div class="detalle" id="tomas-${m.id}"></div>
          </div>
          ${vigente
            ? `<button class="boton boton-chico" data-toma="${m.id}">✓ Tomada</button>`
            : '<span class="chip">Finalizado</span>'}
        </div>`;
    }).join('');

    contenedor.querySelectorAll('[data-toma]').forEach((btn) => {
      btn.addEventListener('click', () => marcarToma(btn.dataset.toma, btn));
    });

    medicamentos.forEach((m) => cargarTomasDeHoy(m.id));
  } catch (error) {
    contenedor.innerHTML = `<div class="vacio">${escaparHtml(error.message)}</div>`;
  }
}

async function cargarTomasDeHoy(idMedicamento) {
  const contenedor = document.getElementById(`tomas-${idMedicamento}`);
  if (!contenedor) return;
  try {
    const tomas = await API.pedir(`/medicamentos/${idMedicamento}/tomas`);
    const hoy = fechaLocalISO();
    const deHoy = tomas.filter((t) => String(t.fecha).slice(0, 10) === hoy);
    contenedor.textContent = deHoy.length > 0
      ? `Hoy: ${deHoy.length} toma(s) — última ${formatearHora(deHoy[0].hora)}`
      : 'Hoy: sin tomas registradas';
  } catch (error) { /* silencioso */ }
}

async function marcarToma(idMedicamento, boton) {
  boton.disabled = true;
  try {
    await API.pedir(`/medicamentos/${idMedicamento}/tomas`, { metodo: 'POST' });
    boton.textContent = '✓ Registrada';
    cargarTomasDeHoy(idMedicamento);
    setTimeout(() => { boton.textContent = '✓ Tomada'; boton.disabled = false; }, 2500);
  } catch (error) {
    alert(error.message);
    boton.disabled = false;
  }
}

async function cargarIndicaciones() {
  const contenedor = document.getElementById('inicio-indicaciones');
  try {
    const indicaciones = await API.pedir(`/pacientes/${miId}/indicaciones`);
    if (indicaciones.length === 0) {
      contenedor.innerHTML = '<div class="vacio">Sin indicaciones por ahora.</div>';
      return;
    }
    contenedor.innerHTML = indicaciones.slice(0, 5).map((i) => `
      <div class="item-lista">
        <div>
          <div class="titulo">${escaparHtml(i.descripcion)}</div>
          <div class="detalle">${formatearFecha(i.fecha_creacion)}${i.nombre_medico ? ' · Dr(a). ' + escaparHtml(i.nombre_medico) : ''}</div>
        </div>
      </div>`).join('');
  } catch (error) {
    contenedor.innerHTML = `<div class="vacio">${escaparHtml(error.message)}</div>`;
  }
}

/* ============================================================
   SALUD — signos vitales con vista previa de foto y glicemia
   ============================================================ */

document.getElementById('sv-foto').addEventListener('change', (e) => {
  const preview = document.getElementById('sv-foto-preview');
  const archivo = e.target.files[0];
  if (!archivo) {
    preview.classList.add('oculto');
    preview.innerHTML = '';
    return;
  }
  if (archivo.size > 5 * 1024 * 1024) {
    alert('La foto supera el límite de 5 MB. Por favor elige una imagen más liviana.');
    e.target.value = '';
    preview.classList.add('oculto');
    preview.innerHTML = '';
    return;
  }
  const url = URL.createObjectURL(archivo);
  preview.classList.remove('oculto');
  preview.innerHTML = `<div class="preview-foto-caja"><img src="${url}" alt="Vista previa"><span class="texto-suave">${escaparHtml(archivo.name)}</span></div>`;
});

document.getElementById('form-signos').addEventListener('submit', async (evento) => {
  evento.preventDefault();
  const zonaAviso = document.getElementById('aviso-signos');
  limpiarAviso(zonaAviso);

  const archivo = document.getElementById('sv-foto').files[0];
  if (!archivo) {
    mostrarAviso(zonaAviso, 'error', 'Debes adjuntar la foto del aparato.');
    return;
  }

  const btn = document.getElementById('btn-guardar-signos');
  btn.disabled = true;

  const formData = new FormData();
  formData.append('presion_arterial', document.getElementById('sv-presion').value.trim());
  formData.append('frecuencia_cardiaca', document.getElementById('sv-fc').value);
  formData.append('spo2', document.getElementById('sv-spo2').value);
  formData.append('temperatura', document.getElementById('sv-temp').value);
  const glicemiaVal = document.getElementById('sv-glicemia').value.trim();
  if (glicemiaVal) formData.append('glicemia', glicemiaVal);
  formData.append('foto_evidencia', archivo);

  try {
    const resp = await API.pedir(`/pacientes/${miId}/signos-vitales`, { metodo: 'POST', formData });
    const textoExito = resp && resp.alerta_generada
      ? 'Medición guardada. Se detectó un valor fuera de rango y se envió una alerta automática a tu médico.'
      : 'Medición guardada correctamente con su foto de respaldo.';
    mostrarAviso(zonaAviso, resp && resp.alerta_generada ? 'info' : 'exito', textoExito);
    document.getElementById('form-signos').reset();
    const preview = document.getElementById('sv-foto-preview');
    preview.classList.add('oculto');
    preview.innerHTML = '';
    cargarSignosVitales();
    cargarBannerCritico();
  } catch (error) {
    mostrarAviso(zonaAviso, 'error', error.message);
  } finally {
    btn.disabled = false;
  }
});

async function cargarSignosVitales() {
  const contenedor = document.getElementById('lista-signos');
  try {
    const signos = await API.pedir(`/pacientes/${miId}/signos-vitales`);
    if (signos.length === 0) {
      contenedor.innerHTML = '<div class="vacio">Aún no has registrado mediciones.</div>';
      return;
    }
    contenedor.innerHTML = signos.slice(0, 15).map((s) => {
      const criticos = evaluarSignoCritico(s);
      const resumen = `PA ${s.presion_arterial} · FC ${s.frecuencia_cardiaca} · SpO2 ${s.spo2}% · ${s.temperatura}°C${s.glicemia != null ? ' · Glicemia ' + s.glicemia + ' mg/dL' : ''}`;
      return `
        <div class="item-lista ${criticos.length > 0 ? 'item-critico' : ''}">
          <div class="crece">
            <div class="titulo">
              ${escaparHtml(resumen)}
              ${criticos.length > 0 ? '<span class="chip chip-rojo">Fuera de rango</span>' : ''}
            </div>
            <div class="detalle">${formatearFechaHora(s.fecha_hora)} · ${s.origen === 'consulta' ? 'En consulta' : 'Auto-reportado'}</div>
          </div>
          ${s.foto_evidencia
            ? `<button type="button" class="boton boton-chico boton-secundario" data-visor-url="${escaparHtml(API.urlArchivo(s.foto_evidencia))}" data-visor-titulo="Respaldo de medición" data-visor-detalle="${escaparHtml(resumen + ' (' + formatearFechaHora(s.fecha_hora) + ')')}">Ver foto</button>`
            : ''}
        </div>`;
    }).join('');

    contenedor.querySelectorAll('[data-visor-url]').forEach((btn) => {
      btn.addEventListener('click', () => {
        abrirVisorFoto(btn.dataset.visorUrl, btn.dataset.visorTitulo, btn.dataset.visorDetalle);
      });
    });
  } catch (error) {
    contenedor.innerHTML = `<div class="vacio">${escaparHtml(error.message)}</div>`;
  }
}

/* ============================================================
   SALUD — laboratorio
   ============================================================ */

async function cargarLaboratorio() {
  const contPendientes = document.getElementById('lista-lab-pendientes');
  const contCompletados = document.getElementById('lista-lab-completados');
  try {
    const ordenes = await API.pedir(`/pacientes/${miId}/laboratorio`);
    const pendientes = ordenes.filter((o) => o.estado_orden === 'pendiente');
    const completadas = ordenes.filter((o) => o.estado_orden === 'completado');

    contPendientes.innerHTML = pendientes.length === 0
      ? '<div class="vacio">No tienes exámenes pendientes.</div>'
      : pendientes.map((o) => `
          <div class="item-lista" style="display:block">
            <div class="titulo">${escaparHtml(o.tipo_examen)}</div>
            <div class="detalle">Ordenado el ${formatearFecha(o.fecha_orden)}${o.nombre_medico ? ' · Dr(a). ' + escaparHtml(o.nombre_medico) : ''}</div>
            <form class="mt-1" data-orden="${o.id}">
              <div class="campos-dobles">
                <div class="campo">
                  <label>Valor obtenido *</label>
                  <input type="number" step="0.01" name="valor" required>
                </div>
                <div class="campo">
                  <label>Unidad *</label>
                  <input type="text" name="unidad" placeholder="mg/dL" required>
                </div>
              </div>
              <div class="campos-dobles">
                <div class="campo">
                  <label>¿Cómo salió? *</label>
                  <select name="estado_clinico" required>
                    <option value="">Según el informe…</option>
                    <option>Normal</option><option>Alta</option>
                    <option>Baja</option><option>Critico</option>
                  </select>
                </div>
                <div class="campo">
                  <label>Foto del informe *</label>
                  <input type="file" name="foto_evidencia" accept="image/*" capture="environment" required>
                </div>
              </div>
              <button type="submit" class="boton boton-chico">Subir resultado</button>
            </form>
          </div>`).join('');

    contPendientes.querySelectorAll('form[data-orden]').forEach((form) => {
      form.addEventListener('submit', (e) => { e.preventDefault(); completarOrden(form); });
    });

    contCompletados.innerHTML = completadas.length === 0
      ? '<div class="vacio">Sin resultados entregados.</div>'
      : completadas.map((o) => `
          <div class="item-lista">
            <div class="crece">
              <div class="titulo">${escaparHtml(o.tipo_examen)}: ${o.valor ?? '—'} ${escaparHtml(o.unidad || '')}</div>
              <div class="detalle">Entregado el ${formatearFecha(o.fecha_resultado)}</div>
            </div>
            <div class="fila">
              ${chipEstadoClinico(o.estado_clinico)}
              ${o.foto_evidencia
                ? `<button type="button" class="boton boton-chico boton-secundario" data-visor-url="${escaparHtml(API.urlArchivo(o.foto_evidencia))}" data-visor-titulo="${escaparHtml(o.tipo_examen)}" data-visor-detalle="${escaparHtml((o.valor ?? '—') + ' ' + (o.unidad || '') + ' · ' + (o.estado_clinico || ''))}">Foto</button>`
                : ''}
            </div>
          </div>`).join('');

    contCompletados.querySelectorAll('[data-visor-url]').forEach((btn) => {
      btn.addEventListener('click', () => {
        abrirVisorFoto(btn.dataset.visorUrl, btn.dataset.visorTitulo, btn.dataset.visorDetalle);
      });
    });
  } catch (error) {
    contPendientes.innerHTML = `<div class="vacio">${escaparHtml(error.message)}</div>`;
    contCompletados.innerHTML = '';
  }
}

function chipEstadoClinico(estado) {
  const clases = { Normal: 'chip-verde', Alta: 'chip-ambar', Baja: 'chip-ambar', Critico: 'chip-rojo' };
  return estado ? `<span class="chip ${clases[estado] || ''}">${escaparHtml(estado)}</span>` : '';
}

async function completarOrden(form) {
  const idOrden = form.dataset.orden;
  const archivo = form.elements.foto_evidencia.files[0];
  if (!archivo) { alert('Debes adjuntar la foto del informe.'); return; }
  if (archivo.size > 5 * 1024 * 1024) { alert('La foto supera el límite de 5 MB.'); return; }

  const formData = new FormData();
  formData.append('valor', form.elements.valor.value);
  formData.append('unidad', form.elements.unidad.value.trim());
  formData.append('estado_clinico', form.elements.estado_clinico.value);
  formData.append('foto_evidencia', archivo);

  try {
    await API.pedir(`/pacientes/laboratorio/${idOrden}`, { metodo: 'PUT', formData });
    cargarLaboratorio();
  } catch (error) {
    alert(error.message);
  }
}

/* ============================================================
   DIAGNÓSTICO FLASH — chat con IA Gemini
   ============================================================ */

const chatFlash = document.getElementById('chat-flash');
const entradaFlash = document.getElementById('entrada-flash');
const btnEnviarFlash = document.getElementById('btn-enviar-flash');
const avisoFlash = document.getElementById('aviso-flash');

function idFlashActual() { return localStorage.getItem('mc_flash_id'); }

document.getElementById('btn-iniciar-flash')?.addEventListener('click', iniciarFlash);
document.getElementById('btn-nuevo-flash').addEventListener('click', () => {
  localStorage.removeItem('mc_flash_id');
  iniciarFlash();
});

async function iniciarFlash() {
  limpiarAviso(avisoFlash);
  try {
    const datos = await API.pedir('/diagnostico-flash', { metodo: 'POST' });
    localStorage.setItem('mc_flash_id', datos.diagnostico.id);
    renderizarChatFlash(datos.mensajes);
    habilitarEntradaFlash(true);
  } catch (error) {
    mostrarAviso(avisoFlash, 'error', error.message);
  }
}

async function retomarFlash() {
  const id = idFlashActual();
  if (!id) return;
  try {
    const datos = await API.pedir(`/diagnostico-flash/${id}`);
    renderizarChatFlash(datos.mensajes || []);
    if (datos.diagnostico && datos.diagnostico.estado === 'urgente') {
      if (datos.conectar_con && datos.conectar_con.length > 0) {
        agregarBurbujaFlashConLlamada(datos.conectar_con);
      } else {
        agregarBurbujaFlash('Esta consulta ya fue clasificada como urgente y los médicos fueron notificados.', 'sistema');
      }
      habilitarEntradaFlash(false);
    } else {
      habilitarEntradaFlash(true);
    }
  } catch (error) {
    localStorage.removeItem('mc_flash_id');
  }
}

function habilitarEntradaFlash(habilitar) {
  entradaFlash.disabled = !habilitar;
  btnEnviarFlash.disabled = !habilitar;
}

function renderizarChatFlash(mensajes) {
  chatFlash.innerHTML = '';
  mensajes.forEach((m, indice) => {
    const esDisclaimer = indice === 0 && m.remitente === 'bot';
    agregarBurbujaFlash(m.contenido, m.remitente === 'paciente' ? 'mia' : (esDisclaimer ? 'sistema' : 'otro'));
  });
}

function agregarBurbujaFlash(texto, tipo) {
  const burbuja = document.createElement('div');
  burbuja.className = `burbuja burbuja-${tipo}`;
  burbuja.textContent = texto;
  chatFlash.appendChild(burbuja);
  chatFlash.scrollTop = chatFlash.scrollHeight;
}

function agregarBurbujaFlashConLlamada(medicos) {
  const burbuja = document.createElement('div');
  burbuja.className = 'burbuja burbuja-sistema';

  const texto = document.createElement('div');
  texto.textContent = '🩺 Hay médicos disponibles ahora mismo. Puedes llamar directo:';
  burbuja.appendChild(texto);

  medicos.forEach((m) => {
    const btn = document.createElement('button');
    btn.className = 'boton boton-chico mt-1';
    btn.style.display = 'block';
    btn.style.margin = '6px auto 0';
    btn.textContent = `📹 Llamar a ${m.nombre}`;
    btn.addEventListener('click', () => {
      Llamada.iniciar({ id: m.id, rol: 'medico', nombre: m.nombre });
    });
    burbuja.appendChild(btn);
  });

  chatFlash.appendChild(burbuja);
  chatFlash.scrollTop = chatFlash.scrollHeight;
}

document.getElementById('form-flash').addEventListener('submit', async (evento) => {
  evento.preventDefault();
  const contenido = entradaFlash.value.trim();
  const id = idFlashActual();
  if (!contenido || !id) return;

  limpiarAviso(avisoFlash);
  agregarBurbujaFlash(contenido, 'mia');
  entradaFlash.value = '';
  habilitarEntradaFlash(false);

  const escribiendo = document.createElement('div');
  escribiendo.className = 'burbuja burbuja-otro';
  escribiendo.textContent = 'Escribiendo…';
  chatFlash.appendChild(escribiendo);
  chatFlash.scrollTop = chatFlash.scrollHeight;

  try {
    const datos = await API.pedir(`/diagnostico-flash/${id}/mensajes`, {
      metodo: 'POST',
      cuerpo: { contenido }
    });
    escribiendo.remove();
    agregarBurbujaFlash(datos.mensaje_bot, 'otro');

    const estado = datos.diagnostico.estado;

    if (estado === 'urgente') {
      if (datos.conectar_con && datos.conectar_con.length > 0) {
        agregarBurbujaFlashConLlamada(datos.conectar_con);
      } else {
        agregarBurbujaFlash(
          '🔔 Ningún médico de la especialidad está en línea en este momento, pero ya TODOS fueron alertados de tu caso. Si te sientes peor, busca atención presencial de inmediato.',
          'sistema'
        );
      }
      habilitarEntradaFlash(false);
      localStorage.removeItem('mc_flash_id');
    } else if (estado === 'leve') {
      agregarBurbujaFlash(
        '✅ Tu caso parece leve. Sigue las recomendaciones y, si los síntomas empeoran, vuelve a escribir aquí: reevaluaremos tu caso.',
        'sistema'
      );
      habilitarEntradaFlash(true);
    } else {
      habilitarEntradaFlash(true);
    }
  } catch (error) {
    escribiendo.remove();
    if (error.status === 409) {
      agregarBurbujaFlash('Esta consulta ya fue clasificada como urgente y los médicos fueron notificados. Inicia una nueva consulta si necesitas otra orientación.', 'sistema');
      habilitarEntradaFlash(false);
      localStorage.removeItem('mc_flash_id');
    } else {
      mostrarAviso(avisoFlash, 'error', error.message);
      habilitarEntradaFlash(true);
    }
  }
});

/* ============================================================
   CITAS (con acceso directo a videoconsulta en citas confirmadas)
   ============================================================ */

async function cargarSelectMedicos() {
  const select = document.getElementById('cita-medico');
  try {
    const medicos = await API.pedir('/medicos');
    select.innerHTML = '<option value="">Selecciona un médico…</option>' +
      medicos.map((m) => `<option value="${m.id}">${escaparHtml(m.nombre)} — ${escaparHtml(m.especialidad)}</option>`).join('');
  } catch (error) {
    select.innerHTML = '<option value="">No se pudieron cargar</option>';
  }
}

document.getElementById('form-cita').addEventListener('submit', async (evento) => {
  evento.preventDefault();
  const zonaAviso = document.getElementById('aviso-citas');
  limpiarAviso(zonaAviso);

  try {
    await API.pedir('/citas', {
      metodo: 'POST',
      cuerpo: {
        id_medico: document.getElementById('cita-medico').value,
        fecha: document.getElementById('cita-fecha').value,
        hora: document.getElementById('cita-hora').value,
        tipo_consulta: document.getElementById('cita-tipo').value.trim()
      }
    });
    mostrarAviso(zonaAviso, 'exito', 'Cita solicitada. Espera la confirmación de tu médico.');
    document.getElementById('form-cita').reset();
    cargarCitas();
    cargarRielPaciente();
  } catch (error) {
    mostrarAviso(zonaAviso, 'error', error.message);
  }
});

async function cargarCitas() {
  const contenedor = document.getElementById('lista-citas');
  try {
    const citas = await API.pedir('/citas');
    if (citas.length === 0) {
      contenedor.innerHTML = '<div class="vacio">Aún no tienes citas.</div>';
      return;
    }
    contenedor.innerHTML = citas.map((c) => {
      const cancelable = c.estado !== 'Cancelada' && c.estado !== 'Completada';
      const puedeLlamar = c.estado === 'Confirmada' || c.estado === 'Programada';
      const nom = c.nombre_medico || 'Médico';
      return `
        <div class="item-lista">
          <div class="crece">
            <div class="titulo">${escaparHtml(nom)}${c.especialidad ? ' · ' + escaparHtml(c.especialidad) : ''}</div>
            <div class="detalle">${formatearFecha(c.fecha)} · ${formatearHora(c.hora)} — ${escaparHtml(c.tipo_consulta || '')}</div>
          </div>
          <div style="text-align:right">
            ${chipEstadoCita(c.estado)}
            <div class="fila mt-1" style="justify-content:flex-end">
              ${puedeLlamar ? `<button class="boton boton-chico" data-cita-llamar="${c.id_medico}" data-nombre="${escaparHtml(nom)}">📹 Video</button>` : ''}
              ${cancelable ? `<button class="boton boton-chico boton-peligro" data-cancelar="${c.id}">Cancelar</button>` : ''}
            </div>
          </div>
        </div>`;
    }).join('');

    contenedor.querySelectorAll('[data-cita-llamar]').forEach((btn) => {
      btn.addEventListener('click', () => {
        Llamada.iniciar({ id: Number(btn.dataset.citaLlamar), rol: 'medico', nombre: btn.dataset.nombre });
      });
    });

    contenedor.querySelectorAll('[data-cancelar]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm('¿Seguro que quieres cancelar esta cita?')) return;
        try {
          await API.pedir(`/citas/${btn.dataset.cancelar}/estado`, {
            metodo: 'PUT',
            cuerpo: { estado: 'Cancelada' }
          });
          cargarCitas();
          cargarRielPaciente();
        } catch (error) {
          alert(error.message);
        }
      });
    });
  } catch (error) {
    contenedor.innerHTML = `<div class="vacio">${escaparHtml(error.message)}</div>`;
  }
}

/* ============================================================
   MENSAJES — bandeja fresca con presencia en_linea y no leídos
   ============================================================ */

let chatMedicoActual = null;
let chatMedicoActualNombre = null;
let temporizadorChat = null;

async function cargarListaMedicosChat() {
  const contenedor = document.getElementById('lista-medicos-chat');
  document.getElementById('mensajes-lista-vista').classList.remove('oculto');
  document.getElementById('mensajes-chat-vista').classList.add('oculto');
  detenerPollingChat();

  try {
    const conversaciones = await API.pedir('/mensajes/conversaciones');
    if (conversaciones.length === 0) {
      contenedor.innerHTML = '<div class="vacio">Aún no hay médicos disponibles.</div>';
      return;
    }
    contenedor.innerHTML = conversaciones.map((m) => {
      const noLeidos = Number(m.no_leidos || 0);
      const preview = m.ultimo_mensaje
        ? `${m.ultimo_remitente === 'paciente' ? 'Tú: ' : ''}${m.ultimo_mensaje}`
        : m.especialidad;
      return `
        <div class="fila-persona ${noLeidos > 0 ? 'tiene-no-leidos' : ''}">
          <span class="avatar-inicial">${iniciales(m.nombre)}</span>
          <div class="info">
            <span class="nombre">${escaparHtml(m.nombre)} ${m.en_linea ? '🟢' : ''}</span>
            <span class="preview-msg">${escaparHtml(preview)}</span>
          </div>
          ${noLeidos > 0 ? `<span class="badge-chat">${noLeidos}</span>` : ''}
          <button class="boton boton-chico boton-secundario" data-chat="${m.id}" data-nombre="${escaparHtml(m.nombre)}">Abrir</button>
        </div>`;
    }).join('');

    contenedor.querySelectorAll('[data-chat]').forEach((btn) => {
      btn.addEventListener('click', () => abrirChatMedico(Number(btn.dataset.chat), btn.dataset.nombre));
    });
  } catch (error) {
    contenedor.innerHTML = `<div class="vacio">${escaparHtml(error.message)}</div>`;
  }
}

async function abrirChatMedico(idMedico, nombre) {
  chatMedicoActual = idMedico;
  chatMedicoActualNombre = nombre;
  document.getElementById('chat-titulo').textContent = nombre;
  document.getElementById('chat-avatar').textContent = iniciales(nombre);
  document.getElementById('mensajes-lista-vista').classList.add('oculto');
  document.getElementById('mensajes-chat-vista').classList.remove('oculto');
  await refrescarConversacion(true);
  if (temporizadorChat) clearInterval(temporizadorChat);
  temporizadorChat = setInterval(() => refrescarConversacion(false), 8000);
}

function detenerPollingChat() {
  if (temporizadorChat) { clearInterval(temporizadorChat); temporizadorChat = null; }
  chatMedicoActual = null;
}

document.getElementById('btn-volver-mensajes').addEventListener('click', cargarListaMedicosChat);

async function refrescarConversacion(marcarLeidos) {
  if (!chatMedicoActual) return;
  const contenedor = document.getElementById('chat-mensajes');
  try {
    const mensajes = await API.pedir(`/mensajes/${miId}/${chatMedicoActual}`);
    contenedor.innerHTML = mensajes.length === 0
      ? '<div class="vacio">Escribe el primer mensaje 👋</div>'
      : mensajes.map((m) => `
          <div class="burbuja ${m.remitente === 'paciente' ? 'burbuja-mia' : 'burbuja-otro'}">
            ${escaparHtml(m.contenido)}
            <span class="hora">${formatearFechaHora(m.fecha_hora)}</span>
          </div>`).join('');
    contenedor.scrollTop = contenedor.scrollHeight;

    if (marcarLeidos) {
      await API.pedir(`/mensajes/${miId}/${chatMedicoActual}/leidos`, { metodo: 'PUT' });
      actualizarBadgeMensajes();
    }
  } catch (error) {
    contenedor.innerHTML = `<div class="vacio">${escaparHtml(error.message)}</div>`;
  }
}

document.getElementById('form-mensaje').addEventListener('submit', async (evento) => {
  evento.preventDefault();
  const entrada = document.getElementById('entrada-mensaje');
  const contenido = entrada.value.trim();
  if (!contenido || !chatMedicoActual) return;
  entrada.value = '';

  try {
    await API.pedir('/mensajes', {
      metodo: 'POST',
      cuerpo: { id_medico: chatMedicoActual, contenido }
    });
    refrescarConversacion(false);
  } catch (error) {
    alert(error.message);
  }
});

document.getElementById('btn-llamar').addEventListener('click', () => {
  if (!chatMedicoActual) return;
  Llamada.iniciar({ id: chatMedicoActual, rol: 'medico', nombre: chatMedicoActualNombre });
});

async function actualizarBadgeMensajes() {
  try {
    const datos = await API.pedir('/mensajes/no-leidos');
    const nav = document.getElementById('nav-mensajes');
    const puntoExistente = nav.querySelector('.punto-alerta');
    if (datos.no_leidos > 0 && !puntoExistente) {
      const punto = document.createElement('span');
      punto.className = 'punto-alerta';
      nav.appendChild(punto);
    } else if (datos.no_leidos === 0 && puntoExistente) {
      puntoExistente.remove();
    }
  } catch (error) { /* silencioso */ }
}

/* ============================================================
   PERFIL — visualización, edición de datos, alergias y antecedentes
   ============================================================ */

let perfilCache = null;

async function cargarPerfil() {
  const contenedor = document.getElementById('perfil-datos');
  try {
    const perfil = await API.pedir(`/pacientes/${miId}`);
    perfilCache = perfil;
    const datos = [
      ['Nombre', perfil.nombre], ['Cédula', perfil.cedula],
      ['Edad', perfil.edad], ['Sexo', perfil.sexo],
      ['Sangre', perfil.tipo_sangre], ['Peso', `${perfil.peso} kg`],
      ['Altura', `${perfil.altura} cm`], ['Teléfono', perfil.telefono],
      ['Fumador', perfil.fumador], ['Alcohol', perfil.alcohol],
      ['Act. física', perfil.actividad_fisica]
    ];
    contenedor.innerHTML = datos.map(([etiqueta, valor]) => `
      <div class="dato-clave">
        <div class="etiqueta">${etiqueta}</div>
        <div class="valor">${escaparHtml(valor ?? '—')}</div>
      </div>`).join('');
  } catch (error) {
    contenedor.innerHTML = `<div class="vacio">${escaparHtml(error.message)}</div>`;
  }
  cargarAlergias();
  cargarAntecedentes();
}

document.getElementById('btn-editar-perfil').addEventListener('click', () => {
  if (!perfilCache) return;
  limpiarAviso(document.getElementById('aviso-perfil'));
  document.getElementById('edit-telefono').value = perfilCache.telefono || '';
  document.getElementById('edit-edad').value = perfilCache.edad || '';
  document.getElementById('edit-peso').value = perfilCache.peso || '';
  document.getElementById('edit-altura').value = perfilCache.altura || '';
  document.getElementById('edit-fumador').value = perfilCache.fumador || 'No';
  document.getElementById('edit-alcohol').value = perfilCache.alcohol || 'No';
  document.getElementById('edit-actividad').value = perfilCache.actividad_fisica || 'Sedentario';
  document.getElementById('perfil-datos').classList.add('oculto');
  document.getElementById('form-editar-perfil').classList.remove('oculto');
});

document.getElementById('btn-cancelar-editar-perfil').addEventListener('click', () => {
  document.getElementById('form-editar-perfil').classList.add('oculto');
  document.getElementById('perfil-datos').classList.remove('oculto');
});

document.getElementById('form-editar-perfil').addEventListener('submit', async (evento) => {
  evento.preventDefault();
  const zonaAviso = document.getElementById('aviso-perfil');
  limpiarAviso(zonaAviso);

  try {
    const actualizado = await API.pedir(`/pacientes/${miId}`, {
      metodo: 'PUT',
      cuerpo: {
        telefono: document.getElementById('edit-telefono').value.trim(),
        edad: Number(document.getElementById('edit-edad').value),
        peso: Number(document.getElementById('edit-peso').value),
        altura: Number(document.getElementById('edit-altura').value),
        fumador: document.getElementById('edit-fumador').value,
        alcohol: document.getElementById('edit-alcohol').value,
        actividad_fisica: document.getElementById('edit-actividad').value
      }
    });
    API.guardarSesion(API.token(), 'paciente', actualizado);
    document.getElementById('form-editar-perfil').classList.add('oculto');
    document.getElementById('perfil-datos').classList.remove('oculto');
    mostrarAviso(zonaAviso, 'exito', 'Datos actualizados correctamente.');
    cargarPerfil();
  } catch (error) {
    mostrarAviso(zonaAviso, 'error', error.message);
  }
});

async function cargarAlergias() {
  const contenedor = document.getElementById('lista-alergias');
  try {
    const alergias = await API.pedir(`/pacientes/${miId}/alergias`);
    contenedor.innerHTML = alergias.length === 0
      ? '<div class="vacio">Sin alergias registradas.</div>'
      : alergias.map((a) => `
          <span class="chip chip-rojo chip-con-x">
            ${escaparHtml(a.sustancia)}
            <button type="button" data-del-alergia="${a.id}" title="Eliminar">×</button>
          </span>`).join(' ');

    contenedor.querySelectorAll('[data-del-alergia]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          await API.pedir(`/pacientes/${miId}/alergias/${btn.dataset.delAlergia}`, { metodo: 'DELETE' });
          cargarAlergias();
        } catch (error) {
          alert(error.message);
        }
      });
    });
  } catch (error) {
    contenedor.innerHTML = `<div class="vacio">${escaparHtml(error.message)}</div>`;
  }
}

document.getElementById('form-alergia').addEventListener('submit', async (evento) => {
  evento.preventDefault();
  const entrada = document.getElementById('nueva-alergia');
  const sustancia = entrada.value.trim();
  if (!sustancia) return;
  try {
    await API.pedir(`/pacientes/${miId}/alergias`, { metodo: 'POST', cuerpo: { sustancia } });
    entrada.value = '';
    cargarAlergias();
  } catch (error) {
    alert(error.message);
  }
});

async function cargarAntecedentes() {
  const contenedor = document.getElementById('lista-antecedentes');
  try {
    const antecedentes = await API.pedir(`/pacientes/${miId}/antecedentes-familiares`);
    contenedor.innerHTML = antecedentes.length === 0
      ? '<div class="vacio">Sin antecedentes registrados.</div>'
      : antecedentes.map((a) => `
          <span class="chip chip-ambar chip-con-x">
            ${escaparHtml(a.condicion)}
            <button type="button" data-del-ant="${a.id}" title="Eliminar">×</button>
          </span>`).join(' ');

    contenedor.querySelectorAll('[data-del-ant]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          await API.pedir(`/pacientes/${miId}/antecedentes-familiares/${btn.dataset.delAnt}`, { metodo: 'DELETE' });
          cargarAntecedentes();
        } catch (error) {
          alert(error.message);
        }
      });
    });
  } catch (error) {
    contenedor.innerHTML = `<div class="vacio">${escaparHtml(error.message)}</div>`;
  }
}

document.getElementById('form-antecedente').addEventListener('submit', async (evento) => {
  evento.preventDefault();
  const entrada = document.getElementById('nuevo-antecedente');
  const condicion = entrada.value.trim();
  if (!condicion) return;
  try {
    await API.pedir(`/pacientes/${miId}/antecedentes-familiares`, { metodo: 'POST', cuerpo: { condicion } });
    entrada.value = '';
    cargarAntecedentes();
  } catch (error) {
    alert(error.message);
  }
});

/* ============================================================
   Arranque
   ============================================================ */

cargarInicio();
retomarFlash();
actualizarBadgeMensajes();
setInterval(actualizarBadgeMensajes, 20000);
