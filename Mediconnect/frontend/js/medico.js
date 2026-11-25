/* ============================================================
   MediConnect — lógica del panel del médico
   Requiere js/api.js y socket.io cargados antes.
   ============================================================ */

exigirSesion('medico');

const usuario = API.usuario();
const miId = usuario.id;

document.getElementById('nombre-medico').textContent = usuario.nombre;
document.getElementById('btn-salir').addEventListener('click', () => API.cerrarSesion());

function iniciales(nombre) {
  if (!nombre) return '--';
  const partes = nombre.trim().split(/\s+/);
  const primeras = partes.length === 1 ? partes[0].slice(0, 2) : partes[0][0] + partes[1][0];
  return primeras.toUpperCase();
}

function saludoSegunHora() {
  const hora = new Date().getHours();
  if (hora < 12) return 'Buenos días';
  if (hora < 19) return 'Buenas tardes';
  return 'Buenas noches';
}

document.getElementById('riel-iniciales').textContent = iniciales(usuario.nombre);
document.getElementById('riel-saludo').textContent = `${saludoSegunHora()}, ${usuario.nombre}`;
document.getElementById('riel-fecha').textContent = new Date().toLocaleDateString('es-VE', {
  weekday: 'long', day: 'numeric', month: 'long'
});

/* ============================================================
   Socket.io — presencia (en_linea), alertas y mensajes en vivo
   ============================================================ */

const estadoConexion = document.getElementById('estado-conexion');
const socket = io(API.socketUrl(), { auth: { token: API.token() } });

socket.on('connect', () => {
  estadoConexion.classList.add('en-linea');
  estadoConexion.innerHTML = '<span class="punto"></span>En línea — disponible';
});

socket.on('disconnect', () => {
  estadoConexion.classList.remove('en-linea');
  estadoConexion.innerHTML = '<span class="punto"></span>Fuera de línea';
});

socket.on('connect_error', () => {
  estadoConexion.classList.remove('en-linea');
  estadoConexion.innerHTML = '<span class="punto"></span>Sin conexión en vivo';
});

socket.on('nueva_alerta', () => {
  cargarAlertas();
  cargarResumenLateral();
});

socket.on('nuevo_mensaje', (msg) => {
  actualizarBadgeMensajes();
  cargarResumenLateral();
  if (chatPacienteActual && Number(msg.id_paciente) === Number(chatPacienteActual)) {
    refrescarConversacion(true);
  } else if (!document.getElementById('seccion-mensajes').classList.contains('oculto')) {
    cargarListaPacientesChat();
  }
});

/* ============================================================
   Navegación
   ============================================================ */

const TITULOS = { alertas: 'Alertas', citas: 'Citas', pacientes: 'Pacientes', mensajes: 'Mensajes' };

function mostrarSeccion(nombre) {
  ['alertas', 'citas', 'pacientes', 'expediente', 'mensajes'].forEach((s) => {
    document.getElementById(`seccion-${s}`).classList.toggle('oculto', s !== nombre);
  });
  document.querySelectorAll('.lateral-medico button.nav-item[data-seccion]').forEach((btn) => {
    btn.classList.toggle('activo', btn.dataset.seccion === nombre);
  });
  if (TITULOS[nombre]) document.getElementById('titulo-seccion').textContent = TITULOS[nombre];

  if (nombre !== 'mensajes') detenerPollingChat();

  document.getElementById('riel-lateral').classList.remove('oculto');
  cargarResumenLateral();

  if (nombre === 'alertas') cargarAlertas();
  if (nombre === 'citas') { cargarSelectPacientes(); cargarCitas(); }
  if (nombre === 'pacientes') cargarPacientes();
  if (nombre === 'mensajes') cargarListaPacientesChat();
}

document.querySelectorAll('.lateral-medico button.nav-item[data-seccion]').forEach((btn) => {
  btn.addEventListener('click', () => mostrarSeccion(btn.dataset.seccion));
});

/* ============================================================
   ALERTAS
   ============================================================ */

let viendoResueltas = false;

document.getElementById('btn-ver-resueltas').addEventListener('click', () => {
  viendoResueltas = !viendoResueltas;
  document.getElementById('btn-ver-resueltas').textContent =
    viendoResueltas ? 'Ver sin resolver' : 'Ver resueltas';
  document.getElementById('titulo-lista-alertas').textContent =
    viendoResueltas ? 'Alertas resueltas' : 'Alertas sin resolver';
  cargarAlertas();
});

const TEXTO_TIPO_ALERTA = {
  valor_critico: 'Valor crítico',
  sintoma_urgente: 'Síntoma urgente',
  resultado_disponible: 'Resultado disponible',
  receta_por_vencer: 'Receta por vencer'
};

function colorPrioridad(prioridad) {
  if (prioridad === 'alta') return { fuerte: 'var(--rojo)', suave: 'var(--rojo-claro)' };
  if (prioridad === 'media') return { fuerte: 'var(--ambar)', suave: 'var(--ambar-claro)' };
  return { fuerte: 'var(--gris-600)', suave: 'var(--gris-100)' };
}

