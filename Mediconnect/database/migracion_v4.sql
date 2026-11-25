-- Migración segura para bases de datos MediConnect creadas en Momento III.
-- Nota: backend/config/migrarEsquema.js también aplica estos cambios automáticamente al iniciar serve.js.

ALTER TABLE signos_vitales ADD COLUMN glicemia DECIMAL(5,1) NULL AFTER temperatura;
ALTER TABLE alertas ADD COLUMN fecha_resolucion TIMESTAMP NULL AFTER resuelta;

INSERT IGNORE INTO especialidades (nombre) VALUES
  ('Cardiología'),
  ('Endocrinología'),
  ('Medicina Interna'),
  ('Neumología'),
  ('Nefrología');
