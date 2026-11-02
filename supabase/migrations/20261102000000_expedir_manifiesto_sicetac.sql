-- ════════════════════════════════════════════════════════════════════════════
-- Portal Elogia — Despacho › Manifiesto › Expedir manifiesto SICETAC · 2026-11-02
--
-- Se aplica DESPUÉS de las migraciones anteriores (pegar en el SQL Editor).
--
-- "Manifiesto" deja de ser una funcionalidad y pasa a ser un submódulo con
-- "Expedir manifiesto SICETAC" dentro. Los roles que ya tenían acceso a
-- "Manifiesto" lo conservan sobre la funcionalidad nueva.
-- ════════════════════════════════════════════════════════════════════════════

insert into public.modulos (clave, padre, nombre, orden)
values ('despacho.manifiesto.expedir-sicetac', 'despacho.manifiesto', 'Expedir manifiesto SICETAC', 1)
on conflict (clave) do nothing;

update public.rol_permisos
set modulo_clave = 'despacho.manifiesto.expedir-sicetac'
where modulo_clave = 'despacho.manifiesto';