async function cargarAlertas() {
  const contenedor = document.getElementById('lista-alertas');
  try {
    const alertas = await API.pedir(`/alertas?resuelta=${viendoResueltas ? 1 : 0}`);

    const sinResolver = viendoResueltas
      ? (await API.pedir('/alertas?resuelta=0')).length
      : alertas.length;
    const badge = document.getElementById('badge-alertas');
    badge.textContent = sinResolver;
    badge.classList.toggle('oculto', sinResolver === 0);

    if (alertas.length === 0) {
      contenedor.innerHTML = `<div class="tarjeta-vacia">${viendoResueltas ? 'No hay alertas resueltas.' : 'No hay alertas sin resolver.'}</div>`;
      return;
    }

    contenedor.innerHTML = alertas.map((a) => {
      const color = colorPrioridad(a.prioridad);
      const nom = a.nombre_paciente || 'Paciente';
      return `
        <article class="tarjeta-alerta">
          <div class="barra-prioridad" style="background:${color.fuerte}"></div>
          <div class="cuerpo">
            <div class="cabecera">
              <span class="paciente-nombre">${escaparHtml(nom)}</span>
              <span class="paciente-meta">${a.edad_paciente ?? '—'} años</span>
              <span class="badge-prioridad" style="background:${color.suave};color:${color.fuerte}">${escaparHtml(a.prioridad || '—')}</span>
            </div>
            <span class="tipo-alerta" style="color:${color.fuerte}">${TEXTO_TIPO_ALERTA[a.tipo] || escaparHtml(a.tipo)}</span>
            <p class="descripcion-alerta">${escaparHtml(a.descripcion || '')}</p>
            <div class="pie">
              <span class="fecha-alerta"><svg width="13" height="13" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="8.5" stroke="currentColor" stroke-width="1.8"></circle><path d="M12 7.5V12l3 2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></path></svg>${formatearFechaHora(a.fecha_hora)}</span>
              <div class="acciones-alerta">
                <button class="boton boton-chico boton-secundario" data-alerta-exp="${a.id_paciente}" data-nombre="${escaparHtml(nom)}">Expediente</button>
                <button class="boton boton-chico boton-secundario" data-alerta-chat="${a.id_paciente}" data-nombre="${escaparHtml(nom)}">💬</button>
                <button class="boton boton-chico boton-secundario" data-alerta-llamar="${a.id_paciente}" data-nombre="${escaparHtml(nom)}">📹</button>
                ${a.resuelta
                  ? '<span class="resuelta-texto">✓ Resuelta</span>'
                  : `<button class="boton boton-chico" data-resolver="${a.id}">Resolver</button>`}
              </div>
            </div>
          </div>
        </article>`;
    }).join('');

    contenedor.querySelectorAll('[data-alerta-exp]').forEach((btn) => {
      btn.addEventListener('click', () => abrirExpediente(Number(btn.dataset.alertaExp), btn.dataset.nombre));
    });
    contenedor.querySelectorAll('[data-alerta-chat]').forEach((btn) => {
      btn.addEventListener('click', () => irAChatPaciente(Number(btn.dataset.alertaChat), btn.dataset.nombre));
    });
    contenedor.querySelectorAll('[data-alerta-llamar]').forEach((btn) => {
      btn.addEventListener('click', () => {
        Llamada.iniciar({ id: Number(btn.dataset.alertaLlamar), rol: 'paciente', nombre: btn.dataset.nombre });
      });
    });
    contenedor.querySelectorAll('[data-resolver]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        try {
          await API.pedir(`/alertas/${btn.dataset.resolver}/resolver`, { metodo: 'PUT' });
          cargarAlertas();
          cargarResumenLateral();
        } catch (error) {
          alert(error.message);
          btn.disabled = false;
        }
      });
    });
  } catch (error) {
    contenedor.innerHTML = `<div class="tarjeta-vacia">${escaparHtml(error.message)}</div>`;
  }
}

/* ============================================================
   Riel lateral (resumen + próximas citas)
   ============================================================ */

