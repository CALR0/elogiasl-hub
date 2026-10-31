-- ════════════════════════════════════════════════════════════════════════════
-- Portal Elogia — Sesión de la cuenta de servicio de Silogtran · 2026-10-31
--
-- Se aplica DESPUÉS de las migraciones anteriores (pegar en el SQL Editor).
--
-- Las funcionalidades que leen Silogtran (p. ej. Generar ficha técnica) usan
-- UNA cuenta de servicio (SILOG_USUARIO / SILOG_CLAVE en el servidor). En
-- Vercel no hay memoria entre peticiones, así que la sesión de Silogtran
-- (cookies + token de AWS WAF) se guarda aquí, CIFRADA por el servidor, para
-- reutilizarla y no iniciar sesión ni abrir el navegador del WAF cada vez.
--
-- Protección de la cuenta compartida (para que Silogtran no la bloquee):
-- un solo inicio de sesión a la vez, pausa creciente tras fallos y topes de
-- inicios por hora y por día. Todo se decide aquí, de forma atómica.
--
-- Solo el servidor (secret key / service_role) puede leer o escribir: sin
-- políticas RLS para usuarios y sin permisos de ejecución para ellos.
-- ════════════════════════════════════════════════════════════════════════════

create table public.silogtran_sesion (
  id                    smallint primary key default 1 check (id = 1),
  cookies               text,          -- sellado AES-256-GCM por el servidor (nunca en claro)
  actualizado_at        timestamptz,
  login_en_curso_hasta  timestamptz,   -- "candado" del inicio de sesión entre instancias
  fallos_seguidos       int not null default 0,
  pausa_hasta           timestamptz,   -- no intentar iniciar sesión antes de esta hora
  ultimo_error          text,
  logins                timestamptz[] not null default '{}'  -- intentos de las últimas 24 h
);

insert into public.silogtran_sesion (id) values (1);

alter table public.silogtran_sesion enable row level security;
revoke all on public.silogtran_sesion from anon, authenticated;

/**
 * Pide permiso para iniciar sesión en Silogtran. Devuelve:
 *   'ok'       → adelante (queda reservado p_duracion_seg segundos)
 *   'en_curso' → otra instancia está iniciando sesión ahora; esperar y releer
 *   'pausa'    → en pausa por fallos o por topes (ver pausa_hasta / ultimo_error)
 */
create function public.silog_reservar_login(
  p_max_hora int,
  p_max_dia int,
  p_duracion_seg int default 120
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.silogtran_sesion;
  v_recientes timestamptz[];
begin
  select * into r from public.silogtran_sesion where id = 1 for update;

  if r.pausa_hasta is not null and r.pausa_hasta > now() then
    return 'pausa';
  end if;
  if r.login_en_curso_hasta is not null and r.login_en_curso_hasta > now() then
    return 'en_curso';
  end if;

  v_recientes := array(select t from unnest(r.logins) t where t > now() - interval '24 hours');

  if (select count(*) from unnest(v_recientes) t where t > now() - interval '1 hour') >= p_max_hora
     or cardinality(v_recientes) >= p_max_dia then
    update public.silogtran_sesion
    set pausa_hasta = now() + interval '30 minutes',
        ultimo_error = 'Demasiados inicios de sesión seguidos: posible uso simultáneo de la cuenta de servicio.',
        logins = v_recientes
    where id = 1;
    return 'pausa';
  end if;

  update public.silogtran_sesion
  set login_en_curso_hasta = now() + make_interval(secs => p_duracion_seg),
      logins = array_append(v_recientes, now())
  where id = 1;
  return 'ok';
end;
$$;

/**
 * Cierra un intento de inicio de sesión. Si salió bien guarda las cookies y
 * limpia los fallos; si no, suma un fallo y pausa p_pausa_min minutos.
 */
create function public.silog_terminar_login(
  p_ok boolean,
  p_cookies text,
  p_error text,
  p_pausa_min int
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_ok then
    update public.silogtran_sesion
    set cookies = p_cookies, actualizado_at = now(), login_en_curso_hasta = null,
        fallos_seguidos = 0, pausa_hasta = null, ultimo_error = null
    where id = 1;
  else
    update public.silogtran_sesion
    set login_en_curso_hasta = null,
        fallos_seguidos = fallos_seguidos + 1,
        pausa_hasta = now() + make_interval(mins => greatest(p_pausa_min, 1)),
        ultimo_error = left(p_error, 500)
    where id = 1;
  end if;
end;
$$;

revoke all on function public.silog_reservar_login(int, int, int) from public, anon, authenticated;
revoke all on function public.silog_terminar_login(boolean, text, text, int) from public, anon, authenticated;
grant execute on function public.silog_reservar_login(int, int, int) to service_role;
grant execute on function public.silog_terminar_login(boolean, text, text, int) to service_role;
grant select, update on public.silogtran_sesion to service_role;
