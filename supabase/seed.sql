-- ════════════════════════════════════════════════════════════════════════════
-- Primer administrador (una sola vez, sin terminal)
--
-- 1. Supabase → Authentication → Users → Add user → Create new user
--    (correo + contraseña, marca "Auto Confirm User").
-- 2. Supabase → SQL Editor → New query: pega esto, cambia el correo y el
--    nombre, y dale Run.
--
-- Después, ese administrador crea los demás roles y usuarios desde
-- Configuración → Roles / Usuarios.
-- ════════════════════════════════════════════════════════════════════════════

update public.perfiles
set rol_id = (select id from public.roles where es_superadmin limit 1),
    nombre_completo = 'Tu Nombre',
    activo = true
where email = 'tu-correo@elogia.com.co';

-- Comprobación: debe mostrar una fila con rol = Administrador
select p.email, p.nombre_completo, r.nombre as rol, p.activo
from public.perfiles p
left join public.roles r on r.id = p.rol_id;