async function cargarResumenLateral() {
  const hoy = fechaLocalISO();

  try {
    const citas = await API.pedir('/citas');
    const citasHoy = citas.filter((c) => String(c.fecha).slice(0, 10) === hoy && c.estado !== 'Cancelada');
    document.getElementById('resumen-citas-hoy').textContent = citasHoy.length;

    const proximas = citas
      .filter((c) => String(c.fecha).slice(0, 10) >= hoy && c.estado !== 'Cancelada' && c.estado !== 'Completada')
      .sort((a, b) => (String(a.fecha).slice(0, 10) + a.hora).localeCompare(String(b.fecha).slice(0, 10) + b.hora))
      .slice(0, 4);

    const contProximas = document.getElementById('riel-proximas-citas');
    contProximas.innerHTML = proximas.length === 0
      ? '<div class="vacio">Sin citas próximas.</div>'
      : proximas.map((c) => `
          <div class="item-cita-mini">
            <span class="hora-cita">${formatearHora(c.hora)}</span>
            <div class="crece">
              <div class="titulo">${escaparHtml(c.nombre_paciente || 'Paciente')}</div>
              <div class="detalle">${formatearFecha(c.fecha)} · ${escaparHtml(c.tipo_consulta || '')}</div>
            </div>
            ${chipEstadoCita(c.estado)}
          </div>`).join('');
  } catch (error) {
    document.getElementById('resumen-citas-hoy').textContent = '—';
  }

  try {
    const datos = await API.pedir('/mensajes/no-leidos');
    document.getElementById('resumen-mensajes-sin-leer').textContent = datos.no_leidos;
  } catch (error) {
    document.getElementById('resumen-mensajes-sin-leer').textContent = '—';
  }

  try {
    const resueltas = await API.pedir('/alertas?resuelta=1');
    document.getElementById('resumen-alertas-resueltas').textContent = resueltas.length;
  } catch (error) {
    document.getElementById('resumen-alertas-resueltas').textContent = '—';
  }
}

/* ============================================================
   CITAS
   ============================================================ */

async function cargarSelectPacientes() {
  const select = document.getElementById('cita-paciente');
  try {
    const pacientes = await API.pedir('/pacientes');
    select.innerHTML = '<option value="">Selecciona…</option>' +
      pacientes.map((p) => `<option value="${p.id}">${escaparHtml(p.nombre)} (${p.edad ?? '—'} años)</option>`).join('');
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
        id_paciente: document.getElementById('cita-paciente').value,
        fecha: document.getElementById('cita-fecha').value,
        hora: document.getElementById('cita-hora').value,
        tipo_consulta: document.getElementById('cita-tipo').value.trim()
      }
    });
    mostrarAviso(zonaAviso, 'exito', 'Cita agendada y confirmada.');
    document.getElementById('form-cita').reset();
    cargarCitas();
    cargarResumenLateral();
  } catch (error) {
    mostrarAviso(zonaAviso, 'error', error.message);
  }
});

function chipEstadoCita(estado) {
  const clases = {
    Pendiente: 'chip-ambar', Programada: 'chip-morado', Confirmada: 'chip-verde',
    Completada: 'chip', Cancelada: 'chip-rojo'
  };
  return `<span class="chip ${clases[estado] || ''}">${escaparHtml(estado)}</span>`;
}

async function cargarCitas() {
  const contenedor = document.getElementById('lista-citas');
  try {
    const citas = await API.pedir('/citas');
    if (citas.length === 0) {
      contenedor.innerHTML = '<div class="vacio">No tienes citas en agenda.</div>';
      return;
    }
    contenedor.innerHTML = citas.map((c) => {
      const puedeLlamar = c.estado === 'Confirmada' || c.estado === 'Programada';
      const nom = c.nombre_paciente || 'Paciente';
      return `
        <div class="fila-cita">
          <div class="hora-fecha">
            <span class="hora">${formatearHora(c.hora)}</span>
            <span class="fecha">${formatearFecha(c.fecha)}</span>
          </div>
          <div class="info">
            <span class="nombre">${escaparHtml(nom)}</span>
            <span class="detalle">${escaparHtml(c.tipo_consulta || '')}</span>
          </div>
          <div class="acciones">
            ${chipEstadoCita(c.estado)}
            ${puedeLlamar ? `<button class="boton boton-chico" data-cita-llamar="${c.id_paciente}" data-nombre="${escaparHtml(nom)}">📹 Video</button>` : ''}
            <select data-estado-cita="${c.id}" style="padding:6px;border-radius:8px;border:1.5px solid var(--gris-300);font-size:.78rem;font-family:var(--fuente)">
              <option value="">Estado…</option>
              <option>Confirmada</option>
              <option>Completada</option>
              <option>Cancelada</option>
            </select>
          </div>
        </div>`;
    }).join('');

    contenedor.querySelectorAll('[data-cita-llamar]').forEach((btn) => {
      btn.addEventListener('click', () => {
        Llamada.iniciar({ id: Number(btn.dataset.citaLlamar), rol: 'paciente', nombre: btn.dataset.nombre });
      });
    });

    contenedor.querySelectorAll('[data-estado-cita]').forEach((select) => {
      select.addEventListener('change', async () => {
        if (!select.value) return;
        try {
          await API.pedir(`/citas/${select.dataset.estadoCita}/estado`, {
            metodo: 'PUT',
            cuerpo: { estado: select.value }
          });
          cargarCitas();
          cargarResumenLateral();
        } catch (error) {
          alert(error.message);
          select.value = '';
        }
      });
    });
  } catch (error) {
    contenedor.innerHTML = `<div class="vacio">${escaparHtml(error.message)}</div>`;
  }
}

/* ============================================================
   PACIENTES — lista con buscador, prioridad y expediente
   ============================================================ */

let pacienteActual = null;
let pacientesCache = [];

