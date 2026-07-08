-- ─────────────────────────────────────────────────────────────────────────────
-- Medios de pago editables (pestaña "Pagos").
-- Correr UNA vez en Supabase → SQL Editor. Mismo patrón que entregas_zonas.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.entregas_medios_pago (
  id         bigint generated always as identity primary key,
  nombre     text    not null,
  orden      integer not null default 0,
  activo     boolean not null default true,
  created_at timestamptz not null default now()
);

-- Semilla con los medios genéricos que ya existían en el formulario.
insert into public.entregas_medios_pago (nombre, orden)
select v.nombre, v.orden
from (values
  ('Efectivo', 0),
  ('Transferencia', 1),
  ('Tarjeta', 2),
  ('MercadoPago', 3),
  ('Otro', 4)
) as v(nombre, orden)
where not exists (select 1 from public.entregas_medios_pago);

-- Realtime (opcional, para que se actualice sola en otras pantallas).
alter publication supabase_realtime add table public.entregas_medios_pago;

-- ── RLS: mismo criterio que el resto de las tablas del dominio Reparto ──
alter table public.entregas_medios_pago enable row level security;

-- Usuarios logueados (staff) pueden leer y administrar los medios de pago.
drop policy if exists "medios_pago_select" on public.entregas_medios_pago;
create policy "medios_pago_select" on public.entregas_medios_pago
  for select to authenticated using (true);

drop policy if exists "medios_pago_write" on public.entregas_medios_pago;
create policy "medios_pago_write" on public.entregas_medios_pago
  for all to authenticated using (true) with check (true);
