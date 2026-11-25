const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/database');

const SALT_ROUNDS = 10;
const JWT_EXPIRA_EN = '8h';

function estaVacio(valor) {
  return valor === undefined || valor === null || String(valor).trim() === '';
}

const VALORES_PERMITIDOS = {
  sexo: ['Masculino', 'Femenino'],
  fumador: ['Si', 'No'],
  alcohol: ['No', 'Ocasional', 'Frecuente'],
  actividad_fisica: ['Sedentario', 'Moderado', 'Activo'],
  tipo_sangre: ['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-']
};

async function registrarPaciente(req, res) {
  const {
    nombre, cedula, email, password, edad, sexo, tipo_sangre,
    peso, altura, telefono, fumador, alcohol, actividad_fisica
  } = req.body;

  const camposObligatorios = [
    ['nombre', nombre],
    ['cedula', cedula],
    ['password', password],
    ['edad', edad],
    ['sexo', sexo],
    ['tipo_sangre', tipo_sangre],
    ['peso', peso],
    ['altura', altura],
    ['telefono', telefono],
    ['fumador', fumador],
    ['alcohol', alcohol],
    ['actividad_fisica', actividad_fisica]
  ];

  for (const [campo, valor] of camposObligatorios) {
    if (estaVacio(valor)) {
      return res.status(400).json({ error: `El campo "${campo}" es obligatorio.` });
    }
  }

  if (String(password).length < 6) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres.' });
  }

  const edadNum = Number(edad);
  const pesoNum = Number(peso);
  const alturaNum = Number(altura);
  if (!Number.isInteger(edadNum) || edadNum < 1 || edadNum > 120) {
    return res.status(400).json({ error: 'La edad debe ser un número entero entre 1 y 120.' });
  }
  if (!Number.isFinite(pesoNum) || pesoNum <= 0 || pesoNum > 500) {
    return res.status(400).json({ error: 'El peso debe ser un número válido en kilogramos.' });
  }
  if (!Number.isFinite(alturaNum) || alturaNum < 30 || alturaNum > 260) {
    return res.status(400).json({ error: 'La altura debe ser un número válido en centímetros.' });
  }

  for (const [campo, valoresValidos] of Object.entries(VALORES_PERMITIDOS)) {
    if (!valoresValidos.includes(req.body[campo])) {
      return res.status(400).json({
        error: `${campo} debe ser uno de: ${valoresValidos.join(', ')}`
      });
    }
  }

  const cedulaLimpia = String(cedula).trim();
  const emailLimpio = estaVacio(email) ? null : String(email).trim().toLowerCase();

  try {
    const [existentes] = await db.query('SELECT id FROM pacientes WHERE cedula = ?', [cedulaLimpia]);
    if (existentes.length > 0) {
      return res.status(400).json({ error: 'Ya existe un paciente registrado con esa cédula.' });
    }

    if (emailLimpio) {
      const [emailExistente] = await db.query('SELECT id FROM pacientes WHERE email = ?', [emailLimpio]);
      if (emailExistente.length > 0) {
        return res.status(400).json({ error: 'Ya existe un paciente registrado con ese correo.' });
      }
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    await db.query(
      `INSERT INTO pacientes
        (nombre, cedula, email, password, edad, sexo, tipo_sangre, peso, altura, telefono, fumador, alcohol, actividad_fisica)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        String(nombre).trim(), cedulaLimpia, emailLimpio, passwordHash,
        edadNum, sexo, tipo_sangre, pesoNum, alturaNum,
        String(telefono).trim(), fumador, alcohol, actividad_fisica
      ]
    );

    return res.status(201).json({ mensaje: 'Paciente registrado exitosamente.' });
  } catch (error) {
    console.error('Error al registrar paciente:', error);
    return res.status(500).json({ error: 'Error del servidor al registrar el paciente.' });
  }
}

async function registrarMedico(req, res) {
  const { nombre, email, password, id_especialidad, telefono, titulo, referencias } = req.body;

  const camposObligatorios = [
    ['nombre', nombre],
    ['email', email],
    ['password', password],
    ['id_especialidad', id_especialidad],
    ['titulo', titulo],
    ['referencias', referencias]
  ];

  for (const [campo, valor] of camposObligatorios) {
    if (estaVacio(valor)) {
      return res.status(400).json({ error: `El campo "${campo}" es obligatorio.` });
    }
  }

  if (String(password).length < 6) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres.' });
  }

  const emailLimpio = String(email).trim().toLowerCase();

  try {
    const [especialidades] = await db.query('SELECT id FROM especialidades WHERE id = ?', [id_especialidad]);
    if (especialidades.length === 0) {
      return res.status(400).json({ error: 'La especialidad seleccionada no es válida.' });
    }

    const [existentes] = await db.query('SELECT id FROM medicos WHERE email = ?', [emailLimpio]);
    if (existentes.length > 0) {
      return res.status(400).json({ error: 'Ya existe un médico registrado con ese email.' });
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    await db.query(
      `INSERT INTO medicos
        (nombre, email, password, id_especialidad, telefono, titulo, referencias)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        String(nombre).trim(), emailLimpio, passwordHash, Number(id_especialidad),
        estaVacio(telefono) ? null : String(telefono).trim(),
        String(titulo).trim(), String(referencias).trim()
      ]
    );

    return res.status(201).json({
      mensaje: 'Tu solicitud fue registrada y está en revisión. Te notificaremos cuando sea aprobada.'
    });
  } catch (error) {
    console.error('Error al registrar médico:', error);
    return res.status(500).json({ error: 'Error del servidor al registrar el médico.' });
  }
}