function renderizarListaPacientes(lista) {
  const contenedor = document.getElementById('lista-pacientes');
  if (lista.length === 0) {
    contenedor.innerHTML = '<div class="vacio">No se encontraron pacientes.</div>';
    return;
  }
  contenedor.innerHTML = lista.map((p) => {
    const pendientes = Number(p.alertas_pendientes || 0);
    const chipAlerta = pendientes > 0
      ? `<span class="chip ${Number(p.prioridad_maxima) === 1 ? 'chip-rojo' : 'chip-ambar'}">${pendientes} alerta${pendientes > 1 ? 's' : ''}</span>`
      : '';
    return `
      <div class="fila-persona">
        <span class="avatar-inicial">${iniciales(p.nombre)}</span>
        <div class="info">
          <span class="nombre">${escaparHtml(p.nombre)} ${chipAlerta}</span>
          <span class="detalle">${p.edad ?? '—'} años · ${escaparHtml(p.sexo || '—')}${p.cedula ? ' · C.I. ' + escaparHtml(p.cedula) : ''}</span>
        </div>
        <button class="boton boton-chico boton-secundario" data-expediente="${p.id}" data-nombre="${escaparHtml(p.nombre)}">Ver expediente</button>
      </div>`;
  }).join('');

  contenedor.querySelectorAll('[data-expediente]').forEach((btn) => {
    btn.addEventListener('click', () => abrirExpediente(Number(btn.dataset.expediente), btn.dataset.nombre));
  });
}

async function cargarPacientes() {
  const contenedor = document.getElementById('lista-pacientes');
  try {
    pacientesCache = await API.pedir('/pacientes');
    const filtro = document.getElementById('buscar-paciente').value.trim().toLowerCase();
    filtrarPacientes(filtro);
  } catch (error) {
    contenedor.innerHTML = `<div class="vacio">${escaparHtml(error.message)}</div>`;
  }
}

function filtrarPacientes(texto) {
  if (!texto) {
    renderizarListaPacientes(pacientesCache);
    return;
  }
  const filtrados = pacientesCache.filter((p) =>
    String(p.nombre || '').toLowerCase().includes(texto) ||
    String(p.cedula || '').toLowerCase().includes(texto)
  );
  renderizarListaPacientes(filtrados);
}

document.getElementById('buscar-paciente').addEventListener('input', (e) => {
  filtrarPacientes(e.target.value.trim().toLowerCase());
});

document.getElementById('btn-volver-pacientes').addEventListener('click', () => mostrarSeccion('pacientes'));
document.getElementById('btn-exp-llamar').addEventListener('click', () => {
  if (!pacienteActual) return;
  Llamada.iniciar({ id: pacienteActual.id, rol: 'paciente', nombre: pacienteActual.nombre });
});
document.getElementById('btn-exp-escribir').addEventListener('click', () => {
  if (!pacienteActual) return;
  irAChatPaciente(pacienteActual.id, pacienteActual.nombre);
});

document.querySelectorAll('#pestanas-expediente button').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#pestanas-expediente button').forEach((b) => b.classList.remove('activo'));
    btn.classList.add('activo');
    ['resumen', 'signos', 'laboratorio', 'medicamentos', 'historial', 'indicaciones'].forEach((sub) => {
      document.getElementById(`exp-${sub}`).classList.toggle('oculto', sub !== btn.dataset.exp);
    });
  });
});

function abrirExpediente(idPaciente, nombre) {
  pacienteActual = { id: idPaciente, nombre };
  document.getElementById('expediente-nombre').textContent = nombre;
  document.getElementById('titulo-seccion').textContent = 'Expediente';

  ['alertas', 'citas', 'pacientes', 'mensajes'].forEach((s) => {
    document.getElementById(`seccion-${s}`).classList.add('oculto');
  });
  document.getElementById('seccion-expediente').classList.remove('oculto');
  document.getElementById('riel-lateral').classList.add('oculto');

  document.querySelectorAll('#pestanas-expediente button').forEach((b, i) => {
    b.classList.toggle('activo', i === 0);
  });
  ['resumen', 'signos', 'laboratorio', 'medicamentos', 'historial', 'indicaciones'].forEach((sub, i) => {
    document.getElementById(`exp-${sub}`).classList.toggle('oculto', i !== 0);
  });

  // Prellenar fechas de hoy por comodidad
  const hoy = fechaLocalISO();
  const inputMedInicio = document.getElementById('exp-med-inicio');
  const inputHistFecha = document.getElementById('exp-hist-fecha');
  if (inputMedInicio && !inputMedInicio.value) inputMedInicio.value = hoy;
  if (inputHistFecha && !inputHistFecha.value) inputHistFecha.value = hoy;

  cargarExpedienteResumen();
  cargarExpedienteSignos();
  cargarExpedienteLab();
  cargarExpedienteMedicamentos();
  cargarExpedienteHistorial();
  cargarExpedienteIndicaciones();
}

