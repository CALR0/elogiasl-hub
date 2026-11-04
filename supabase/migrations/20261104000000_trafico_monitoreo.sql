-- ════════════════════════════════════════════════════════════════════════════
-- Portal Elogia — Despacho › Tráfico › Monitoreo vehículo · 2026-11-04
--
-- Nuevo submódulo "Tráfico" dentro de Despacho, con la funcionalidad
-- "Monitoreo vehículo" (migrada de TVIEWER · Control T). Consulta posición
-- y viajes por placa o manifiesto en Control T.
-- ════════════════════════════════════════════════════════════════════════════

insert into public.modulos (clave, padre, nombre, orden) values
  ('despacho.trafico',                   'despacho',          'Tráfico',           3),
  ('despacho.trafico.monitoreo-vehiculo','despacho.trafico',  'Monitoreo vehículo', 1)
on conflict (clave) do nothing;
