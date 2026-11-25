const { GoogleGenAI } = require('@google/genai');

const ESPECIALIDADES_VALIDAS = [
  'Cardiología',
  'Endocrinología',
  'Medicina Interna',
  'Neumología',
  'Nefrología'
];

// Orden de modelos con fallback automático: si el modelo configurado en .env
// deja de estar disponible en Google AI Studio, prueba el siguiente vigente.
const MODELOS_CANDIDATOS = [
  process.env.GEMINI_MODEL,
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'gemini-1.5-flash'
].filter((m, idx, arr) => Boolean(m) && arr.indexOf(m) === idx);

let client = null;
function obtenerCliente() {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY no está configurada en el servidor.');
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
    .replace(/[̀-ͯ]/g, '')
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
    const inicio = textoCrudo.indexOf('{');
    const fin = textoCrudo.lastIndexOf('}');
    if (inicio === -1 || fin === -1 || fin <= inicio) {
      throw new Error('No se encontró objeto JSON en la respuesta');
    }
    const json = JSON.parse(textoCrudo.slice(inicio, fin + 1));

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

async function conversar(historial) {
  const ai = obtenerCliente();
  const contents = historial.map((m) => ({
    role: m.remitente === 'paciente' ? 'user' : 'model',
    parts: [{ text: m.contenido }]
  }));

  let ultimoError = null;
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
      return parsearRespuesta(String(texto || ''));
    } catch (error) {
      ultimoError = error;
      const msg = String(error && error.message || '');
      const esModeloNoEncontrado = error && (error.status === 404 || msg.includes('not found') || msg.includes('404'));
      if (!esModeloNoEncontrado) {
        throw error;
      }
      console.warn(`Modelo Gemini "${modelo}" no disponible; probando siguiente alternativa...`);
    }
  }

  throw ultimoError || new Error('No fue posible conectar con el servicio de IA.');
}

module.exports = { conversar, ESPECIALIDADES_VALIDAS, normalizarEspecialidad };