async function cargarExpedienteResumen() {
  const contDatos = document.getElementById('exp-datos');
  try {
    const p = await API.pedir(`/pacientes/${pacienteActual.id}`);
    const datos = [
      ['Cédula', p.cedula], ['Edad', p.edad], ['Sexo', p.sexo],
      ['Sangre', p.tipo_sangre], ['Peso', `${p.peso} kg`], ['Altura', `${p.altura} cm`],
      ['Teléfono', p.telefono], ['Fumador', p.fumador],
      ['Alcohol', p.alcohol], ['Act. física', p.actividad_fisica]
    ];
    contDatos.innerHTML = datos.map(([etiqueta, valor]) => `
      <div class="dato-clave">
        <div class="etiqueta">${etiqueta}</div>
        <div class="valor">${escaparHtml(valor ?? '—')}</div>
      </div>`).join('');
  } catch (error) {
    contDatos.innerHTML = `<div class="vacio">${escaparHtml(error.message)}</div>`;
  }

  try {
    const alergias = await API.pedir(`/pacientes/${pacienteActual.id}/alergias`);
    document.getElementById('exp-alergias').innerHTML = alergias.length === 0
      ? '<span class="texto-suave">Sin alergias registradas.</span>'
      : alergias.map((a) => `<span class="chip chip-rojo" style="margin:2px">${escaparHtml(a.sustancia)}</span>`).join(' ');
  } catch (e) { /* silencioso */ }

  try {
    const antecedentes = await API.pedir(`/pacientes/${pacienteActual.id}/antecedentes-familiares`);
    document.getElementById('exp-antecedentes').innerHTML = antecedentes.length === 0
      ? '<span class="texto-suave">Sin antecedentes registrados.</span>'
      : antecedentes.map((a) => `<span class="chip chip-ambar" style="margin:2px">${escaparHtml(a.condicion)}</span>`).join(' ');
  } catch (e) { /* silencioso */ }
}

/* ---------- Signos vitales ---------- */

document.getElementById('form-exp-signos').addEventListener('submit', async (evento) => {
  evento.preventDefault();
  const zonaAviso = document.getElementById('aviso-exp-signos');
  limpiarAviso(zonaAviso);
  const cuerpo = {
    presion_arterial: document.getElementById('exp-sv-presion').value.trim(),
    frecuencia_cardiaca: document.getElementById('exp-sv-fc').value,
    spo2: document.getElementById('exp-sv-spo2').value,
    temperatura: document.getElementById('exp-sv-temp').value
  };
  const glicemiaVal = document.getElementById('exp-sv-glicemia').value.trim();
  if (glicemiaVal) cuerpo.glicemia = glicemiaVal;

  try {
    await API.pedir(`/pacientes/${pacienteActual.id}/signos-vitales`, {
      metodo: 'POST',
      cuerpo
    });
    mostrarAviso(zonaAviso, 'exito', 'Medición registrada.');
    document.getElementById('form-exp-signos').reset();
    cargarExpedienteSignos();
  } catch (error) {
    mostrarAviso(zonaAviso, 'error', error.message);
  }
});

async function cargarExpedienteSignos() {
  const contenedor = document.getElementById('exp-lista-signos');
  try {
    const signos = await API.pedir(`/pacientes/${pacienteActual.id}/signos-vitales`);
    if (signos.length === 0) {
      contenedor.innerHTML = '<div class="vacio">Sin mediciones registradas.</div>';
      return;
    }
    contenedor.innerHTML = `<table class="tabla">
      <tr><th>Fecha</th><th>PA</th><th>FC</th><th>SpO2</th><th>Temp</th><th>Glicemia</th><th>Origen</th><th>Evidencia</th></tr>
      ${signos.map((s) => {
        const criticos = evaluarSignoCritico(s);
        const resumen = `PA ${s.presion_arterial} · FC ${s.frecuencia_cardiaca} · SpO2 ${s.spo2}% · ${s.temperatura}°C${s.glicemia ? ' · Glicemia ' + s.glicemia + ' mg/dL' : ''}`;
        return `
          <tr${criticos.length > 0 ? ' style="background:#fff5f5"' : ''}>
            <td>${formatearFechaHora(s.fecha_hora)}</td>
            <td>${escaparHtml(s.presion_arterial)}${criticos.length > 0 ? ' <span class="chip chip-rojo">!</span>' : ''}</td>
            <td>${s.frecuencia_cardiaca}</td>
            <td>${s.spo2}%</td>
            <td>${s.temperatura}°C</td>
            <td>${s.glicemia != null ? `${s.glicemia} mg/dL` : '—'}</td>
            <td>${s.origen === 'consulta' ? 'Consulta' : 'Paciente'}</td>
            <td>${s.foto_evidencia
              ? `<button type="button" class="boton boton-chico boton-secundario" data-visor-url="${escaparHtml(API.urlArchivo(s.foto_evidencia))}" data-visor-titulo="Evidencia de signos vitales" data-visor-detalle="${escaparHtml(resumen + ' (' + formatearFechaHora(s.fecha_hora) + ')')}">Ver foto</button>`
              : '—'}</td>
          </tr>`;
      }).join('')}
    </table>`;

    contenedor.querySelectorAll('[data-visor-url]').forEach((btn) => {
      btn.addEventListener('click', () => {
        abrirVisorFoto(btn.dataset.visorUrl, btn.dataset.visorTitulo, btn.dataset.visorDetalle);
      });
    });
  } catch (error) {
    contenedor.innerHTML = `<div class="vacio">${escaparHtml(error.message)}</div>`;
  }
}

