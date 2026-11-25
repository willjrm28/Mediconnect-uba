-- Base de datos: mediconnect
-- Plataforma de telemedicina - Universidad Bicentenaria de Aragua
-- ABEP Productivo III / IV (versión consolidada)

CREATE DATABASE IF NOT EXISTS mediconnect
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE mediconnect;

CREATE TABLE IF NOT EXISTS especialidades (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL UNIQUE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS medicos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(150) NOT NULL,
  email VARCHAR(150) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  id_especialidad INT NOT NULL,
  telefono VARCHAR(20),
  titulo VARCHAR(200),
  referencias TEXT,
  estado_solicitud ENUM('pendiente', 'aprobado', 'rechazado') DEFAULT 'pendiente',
  en_linea TINYINT(1) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (id_especialidad) REFERENCES especialidades(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pacientes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(150) NOT NULL,
  cedula VARCHAR(20) NOT NULL UNIQUE,
  email VARCHAR(150) UNIQUE,
  password VARCHAR(255) NOT NULL,
  edad INT,
  sexo ENUM('Masculino', 'Femenino'),
  tipo_sangre VARCHAR(5),
  peso DECIMAL(5,2),
  altura DECIMAL(5,2),
  telefono VARCHAR(20),
  fumador ENUM('Si', 'No') DEFAULT 'No',
  alcohol ENUM('No', 'Ocasional', 'Frecuente') DEFAULT 'No',
  actividad_fisica ENUM('Sedentario', 'Moderado', 'Activo') DEFAULT 'Sedentario',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS citas (
  id INT AUTO_INCREMENT PRIMARY KEY,
  id_paciente INT NOT NULL,
  id_medico INT NOT NULL,
  fecha DATE NOT NULL,
  hora TIME NOT NULL,
  tipo_consulta VARCHAR(150),
  estado ENUM('Programada', 'Confirmada', 'Pendiente', 'Completada', 'Cancelada') DEFAULT 'Programada',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_citas_medico_fecha (id_medico, fecha, hora),
  INDEX idx_citas_paciente_fecha (id_paciente, fecha),
  FOREIGN KEY (id_paciente) REFERENCES pacientes(id),
  FOREIGN KEY (id_medico) REFERENCES medicos(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS mensajes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  id_paciente INT NOT NULL,
  id_medico INT NOT NULL,
  remitente ENUM('medico', 'paciente') NOT NULL,
  contenido TEXT NOT NULL,
  fecha_hora TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  leido TINYINT(1) DEFAULT 0,
  INDEX idx_mensajes_conv (id_paciente, id_medico, fecha_hora),
  FOREIGN KEY (id_paciente) REFERENCES pacientes(id),
  FOREIGN KEY (id_medico) REFERENCES medicos(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS alertas (
  id INT AUTO_INCREMENT PRIMARY KEY,
  id_paciente INT NOT NULL,
  id_medico INT NOT NULL,
  tipo ENUM('valor_critico', 'receta_por_vencer', 'resultado_disponible', 'sintoma_urgente') NOT NULL,
  prioridad ENUM('alta', 'media', 'baja') DEFAULT 'media',
  descripcion TEXT,
  fecha_hora TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  resuelta TINYINT(1) DEFAULT 0,
  fecha_resolucion TIMESTAMP NULL,
  INDEX idx_alertas_medico_resuelta (id_medico, resuelta, fecha_hora),
  FOREIGN KEY (id_paciente) REFERENCES pacientes(id),
  FOREIGN KEY (id_medico) REFERENCES medicos(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS alergias (
  id INT AUTO_INCREMENT PRIMARY KEY,
  id_paciente INT NOT NULL,
  sustancia VARCHAR(150) NOT NULL,
  FOREIGN KEY (id_paciente) REFERENCES pacientes(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS antecedentes_familiares (
  id INT AUTO_INCREMENT PRIMARY KEY,
  id_paciente INT NOT NULL,
  condicion VARCHAR(150) NOT NULL,
  FOREIGN KEY (id_paciente) REFERENCES pacientes(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS resultados_laboratorio (
  id INT AUTO_INCREMENT PRIMARY KEY,
  id_paciente INT NOT NULL,
  id_medico INT NOT NULL,
  tipo_examen VARCHAR(150) NOT NULL,
  valor DECIMAL(8,2) NULL,
  unidad VARCHAR(20) NULL,
  fecha_orden DATE NOT NULL,
  fecha_resultado DATE NULL,
  estado_orden ENUM('pendiente', 'completado') NOT NULL DEFAULT 'pendiente',
  estado_clinico ENUM('Normal', 'Alta', 'Baja', 'Critico') NULL,
  foto_evidencia VARCHAR(255) NULL,
  FOREIGN KEY (id_paciente) REFERENCES pacientes(id) ON DELETE CASCADE,
  FOREIGN KEY (id_medico) REFERENCES medicos(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS historial_consultas (
  id INT AUTO_INCREMENT PRIMARY KEY,
  id_paciente INT NOT NULL,
  id_medico INT NOT NULL,
  fecha DATE NOT NULL,
  motivo VARCHAR(200),
  notas TEXT,
  FOREIGN KEY (id_paciente) REFERENCES pacientes(id) ON DELETE CASCADE,
  FOREIGN KEY (id_medico) REFERENCES medicos(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS medicamentos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  id_paciente INT NOT NULL,
  id_medico INT NOT NULL,
  nombre VARCHAR(150) NOT NULL,
  dosis VARCHAR(50),
  frecuencia VARCHAR(100),
  instrucciones VARCHAR(200),
  fecha_inicio DATE NOT NULL,
  fecha_fin DATE,
  alerta_vencimiento_enviada TINYINT(1) DEFAULT 0,
  FOREIGN KEY (id_paciente) REFERENCES pacientes(id) ON DELETE CASCADE,
  FOREIGN KEY (id_medico) REFERENCES medicos(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS registro_tomas (
  id INT AUTO_INCREMENT PRIMARY KEY,
  id_medicamento INT NOT NULL,
  fecha DATE NOT NULL,
  hora TIME,
  tomado TINYINT(1) DEFAULT 0,
  FOREIGN KEY (id_medicamento) REFERENCES medicamentos(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS signos_vitales (
  id INT AUTO_INCREMENT PRIMARY KEY,
  id_paciente INT NOT NULL,
  id_cita INT NULL,
  presion_arterial VARCHAR(20),
  frecuencia_cardiaca INT,
  spo2 INT,
  temperatura DECIMAL(4,1),
  glicemia DECIMAL(5,1) NULL,
  fecha_hora TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  origen ENUM('consulta', 'app_paciente') NOT NULL DEFAULT 'app_paciente',
  foto_evidencia VARCHAR(255) NULL,
  INDEX idx_signos_paciente_fecha (id_paciente, fecha_hora),
  FOREIGN KEY (id_paciente) REFERENCES pacientes(id) ON DELETE CASCADE,
  FOREIGN KEY (id_cita) REFERENCES citas(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS diagnosticos_flash (
  id INT AUTO_INCREMENT PRIMARY KEY,
  id_paciente INT NOT NULL,
  estado ENUM('en_curso', 'urgente', 'leve') DEFAULT 'en_curso',
  id_especialidad_sugerida INT NULL,
  fecha_hora_inicio TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (id_paciente) REFERENCES pacientes(id) ON DELETE CASCADE,
  FOREIGN KEY (id_especialidad_sugerida) REFERENCES especialidades(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS mensajes_diagnostico_flash (
  id INT AUTO_INCREMENT PRIMARY KEY,
  id_diagnostico_flash INT NOT NULL,
  remitente ENUM('paciente', 'bot') NOT NULL,
  contenido TEXT NOT NULL,
  fecha_hora TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (id_diagnostico_flash) REFERENCES diagnosticos_flash(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS indicaciones_medicas (
  id INT AUTO_INCREMENT PRIMARY KEY,
  id_paciente INT NOT NULL,
  id_medico INT NOT NULL,
  id_cita INT NULL,
  descripcion VARCHAR(300) NOT NULL,
  fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (id_paciente) REFERENCES pacientes(id) ON DELETE CASCADE,
  FOREIGN KEY (id_medico) REFERENCES medicos(id),
  FOREIGN KEY (id_cita) REFERENCES citas(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seed obligatorio de especialidades (coinciden con backend/services/iaService.js)
INSERT IGNORE INTO especialidades (nombre) VALUES
  ('Cardiología'),
  ('Endocrinología'),
  ('Medicina Interna'),
  ('Neumología'),
  ('Nefrología');
