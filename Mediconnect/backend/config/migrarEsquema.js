const db = require('./database');

const ESPECIALIDADES_BASE = [
  'Cardiología',
  'Endocrinología',
  'Medicina Interna',
  'Neumología',
  'Nefrología'
];

async function columnaExiste(tabla, columna) {
  const [filas] = await db.query(
    `SELECT COUNT(*) AS total
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND COLUMN_NAME = ?`,
    [tabla, columna]
  );
  return filas[0].total > 0;
}

// Corre una vez al arrancar el servidor para mantener compatibilidad con
// bases de datos existentes de Momento III sin requerir pasos manuales:
// 1) Reinicia presencia de médicos (evita médicos "en línea" fantasma tras un reinicio).
// 2) Agrega columnas nuevas (glicemia, fecha_resolucion) solo si no existen.
// 3) Asegura las 5 especialidades base para registro médico y Diagnóstico Flash.
async function asegurarEsquema() {
  try {
    await db.query('UPDATE medicos SET en_linea = 0');

    if (!(await columnaExiste('signos_vitales', 'glicemia'))) {
      await db.query('ALTER TABLE signos_vitales ADD COLUMN glicemia DECIMAL(5,1) NULL AFTER temperatura');
      console.log('Migración aplicada: columna signos_vitales.glicemia agregada.');
    }

    if (!(await columnaExiste('alertas', 'fecha_resolucion'))) {
      await db.query('ALTER TABLE alertas ADD COLUMN fecha_resolucion TIMESTAMP NULL AFTER resuelta');
      console.log('Migración aplicada: columna alertas.fecha_resolucion agregada.');
    }

    for (const nombre of ESPECIALIDADES_BASE) {
      await db.query('INSERT IGNORE INTO especialidades (nombre) VALUES (?)', [nombre]);
    }
  } catch (error) {
    console.error('Aviso al verificar esquema inicial:', error.message);
  }
}

module.exports = { asegurarEsquema };