/* ---------- Laboratorio ---------- */

document.getElementById('form-exp-lab').addEventListener('submit', async (evento) => {
  evento.preventDefault();
  const zonaAviso = document.getElementById('aviso-exp-lab');
  limpiarAviso(zonaAviso);
  try {
    await API.pedir(`/pacientes/${pacienteActual.id}/laboratorio`, {
      metodo: 'POST',
      cuerpo: { tipo_examen: document.getElementById('exp-lab-tipo').value.trim() }
    });
    document.getElementById('exp-lab-tipo').value = '';
    cargarExpedienteLab();
  } catch (error) {
    mostrarAviso(zonaAviso, 'error', error.message);
  }
});

function chipEstadoClinico(estado) {
  const clases = { Normal: 'chip-verde', Alta: 'chip-ambar', Baja: 'chip-ambar', Critico: 'chip-rojo' };
  return estado ? `<span class="chip ${clases[estado] || ''}">${escaparHtml(estado)}</span>` : '—';
}

async function cargarExpedienteLab() {
  const contenedor = document.getElementById('exp-lista-lab');
  try {
    const ordenes = await API.pedir(`/pacientes/${pacienteActual.id}/laboratorio`);
    if (ordenes.length === 0) {
      contenedor.innerHTML = '<div class="vacio">Sin órdenes de laboratorio.</div>';
      return;
    }
    contenedor.innerHTML = `<table class="tabla">
      <tr><th>Examen</th><th>Ordenado</th><th>Resultado</th><th>Estado</th><th>Evidencia</th></tr>
      ${ordenes.map((o) => `
        <tr>
          <td>${escaparHtml(o.tipo_examen)}</td>
          <td>${formatearFecha(o.fecha_orden)}</td>
          <td>${o.estado_orden === 'completado'
            ? `${o.valor ?? '—'} ${escaparHtml(o.unidad || '')} (${formatearFecha(o.fecha_resultado)})`
            : '<span class="chip chip-ambar">Pendiente</span>'}</td>
          <td>${chipEstadoClinico(o.estado_clinico)}</td>
          <td>${o.foto_evidencia
            ? `<button type="button" class="boton boton-chico boton-secundario" data-visor-url="${escaparHtml(API.urlArchivo(o.foto_evidencia))}" data-visor-titulo="${escaparHtml(o.tipo_examen)}" data-visor-detalle="${escaparHtml((o.valor ?? '—') + ' ' + (o.unidad || '') + ' · ' + (o.estado_clinico || ''))}">Ver foto</button>`
            : '—'}</td>
        </tr>`).join('')}
    </table>`;

    contenedor.querySelectorAll('[data-visor-url]').forEach((btn) => {
      btn.addEventListener('click', () => {
        abrirVisorFoto(btn.dataset.visorUrl, btn.dataset.visorTitulo, btn.dataset.visorDetalle);
      });
    });
  } catch (error) {
    contenedor.innerHTML = `<div class="vacio">${escaparHtml(error.message)}</div>`;
  }
}

/* ---------- Medicamentos ---------- */

document.getElementById('form-exp-med').addEventListener('submit', async (evento) => {
  evento.preventDefault();
  const zonaAviso = document.getElementById('aviso-exp-med');
  limpiarAviso(zonaAviso);
  try {
    await API.pedir('/medicamentos', {
      metodo: 'POST',
      cuerpo: {
        id_paciente: pacienteActual.id,
        nombre: document.getElementById('exp-med-nombre').value.trim(),
        dosis: document.getElementById('exp-med-dosis').value.trim(),
        frecuencia: document.getElementById('exp-med-frecuencia').value.trim(),
        instrucciones: document.getElementById('exp-med-instrucciones').value.trim() || null,
        fecha_inicio: document.getElementById('exp-med-inicio').value,
        fecha_fin: document.getElementById('exp-med-fin').value || null
      }
    });
    mostrarAviso(zonaAviso, 'exito', 'Medicamento recetado.');
    document.getElementById('form-exp-med').reset();
    document.getElementById('exp-med-inicio').value = fechaLocalISO();
    cargarExpedienteMedicamentos();
  } catch (error) {
    mostrarAviso(zonaAviso, 'error', error.message);
  }
});