async function loginPaciente(req, res) {
  const { cedula, password } = req.body;

  if (estaVacio(cedula) || estaVacio(password)) {
    return res.status(400).json({ error: 'Cédula y contraseña son obligatorias.' });
  }

  try {
    const [filas] = await db.query('SELECT * FROM pacientes WHERE cedula = ?', [String(cedula).trim()]);
    if (filas.length === 0) {
      return res.status(401).json({ error: 'Credenciales inválidas.' });
    }

    const paciente = filas[0];
    const passwordValido = await bcrypt.compare(password, paciente.password);
    if (!passwordValido) {
      return res.status(401).json({ error: 'Credenciales inválidas.' });
    }

    const token = jwt.sign(
      { id: paciente.id, rol: 'paciente' },
      process.env.JWT_SECRET,
      { expiresIn: JWT_EXPIRA_EN }
    );

    const { password: _password, ...datosPaciente } = paciente;

    return res.status(200).json({ token, paciente: datosPaciente });
  } catch (error) {
    console.error('Error al iniciar sesión del paciente:', error);
    return res.status(500).json({ error: 'Error del servidor al iniciar sesión.' });
  }
}

async function loginMedico(req, res) {
  const { email, password } = req.body;

  if (estaVacio(email) || estaVacio(password)) {
    return res.status(400).json({ error: 'Correo electrónico y contraseña son obligatorios.' });
  }

  try {
    const [filas] = await db.query(
      `SELECT m.*, e.nombre AS especialidad
       FROM medicos m
       LEFT JOIN especialidades e ON m.id_especialidad = e.id
       WHERE m.email = ?`,
      [String(email).trim().toLowerCase()]
    );
    if (filas.length === 0) {
      return res.status(401).json({ error: 'Credenciales inválidas.' });
    }

    const medico = filas[0];
    const passwordValido = await bcrypt.compare(password, medico.password);
    if (!passwordValido) {
      return res.status(401).json({ error: 'Credenciales inválidas.' });
    }

    if (medico.estado_solicitud !== 'aprobado') {
      const mensajesEstado = {
        pendiente: 'Tu solicitud aún está en revisión.',
        rechazado: 'Tu solicitud fue rechazada.'
      };
      return res.status(403).json({
        error: mensajesEstado[medico.estado_solicitud] || 'Tu cuenta no está habilitada.'
      });
    }

    const token = jwt.sign(
      { id: medico.id, rol: 'medico' },
      process.env.JWT_SECRET,
      { expiresIn: JWT_EXPIRA_EN }
    );

    const { password: _password, ...datosMedico } = medico;

    return res.status(200).json({ token, medico: datosMedico });
  } catch (error) {
    console.error('Error al iniciar sesión del médico:', error);
    return res.status(500).json({ error: 'Error del servidor al iniciar sesión.' });
  }
}

module.exports = {
  registrarPaciente,
  registrarMedico,
  loginPaciente,
  loginMedico,
  VALORES_PERMITIDOS
};
