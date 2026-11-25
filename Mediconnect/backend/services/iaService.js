const { GoogleGenAI } = require('@google/genai');

const ESPECIALIDADES_VALIDAS = [
  'Cardiología',
  'Endocrinología',
  'Medicina Interna',
  'Neumología',
  'Nefrología'
];

// Orden de prioridad de modelos de Gemini. Si uno devuelve 404/429 o no está
// disponible en el proyecto/región, se intenta automáticamente el siguiente.
const MODELOS_CANDIDATOS = [
  process.env.GEMINI_MODEL,
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'gemini-1.5-flash'
].filter((m, idx, arr) => Boolean(m) && arr.indexOf(m) === idx);

let client = null;
function obtenerCliente() {
  if (!process.env.GEMINI_API_KEY) {
    return null;
  }
  if (!client) {
    client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }
  return client;
}

const PROMPT_SISTEMA = `Eres el asistente de "Diagnóstico Flash" dentro de MediConnect, una
plataforma de telemedicina para pacientes con condiciones crónicas
(hipertensión, diabetes, enfermedades cardiovasculares) en comunidades de
bajos recursos.

REGLAS INQUEBRANTABLES:
1. NUNCA das un diagnóstico médico ni recetes medicamentos. Solo orientas y
   ayudas a decidir si el paciente necesita atención urgente o puede esperar
   una consulta normal.
2. Ya se le mostró al paciente un disclaimer legal antes de este chat
   (que esto no reemplaza a un médico). No hace falta que lo repitas en
   cada mensaje, pero si el paciente pide un diagnóstico o tratamiento
   directo, recuérdaselo brevemente y redirige a consulta profesional.
3. Haces preguntas de seguimiento (síntomas, duración, intensidad,
   antecedentes relevantes) antes de clasificar — no clasifiques en el
   primer mensaje salvo que ya sea obviamente una emergencia (dolor de
   pecho intenso, dificultad respiratoria severa, pérdida de conciencia,
   hipoglicemia grave, etc.), en cuyo caso clasifica como "urgente" de inmediato.
4. Tu tono es cálido, claro, sin tecnicismos innecesarios.

FORMATO DE RESPUESTA — SIEMPRE responde con un único objeto JSON, sin texto
antes ni después, con esta forma exacta:
{
  "mensaje": "texto que verá el paciente en el chat",
  "estado": "en_curso" | "urgente" | "leve",
  "especialidad_sugerida": null | "una de: ${ESPECIALIDADES_VALIDAS.join(', ')}"
}

- "en_curso": todavía estás haciendo preguntas, no has clasificado.
- "urgente": los síntomas requieren atención médica pronta. especialidad_sugerida
  es OBLIGATORIA en este caso (elige la más relevante de la lista).
- "leve": puede manejarse con recomendaciones básicas y consulta normal más
  adelante. especialidad_sugerida es opcional aquí.
- Si el paciente reporta que síntomas antes clasificados como "leve" están
  empeorando, reclasifica como "urgente".`;

