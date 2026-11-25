const db = require('../config/database');
const { crearAlertaInterna } = require('../controllers/alertasController');

function formatearFecha(fecha) {
  if (!(fecha instanceof Date)) return String(fecha).slice(0, 10);
  const y = fecha.getFullYear();
  const m = String(fecha.getMonth() + 1).padStart(2, '0');
  const d = String(fecha.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

async function revisarRecetasPorVencer() {
  try {
    const [medicamentos] = await db.query(
      `SELECT id, id_paciente, id_medico, nombre, dosis, fecha_fin
       FROM medicamentos
       WHERE fecha_fin IS NOT NULL
         AND fecha_fin BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 3 DAY)
         AND alerta_vencimiento_enviada = 0`
    );

    let alertasCreadas = 0;

    for (const medicamento of medicamentos) {
      const descripcion = `La receta de ${medicamento.nombre} (${medicamento.dosis}) vence el ${formatearFecha(medicamento.fecha_fin)}`;

      await crearAlertaInterna(
        medicamento.id_paciente,
        medicamento.id_medico,
        'receta_por_vencer',
        'media',
        descripcion
      );

      await db.query(
        'UPDATE medicamentos SET alerta_vencimiento_enviada = 1 WHERE id = ?',
        [medicamento.id]
      );

      alertasCreadas += 1;
    }

    console.log(`revisarRecetasPorVencer: se crearon ${alertasCreadas} alerta(s) de receta por vencer.`);
  } catch (error) {
    console.error('Error en el job revisarRecetasPorVencer:', error);
  }
}

module.exports = { revisarRecetasPorVencer };