async function cargarExpedienteMedicamentos() {
  const contenedor = document.getElementById('exp-lista-med');
  try {
    const medicamentos = await API.pedir(`/medicamentos/paciente/${pacienteActual.id}`);
    if (medicamentos.length === 0) {
      contenedor.innerHTML = '<div class="vacio">Sin medicamentos recetados.</div>';
      return;
    }
    contenedor.innerHTML = medicamentos.map((m) => `
      <div class="item-lista">
        <div class="crece">
          <div class="titulo">${escaparHtml(m.nombre)} — ${escaparHtml(m.dosis || '')}</div>
          <div class="detalle">${escaparHtml(m.frecuencia || '')}${m.instrucciones ? ' · ' + escaparHtml(m.instrucciones) : ''}</div>
          <div class="detalle">Del ${formatearFecha(m.fecha_inicio)} ${m.fecha_fin ? 'al ' + formatearFecha(m.fecha_fin) : '(sin fecha fin)'} · Dr(a). ${escaparHtml(m.nombre_medico || '')}</div>
          <div class="detalle" id="exp-tomas-${m.id}"></div>
        </div>
        <button class="boton boton-chico boton-secundario" data-ver-tomas="${m.id}">Ver tomas</button>
      </div>`).join('');

    contenedor.querySelectorAll('[data-ver-tomas]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const idMed = btn.dataset.verTomas;
        const destino = document.getElementById(`exp-tomas-${idMed}`);
        try {
          const tomas = await API.pedir(`/medicamentos/${idMed}/tomas`);
          destino.textContent = tomas.length === 0
            ? 'Sin tomas registradas todavía.'
            : `Últimas tomas: ${tomas.slice(0, 5).map((t) => `${formatearFecha(t.fecha)} ${formatearHora(t.hora)}`).join(' · ')}`;
        } catch (error) {
          destino.textContent = error.message;
        }
      });
    });
  } catch (error) {
    contenedor.innerHTML = `<div class="vacio">${escaparHtml(error.message)}</div>`;
  }
}

/* ---------- Historial de consultas ---------- */

document.getElementById('form-exp-hist').addEventListener('submit', async (evento) => {
  evento.preventDefault();
  const zonaAviso = document.getElementById('aviso-exp-hist');
  limpiarAviso(zonaAviso);
  try {
    await API.pedir(`/pacientes/${pacienteActual.id}/historial`, {
      metodo: 'POST',
      cuerpo: {
        fecha: document.getElementById('exp-hist-fecha').value,
        motivo: document.getElementById('exp-hist-motivo').value.trim(),
        notas: document.getElementById('exp-hist-notas').value.trim() || null
      }
    });
    mostrarAviso(zonaAviso, 'exito', 'Consulta registrada en el historial.');
    document.getElementById('form-exp-hist').reset();
    document.getElementById('exp-hist-fecha').value = fechaLocalISO();
    cargarExpedienteHistorial();
  } catch (error) {
    mostrarAviso(zonaAviso, 'error', error.message);
  }
});

async function cargarExpedienteHistorial() {
  const contenedor = document.getElementById('exp-lista-hist');
  try {
    const historial = await API.pedir(`/pacientes/${pacienteActual.id}/historial`);
    if (historial.length === 0) {
      contenedor.innerHTML = '<div class="vacio">Sin consultas previas.</div>';
      return;
    }
    contenedor.innerHTML = historial.map((h) => `
      <div class="item-lista">
        <div>
          <div class="titulo">${escaparHtml(h.motivo || 'Consulta')}</div>
          <div class="detalle">${formatearFecha(h.fecha)}${h.nombre_medico ? ' · Dr(a). ' + escaparHtml(h.nombre_medico) : ''}</div>
          ${h.notas ? `<div class="detalle">${escaparHtml(h.notas)}</div>` : ''}
        </div>
      </div>`).join('');
  } catch (error) {
    contenedor.innerHTML = `<div class="vacio">${escaparHtml(error.message)}</div>`;
  }
}

/* ---------- Indicaciones ---------- */

document.getElementById('form-exp-ind').addEventListener('submit', async (evento) => {
  evento.preventDefault();
  const zonaAviso = document.getElementById('aviso-exp-ind');
  limpiarAviso(zonaAviso);
  try {
    await API.pedir(`/pacientes/${pacienteActual.id}/indicaciones`, {
      metodo: 'POST',
      cuerpo: {
        descripcion: document.getElementById('exp-ind-descripcion').value.trim()
      }
    });
    document.getElementById('exp-ind-descripcion').value = '';
    cargarExpedienteIndicaciones();
  } catch (error) {
    mostrarAviso(zonaAviso, 'error', error.message);
  }
});

async function cargarExpedienteIndicaciones() {
  const contenedor = document.getElementById('exp-lista-ind');
  try {
    const indicaciones = await API.pedir(`/pacientes/${pacienteActual.id}/indicaciones`);
    if (indicaciones.length === 0) {
      contenedor.innerHTML = '<div class="vacio">Sin indicaciones dadas.</div>';
      return;
    }
    contenedor.innerHTML = indicaciones.map((i) => `
      <div class="item-lista">
        <div>
          <div class="titulo">${escaparHtml(i.descripcion)}</div>
          <div class="detalle">${formatearFecha(i.fecha_creacion)}</div>
        </div>
      </div>`).join('');
  } catch (error) {
    contenedor.innerHTML = `<div class="vacio">${escaparHtml(error.message)}</div>`;
  }
}

