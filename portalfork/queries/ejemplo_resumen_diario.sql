-- Ejemplo: reemplaza por tus queries reales. Regla: agregados, sin datos
-- personales identificables en el CSV exportado.
SELECT
  CURRENT_DATE() AS fecha,
  COUNT(*) AS total_registros
FROM `mi-proyecto.mi_dataset.mi_tabla`
WHERE DATE(created_at) = DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY)
