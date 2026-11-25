/* ============================================================
   MediConnect — capa de acceso a la API y utilidades compartidas
   Único lugar del frontend que sabe de tokens, fetch y URL base.
   Todas las páginas la cargan antes que su propio script.
   ============================================================ */

const API_ORIGIN = (window.MEDICONNECT_API_URL || localStorage.getItem('mc_server_url') || '').replace(/\/+$/, '');

const API = {
  origen: API_ORIGIN,
  base: `${API_ORIGIN}/api`,

  socketUrl() {
    return API_ORIGIN || undefined;
  },

  urlArchivo(nombreArchivo) {
    if (!nombreArchivo) return '';
    return `${API_ORIGIN}/uploads/${encodeURIComponent(nombreArchivo)}`;
  },

  // ---- Sesión (localStorage) ----
  guardarSesion(token, rol, usuario) {
    localStorage.setItem('mc_token', token);
    localStorage.setItem('mc_rol', rol);
    localStorage.setItem('mc_usuario', JSON.stringify(usuario));
  },

  token() { return localStorage.getItem('mc_token'); },
  rol() { return localStorage.getItem('mc_rol'); },

  usuario() {
    try {
      return JSON.parse(localStorage.getItem('mc_usuario'));
    } catch (e) {
      return null;
    }
  },

  cerrarSesion() {
    localStorage.removeItem('mc_token');
    localStorage.removeItem('mc_rol');
    localStorage.removeItem('mc_usuario');
    window.location.href = '/index.html';
  },

  // ---- Peticiones ----
  async pedir(ruta, opciones = {}) {
    const { metodo = 'GET', cuerpo = null, formData = null } = opciones;

    const cabeceras = {};
    const token = this.token();
    if (token) cabeceras['Authorization'] = `Bearer ${token}`;
    if (cuerpo) cabeceras['Content-Type'] = 'application/json';

    const respuesta = await fetch(this.base + ruta, {
      method: metodo,
      headers: cabeceras,
      body: formData ? formData : (cuerpo ? JSON.stringify(cuerpo) : null)
    });

    if (respuesta.status === 401 && this.token()) {
      this.cerrarSesion();
      return;
    }

    let datos = null;
    try { datos = await respuesta.json(); } catch (e) { datos = null; }

    if (!respuesta.ok) {
      const error = new Error((datos && datos.error) || `Error ${respuesta.status}`);
      error.status = respuesta.status;
      throw error;
    }

    return datos;
  }
};

function exigirSesion(rolEsperado) {
  if (!API.token() || API.rol() !== rolEsperado) {
    window.location.href = '/index.html';
  }
}

// ---- Helpers de interfaz compartidos ----

function mostrarAviso(contenedor, tipo, texto) {
  contenedor.innerHTML = `<div class="aviso aviso-${tipo}">${escaparHtml(texto)}</div>`;
  contenedor.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function limpiarAviso(contenedor) {
  contenedor.innerHTML = '';
}

function escaparHtml(texto) {
  const div = document.createElement('div');
  div.textContent = String(texto ?? '');
  return div.innerHTML;
}

// Fecha local del dispositivo en formato YYYY-MM-DD (evita el desfase UTC-4
// después de las 8:00 PM en Venezuela cuando se usa toISOString()).
function fechaLocalISO(fecha = new Date()) {
  const y = fecha.getFullYear();
  const m = String(fecha.getMonth() + 1).padStart(2, '0');
  const d = String(fecha.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatearFecha(valor) {
  if (!valor) return '—';
  const soloFecha = String(valor).slice(0, 10);
  const [a, m, d] = soloFecha.split('-');
  if (!a || !m || !d) return String(valor);
  return `${d}/${m}/${a}`;
}

function formatearHora(valor) {
  if (!valor) return '';
  const texto = String(valor);
  if (texto.includes('T')) {
    const fecha = new Date(texto);
    return fecha.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' });
  }
  return texto.slice(0, 5);
}

function formatearFechaHora(valor) {
  if (!valor) return '—';
  return `${formatearFecha(valor)} ${formatearHora(valor)}`;
}

// Evaluación de umbrales clínicos (idénticos a pacientesController.js)
function evaluarSignoCritico(s) {
  const motivos = [];
  if (!s) return motivos;

  const partes = String(s.presion_arterial || '').split('/');
  const sis = Number(partes[0]);
  const dia = Number(partes[1]);
  if (!Number.isNaN(sis) && !Number.isNaN(dia) && (sis >= 180 || sis <= 90 || dia >= 120 || dia <= 60)) {
    motivos.push(`PA ${s.presion_arterial}`);
  }
  const fc = Number(s.frecuencia_cardiaca);
  if (!Number.isNaN(fc) && (fc < 50 || fc > 120)) {
    motivos.push(`FC ${fc} bpm`);
  }
  const spo2 = Number(s.spo2);
  if (!Number.isNaN(spo2) && spo2 < 90) {
    motivos.push(`SpO2 ${spo2}%`);
  }
  const temp = Number(s.temperatura);
  if (!Number.isNaN(temp) && (temp < 35 || temp > 39)) {
    motivos.push(`Temp ${temp}°C`);
  }
  if (s.glicemia !== null && s.glicemia !== undefined && s.glicemia !== '') {
    const gli = Number(s.glicemia);
    if (!Number.isNaN(gli) && (gli < 70 || gli > 250)) {
      motivos.push(`Glicemia ${gli} mg/dL`);
    }
  }
  return motivos;
}

// Modal visor de foto de evidencia (verificación clínica sin abrir pestaña nueva)
function abrirVisorFoto(urlImagen, titulo, detalle) {
  let fondo = document.getElementById('visor-foto-modal');
  if (!fondo) {
    fondo = document.createElement('div');
    fondo.id = 'visor-foto-modal';
    fondo.className = 'visor-fondo oculto';
    fondo.innerHTML = `
      <div class="visor-caja">
        <div class="fila-separada">
          <h3 id="visor-titulo">Evidencia fotográfica</h3>
          <button type="button" class="boton boton-chico boton-secundario" id="btn-cerrar-visor">Cerrar</button>
        </div>
        <p class="texto-suave mt-1" id="visor-detalle"></p>
        <img id="visor-img" class="visor-img" alt="Evidencia fotográfica">
        <div class="visor-nota">
          Respaldo fotográfico inalterable: compara la lectura del dispositivo o informe con los valores registrados.
        </div>
      </div>`;
    document.body.appendChild(fondo);

    fondo.addEventListener('click', (e) => {
      if (e.target === fondo) fondo.classList.add('oculto');
    });
    document.getElementById('btn-cerrar-visor').addEventListener('click', () => {
      fondo.classList.add('oculto');
    });
  }

  document.getElementById('visor-titulo').textContent = titulo || 'Evidencia fotográfica';
  document.getElementById('visor-detalle').textContent = detalle || '';
  document.getElementById('visor-img').src = urlImagen;
  fondo.classList.remove('oculto');
}