/* ============================================================
   MENSAJES — bandeja con no leídos por paciente y tiempo real
   ============================================================ */

let chatPacienteActual = null;
let chatPacienteActualNombre = null;
let temporizadorChat = null;

async function irAChatPaciente(idPaciente, nombre) {
  mostrarSeccion('mensajes');
  await abrirChatPaciente(idPaciente, nombre);
}

async function cargarListaPacientesChat() {
  const contenedor = document.getElementById('lista-pacientes-chat');
  document.getElementById('mensajes-lista-vista').classList.remove('oculto');
  document.getElementById('mensajes-chat-vista').classList.add('oculto');
  detenerPollingChat();

  try {
    const conversaciones = await API.pedir('/mensajes/conversaciones');
    if (conversaciones.length === 0) {
      contenedor.innerHTML = '<div class="vacio">Aún no hay pacientes.</div>';
      return;
    }
    contenedor.innerHTML = conversaciones.map((p) => {
      const noLeidos = Number(p.no_leidos || 0);
      const preview = p.ultimo_mensaje
        ? `${p.ultimo_remitente === 'medico' ? 'Tú: ' : ''}${p.ultimo_mensaje}`
        : `${p.edad ?? '—'} años · Sin mensajes aún`;
      return `
        <div class="fila-persona ${noLeidos > 0 ? 'tiene-no-leidos' : ''}">
          <span class="avatar-inicial">${iniciales(p.nombre)}</span>
          <div class="info">
            <span class="nombre">${escaparHtml(p.nombre)}</span>
            <span class="preview-msg">${escaparHtml(preview)}</span>
          </div>
          ${noLeidos > 0 ? `<span class="badge-chat">${noLeidos}</span>` : ''}
          <button class="boton boton-chico boton-secundario" data-chat="${p.id}" data-nombre="${escaparHtml(p.nombre)}">Abrir</button>
        </div>`;
    }).join('');

    contenedor.querySelectorAll('[data-chat]').forEach((btn) => {
      btn.addEventListener('click', () => abrirChatPaciente(Number(btn.dataset.chat), btn.dataset.nombre));
    });
  } catch (error) {
    contenedor.innerHTML = `<div class="vacio">${escaparHtml(error.message)}</div>`;
  }
}

async function abrirChatPaciente(idPaciente, nombre) {
  chatPacienteActual = idPaciente;
  chatPacienteActualNombre = nombre;
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
  chatPacienteActual = null;
}

document.getElementById('btn-volver-mensajes').addEventListener('click', cargarListaPacientesChat);

async function refrescarConversacion(marcarLeidos) {
  if (!chatPacienteActual) return;
  const contenedor = document.getElementById('chat-mensajes');
  try {
    const mensajes = await API.pedir(`/mensajes/${chatPacienteActual}/${miId}`);
    contenedor.innerHTML = mensajes.length === 0
      ? '<div class="vacio">Escribe el primer mensaje 👋</div>'
      : mensajes.map((m) => `
          <div class="burbuja ${m.remitente === 'medico' ? 'burbuja-mia' : 'burbuja-otro'}">
            ${escaparHtml(m.contenido)}
            <span class="hora">${formatearFechaHora(m.fecha_hora)}</span>
          </div>`).join('');
    contenedor.scrollTop = contenedor.scrollHeight;

    if (marcarLeidos) {
      await API.pedir(`/mensajes/${chatPacienteActual}/${miId}/leidos`, { metodo: 'PUT' });
      actualizarBadgeMensajes();
      cargarResumenLateral();
    }
  } catch (error) {
    contenedor.innerHTML = `<div class="vacio">${escaparHtml(error.message)}</div>`;
  }
}

document.getElementById('form-mensaje').addEventListener('submit', async (evento) => {
  evento.preventDefault();
  const entrada = document.getElementById('entrada-mensaje');
  const contenido = entrada.value.trim();
  if (!contenido || !chatPacienteActual) return;
  entrada.value = '';

  try {
    await API.pedir('/mensajes', {
      metodo: 'POST',
      cuerpo: { id_paciente: chatPacienteActual, contenido }
    });
    refrescarConversacion(false);
  } catch (error) {
    alert(error.message);
  }
});

document.getElementById('btn-llamar').addEventListener('click', () => {
  if (!chatPacienteActual) return;
  Llamada.iniciar({ id: chatPacienteActual, rol: 'paciente', nombre: chatPacienteActualNombre });
});

async function actualizarBadgeMensajes() {
  try {
    const datos = await API.pedir('/mensajes/no-leidos');
    const badge = document.getElementById('badge-mensajes');
    badge.textContent = datos.no_leidos;
    badge.classList.toggle('oculto', datos.no_leidos === 0);
  } catch (error) { /* silencioso */ }
}

/* ============================================================
   Arranque (corregido: ahora también carga el riel lateral al iniciar)
   ============================================================ */

cargarAlertas();
cargarResumenLateral();
actualizarBadgeMensajes();
setInterval(actualizarBadgeMensajes, 20000);
