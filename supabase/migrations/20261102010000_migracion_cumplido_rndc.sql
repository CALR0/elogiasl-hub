-- ════════════════════════════════════════════════════════════════════════════
-- Portal Elogia — Despacho › Cumplido manifiesto › Migración cumplido RNDC · 2026-11-02
--
-- Se aplica DESPUÉS de las migraciones anteriores (pegar en el SQL Editor).
--
-- "Cumplido manifiesto" deja de ser una funcionalidad y pasa a ser un
-- submódulo con "Migración cumplido RNDC" dentro. Los roles que ya tenían
-- acceso a "Cumplido manifiesto" lo conservan sobre la funcionalidad nueva.
-- ════════════════════════════════════════════════════════════════════════════

insert into public.modulos (clave, padre, nombre, orden)
values ('despacho.cumplido-manifiesto.migracion-rndc', 'despacho.cumplido-manifiesto', 'Migración cumplido RNDC', 1)
on conflict (clave) do nothing;

update public.rol_permisos
set modulo_clave = 'despacho.cumplido-manifiesto.migracion-rndc'
where modulo_clave = 'despacho.cumplido-manifiesto';