function quitarAcentos(texto) {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function normalizarEspecialidad(nombre) {
  if (!nombre) return null;
  const buscado = quitarAcentos(nombre);
  const encontrada = ESPECIALIDADES_VALIDAS.find((e) => quitarAcentos(e) === buscado);
  return encontrada || null;
}

function parsearRespuesta(textoCrudo) {
  try {
    const limpio = String(textoCrudo || '')
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```$/i, '')
      .trim();
    const inicio = limpio.indexOf('{');
    const fin = limpio.lastIndexOf('}');
    if (inicio === -1 || fin === -1 || fin <= inicio) {
      throw new Error('No se encontró objeto JSON en la respuesta');
    }
    const json = JSON.parse(limpio.slice(inicio, fin + 1));

    if (!['en_curso', 'urgente', 'leve'].includes(json.estado)) {
      throw new Error('estado fuera del enum esperado');
    }

    let especialidad = normalizarEspecialidad(json.especialidad_sugerida);
    if (json.estado === 'urgente' && !especialidad) {
      especialidad = 'Medicina Interna';
    }

    return {
      mensaje: String(json.mensaje || '').trim() || textoCrudo,
      estado: json.estado,
      especialidad_sugerida: especialidad
    };
  } catch (error) {
    console.error('Respuesta de Gemini no vino en el JSON esperado:', textoCrudo, error);
    return {
      mensaje: textoCrudo,
      estado: 'en_curso',
      especialidad_sugerida: null
    };
  }
}

// Respaldo clínico estructurado si la API externa falla por cuota/red, para
// que el paciente nunca quede bloqueado sin orientación ni alerta médica.
function triajeRespaldo(historial) {
  const mensajesPaciente = historial
    .filter((m) => m.remitente === 'paciente')
    .map((m) => quitarAcentos(m.contenido));
  const ultimo = mensajesPaciente[mensajesPaciente.length - 1] || '';
  const todo = mensajesPaciente.join(' ');

  const senalesUrgentes = [
    'pecho', 'opresion', 'falta de aire', 'ahogo', 'respirar', 'desmayo',
    'inconsciente', 'convulsion', 'sangrado', 'vision borrosa', 'paralizado',
    'paralisis', '180', '190', '200', 'hipoglicemia', 'muy alta', 'insoportable'
  ];
  const esUrgente = senalesUrgentes.some((k) => ultimo.includes(k) || todo.includes(k));

  if (esUrgente) {
    let esp = 'Medicina Interna';
    if (todo.includes('pecho') || todo.includes('presion') || todo.includes('corazon')) esp = 'Cardiología';
    else if (todo.includes('azucar') || todo.includes('glicemia') || todo.includes('diabetes') || todo.includes('insulina')) esp = 'Endocrinología';
    else if (todo.includes('respirar') || todo.includes('aire') || todo.includes('tos')) esp = 'Neumología';
    else if (todo.includes('orina') || todo.includes('rinon') || todo.includes('hinchazon')) esp = 'Nefrología';

    return {
      mensaje: 'Por los síntomas que mencionas, te recomiendo atención médica pronta. He marcado el caso como urgente y notificado al equipo médico para orientarte.',
      estado: 'urgente',
      especialidad_sugerida: esp
    };
  }

  if (mensajesPaciente.length === 1) {
    return {
      mensaje: 'Entiendo. ¿Desde hace cuánto tiempo sientes estas molestias y qué tan intensas son del 1 al 10? Indícame también si tienes algún síntoma adicional como mareo, dolor de cabeza o falta de aire.',
      estado: 'en_curso',
      especialidad_sugerida: null
    };
  }

  return {
    mensaje: 'Gracias por los detalles. Si tus síntomas son leves y estables, mantén reposo, revisa tus signos vitales con tu aparato y programa una consulta de control con tu médico; si empeoran o aparece algún síntoma de alarma, escríbenos de inmediato.',
    estado: 'leve',
    especialidad_sugerida: 'Medicina Interna'
  };
}

async function conversar(historial) {
  const ai = obtenerCliente();
  if (!ai) {
    return triajeRespaldo(historial);
  }

  const contents = historial.map((m) => ({
    role: m.remitente === 'paciente' ? 'user' : 'model',
    parts: [{ text: m.contenido }]
  }));

  for (const modelo of MODELOS_CANDIDATOS) {
    try {
      const respuesta = await ai.models.generateContent({
        model: modelo,
        contents,
        config: {
          systemInstruction: PROMPT_SISTEMA,
          responseMimeType: 'application/json'
        }
      });

      const texto = typeof respuesta.text === 'function' ? respuesta.text() : respuesta.text;
      if (texto && String(texto).trim() !== '') {
        return parsearRespuesta(String(texto));
      }
    } catch (error) {
      console.warn(`Intento con modelo Gemini "${modelo}" falló:`, error && error.message ? error.message : error);
    }
  }

  console.warn('Todos los modelos Gemini fallaron; activando respaldo clínico local de Diagnóstico Flash.');
  return triajeRespaldo(historial);
}

module.exports = { conversar, ESPECIALIDADES_VALIDAS, normalizarEspecialidad };
