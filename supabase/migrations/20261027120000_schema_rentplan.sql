-- RentPlan : schéma de données (modèle calqué sur Rentman)
-- Les identifiants sont des textes générés côté client, les horaires des timestamp « heure locale ».

create table public.app_settings (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- ---------- Configuration ----------
create table public.categories (
  id text primary key,
  name text not null,
  color text,
  parent_id text references public.categories (id) on delete set null,
  sort int not null default 0
);

create table public.stock_locations (
  id text primary key,
  name text not null,
  address text,
  kind text not null default 'entrepot',
  is_default boolean not null default false
);

create table public.project_types (
  id text primary key,
  name text not null,
  color text
);

create table public.default_functions (
  id text primary key,
  kind text not null default 'equipe',
  name text not null,
  internal_name text,
  price numeric not null default 0,
  price_type text not null default 'heure',
  cost numeric not null default 0,
  cost_type text not null default 'heure',
  break_minutes int not null default 0,
  tags text[] not null default '{}'
);

create table public.default_costs (
  id text primary key,
  name text not null,
  quantity numeric not null default 1,
  price numeric not null default 0,
  cost numeric not null default 0
);

-- ---------- Contacts, personnel, véhicules ----------
create table public.contacts (
  id text primary key,
  type text not null default 'client',
  is_company boolean not null default true,
  company text,
  first_name text,
  last_name text,
  email text,
  phone text,
  website text,
  address text,
  zip text,
  city text,
  country text,
  vat_number text,
  discount_equipment numeric not null default 0,
  discount_crew numeric not null default 0,
  payment_term_days int,
  notes text,
  tags text[] not null default '{}',
  created_at timestamptz not null default now()
);

create table public.contact_persons (
  id text primary key,
  contact_id text not null references public.contacts (id) on delete cascade,
  first_name text,
  last_name text,
  email text,
  phone text,
  role text
);

create table public.crew_members (
  id text primary key,
  first_name text,
  last_name text,
  email text,
  phone text,
  functions text[] not null default '{}',
  day_rate numeric not null default 0,
  hour_rate numeric not null default 0,
  cost_rate numeric not null default 0,
  color text,
  notes text,
  tags text[] not null default '{}',
  active boolean not null default true,
  city text
);

create table public.crew_availability (
  id text primary key,
  crew_id text not null references public.crew_members (id) on delete cascade,
  kind text not null default 'indisponible',
  starts_at timestamp not null,
  ends_at timestamp not null,
  title text,
  status text not null default 'approuve',
  note text
);

create table public.vehicles (
  id text primary key,
  name text not null,
  plate text,
  type text,
  capacity_kg numeric not null default 0,
  volume numeric not null default 0,
  seats int not null default 2,
  day_rate numeric not null default 0,
  cost_per_km numeric not null default 0,
  notes text,
  tags text[] not null default '{}'
);

-- ---------- Équipements ----------
create table public.equipment (
  id text primary key,
  code text,
  name text not null,
  category_id text references public.categories (id) on delete set null,
  kind text not null default 'location',
  type text not null default 'article',
  stock numeric not null default 0,
  serialized boolean not null default false,
  rental_price numeric not null default 0,
  subrental_cost numeric not null default 0,
  purchase_price numeric not null default 0,
  weight numeric not null default 0,
  volume numeric not null default 0,
  power numeric not null default 0,
  current numeric not null default 0,
  location text,
  default_group text,
  display_in_planner boolean not null default true,
  tags text[] not null default '{}',
  internal_remark text,
  external_remark text,
  image_url text,
  contents jsonb not null default '[]'::jsonb,
  accessories jsonb not null default '[]'::jsonb,
  alternatives text[] not null default '{}',
  supplier_ids text[] not null default '{}',
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.serials (
  id text primary key,
  equipment_id text not null references public.equipment (id) on delete cascade,
  serial text not null,
  internal_ref text,
  stock_location_id text references public.stock_locations (id) on delete set null,
  status text not null default 'ok',
  notes text,
  purchase_date date
);

create table public.repairs (
  id text primary key,
  number text,
  equipment_id text references public.equipment (id) on delete cascade,
  serial_id text references public.serials (id) on delete set null,
  quantity int not null default 1,
  title text,
  description text,
  status text not null default 'en_cours',
  starts_at timestamp,
  ends_at timestamp,
  unavailable boolean not null default true,
  cost numeric not null default 0,
  reporter text,
  repairer text,
  project_id text,
  created_at timestamptz not null default now()
);

create table public.inspections (
  id text primary key,
  equipment_id text references public.equipment (id) on delete cascade,
  serial_id text references public.serials (id) on delete set null,
  name text,
  interval_months int not null default 12,
  last_date date,
  next_date date,
  result text not null default 'a_faire',
  notes text
);

-- ---------- Projets ----------
create table public.projects (
  id text primary key,
  number text,
  name text not null,
  type_id text references public.project_types (id) on delete set null,
  client_id text references public.contacts (id) on delete set null,
  contact_person_id text references public.contact_persons (id) on delete set null,
  venue_id text references public.contacts (id) on delete set null,
  account_manager text,
  color text,
  external_ref text,
  stock_location_id text references public.stock_locations (id) on delete set null,
  notes text,
  external_notes text,
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_by text
);

create table public.subprojects (
  id text primary key,
  project_id text not null references public.projects (id) on delete cascade,
  name text,
  sort int not null default 0,
  status text not null default 'concept',
  discounts jsonb not null default '{}'::jsonb,
  discount_total numeric not null default 0,
  locked_total numeric,
  insurance_pct numeric not null default 0,
  deposit numeric not null default 0,
  deposit_status text not null default 'aucune',
  additional_conditions text,
  updated_by text
);

create table public.periods (
  id text primary key,
  project_id text not null references public.projects (id) on delete cascade,
  subproject_id text references public.subprojects (id) on delete cascade,
  name text not null,
  starts_at timestamp not null,
  ends_at timestamp not null,
  is_planning boolean not null default false,
  is_usage boolean not null default false,
  show_internal boolean not null default true,
  show_external boolean not null default true,
  sort int not null default 0,
  updated_by text
);

create table public.equipment_groups (
  id text primary key,
  project_id text not null references public.projects (id) on delete cascade,
  subproject_id text not null references public.subprojects (id) on delete cascade,
  name text not null,
  sort int not null default 0,
  planning_period_id text references public.periods (id) on delete set null,
  usage_period_id text references public.periods (id) on delete set null,
  plan_start timestamp,
  plan_end timestamp,
  use_start timestamp,
  use_end timestamp,
  remark text,
  updated_by text
);

create table public.planned_equipment (
  id text primary key,
  project_id text not null references public.projects (id) on delete cascade,
  subproject_id text not null references public.subprojects (id) on delete cascade,
  group_id text not null references public.equipment_groups (id) on delete cascade,
  equipment_id text references public.equipment (id) on delete set null,
  parent_id text,
  relation text not null default 'principal',
  name text,
  quantity numeric not null default 1,
  price numeric,
  discount numeric not null default 0,
  is_optional boolean not null default false,
  reserved_qty numeric not null default 0,
  serial_ids text[] not null default '{}',
  sort int not null default 0,
  remark text,
  updated_by text
);

-- Statut d'entrepôt du matériel d'un sous-projet (quantités Prêt / Sur site / Retourné / Perdu)
create table public.bookings (
  id text primary key,
  project_id text not null references public.projects (id) on delete cascade,
  subproject_id text not null references public.subprojects (id) on delete cascade,
  equipment_id text not null references public.equipment (id) on delete cascade,
  pret numeric not null default 0,
  sur_site numeric not null default 0,
  retourne numeric not null default 0,
  perdu numeric not null default 0,
  updated_by text
);

create table public.function_groups (
  id text primary key,
  project_id text not null references public.projects (id) on delete cascade,
  subproject_id text not null references public.subprojects (id) on delete cascade,
  name text not null,
  sort int not null default 0,
  planning_period_id text references public.periods (id) on delete set null,
  usage_period_id text references public.periods (id) on delete set null,
  updated_by text
);

create table public.functions (
  id text primary key,
  project_id text not null references public.projects (id) on delete cascade,
  subproject_id text not null references public.subprojects (id) on delete cascade,
  group_id text references public.function_groups (id) on delete set null,
  kind text not null default 'equipe',
  name text not null,
  internal_name text,
  quantity int not null default 1,
  planning_period_id text references public.periods (id) on delete set null,
  usage_period_id text references public.periods (id) on delete set null,
  plan_start timestamp,
  plan_end timestamp,
  use_start timestamp,
  use_end timestamp,
  break_minutes int not null default 0,
  price_type text not null default 'heure',
  price numeric not null default 0,
  cost_type text not null default 'heure',
  cost numeric not null default 0,
  distance_km numeric not null default 0,
  travel_minutes int not null default 0,
  tags text[] not null default '{}',
  remark text,
  sort int not null default 0,
  updated_by text
);

create table public.assignments (
  id text primary key,
  project_id text not null references public.projects (id) on delete cascade,
  subproject_id text not null references public.subprojects (id) on delete cascade,
  function_id text not null references public.functions (id) on delete cascade,
  crew_id text references public.crew_members (id) on delete cascade,
  vehicle_id text references public.vehicles (id) on delete cascade,
  plan_start timestamp,
  plan_end timestamp,
  rate numeric,
  visible boolean not null default true,
  invitation text not null default 'aucune',
  remark text,
  updated_by text
);

create table public.costs (
  id text primary key,
  project_id text not null references public.projects (id) on delete cascade,
  subproject_id text not null references public.subprojects (id) on delete cascade,
  name text not null,
  quantity numeric not null default 1,
  price numeric not null default 0,
  cost numeric not null default 0,
  discount numeric not null default 0,
  remark text,
  sort int not null default 0,
  updated_by text
);

create table public.notes (
  id text primary key,
  project_id text references public.projects (id) on delete cascade,
  subproject_id text references public.subprojects (id) on delete cascade,
  scope text not null default 'interne',
  text text not null,
  author text,
  created_at timestamptz not null default now()
);

create table public.tasks (
  id text primary key,
  project_id text references public.projects (id) on delete cascade,
  title text not null,
  details text,
  status text not null default 'a_faire',
  priority text not null default 'normale',
  deadline timestamp,
  assignees text[] not null default '{}',
  time_budget_min int not null default 0,
  tracked_min int not null default 0,
  subtasks jsonb not null default '[]'::jsonb,
  tags text[] not null default '{}',
  color text,
  sort int not null default 0,
  created_by text,
  created_at timestamptz not null default now(),
  updated_by text
);

create table public.documents (
  id text primary key,
  type text not null,
  number text,
  version int not null default 1,
  project_id text references public.projects (id) on delete set null,
  client_id text references public.contacts (id) on delete set null,
  subproject_ids text[] not null default '{}',
  date date,
  due_date date,
  status text not null default 'brouillon',
  days int,
  sections jsonb not null default '[]'::jsonb,
  totals jsonb not null default '{}'::jsonb,
  notes text,
  partial_pct numeric,
  extra_lines jsonb not null default '[]'::jsonb,
  payments jsonb not null default '[]'::jsonb,
  from_quote text,
  signed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_by text
);

create table public.subrents (
  id text primary key,
  number text,
  supplier_id text references public.contacts (id) on delete set null,
  project_id text references public.projects (id) on delete set null,
  status text not null default 'demande',
  starts_at timestamp,
  ends_at timestamp,
  lines jsonb not null default '[]'::jsonb,
  cost numeric not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_by text
);

create table public.purchase_orders (
  id text primary key,
  number text,
  supplier_id text references public.contacts (id) on delete set null,
  project_id text references public.projects (id) on delete set null,
  subrent_id text references public.subrents (id) on delete set null,
  date date,
  status text not null default 'brouillon',
  lines jsonb not null default '[]'::jsonb,
  total numeric not null default 0,
  notes text,
  updated_by text
);

create table public.time_entries (
  id text primary key,
  crew_id text not null references public.crew_members (id) on delete cascade,
  project_id text references public.projects (id) on delete set null,
  function_id text references public.functions (id) on delete set null,
  kind text not null default 'travail',
  starts_at timestamp not null,
  ends_at timestamp not null,
  break_minutes int not null default 0,
  travel_minutes int not null default 0,
  activity text,
  status text not null default 'soumis',
  notes text,
  created_at timestamptz not null default now()
);

create table public.project_requests (
  id text primary key,
  received_at timestamptz not null default now(),
  contact_name text,
  company text,
  email text,
  phone text,
  event_name text,
  starts_at timestamp,
  ends_at timestamp,
  venue text,
  message text,
  items jsonb not null default '[]'::jsonb,
  status text not null default 'nouvelle',
  project_id text references public.projects (id) on delete set null
);

create table public.files (
  id text primary key,
  project_id text references public.projects (id) on delete cascade,
  equipment_id text references public.equipment (id) on delete cascade,
  name text not null,
  path text not null,
  size bigint,
  mime text,
  author text,
  created_at timestamptz not null default now()
);

-- Index sur les clés de jointure les plus utilisées
create index on public.subprojects (project_id);
create index on public.periods (project_id);
create index on public.equipment_groups (subproject_id);
create index on public.planned_equipment (subproject_id);
create index on public.planned_equipment (equipment_id);
create index on public.functions (subproject_id);
create index on public.assignments (function_id);
create index on public.serials (equipment_id);

-- ---------- Registre (historique des modifications) ----------
create table public.audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  table_name text not null,
  row_id text,
  project_id text,
  action text not null,
  author text,
  label text,
  changes jsonb
);
create index on public.audit_log (project_id, at desc);

create or replace function public.log_change() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  rec jsonb;
  diff jsonb;
begin
  rec := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  -- Les données de démonstration ne polluent pas le registre
  if rec->>'updated_by' = 'Import' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_op = 'UPDATE' then
    select jsonb_object_agg(n.key, jsonb_build_object('old', o.value, 'new', n.value))
      into diff
      from jsonb_each(rec) n
      join jsonb_each(to_jsonb(old)) o on o.key = n.key
     where n.value is distinct from o.value
       and n.key not in ('updated_by', 'updated_at');
    if diff is null then
      return new;
    end if;
  else
    diff := rec - 'updated_by';
  end if;
  insert into public.audit_log (table_name, row_id, project_id, action, author, label, changes)
  values (
    tg_table_name,
    rec->>'id',
    coalesce(rec->>'project_id', case when tg_table_name = 'projects' then rec->>'id' end),
    lower(tg_op),
    rec->>'updated_by',
    coalesce(rec->>'name', rec->>'title', rec->>'number'),
    diff
  );
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'projects', 'subprojects', 'periods', 'equipment_groups', 'planned_equipment', 'bookings',
    'function_groups', 'functions', 'assignments', 'costs', 'documents', 'tasks', 'subrents', 'purchase_orders'
  ] loop
    execute format(
      'create trigger %I after insert or update or delete on public.%I for each row execute function public.log_change()',
      t || '_registre', t
    );
  end loop;
end $$;

-- ---------- Accès (environnement local : accès complet pour anon et authenticated) ----------
do $$
declare
  t text;
begin
  foreach t in array array[
    'app_settings', 'categories', 'stock_locations', 'project_types', 'default_functions', 'default_costs',
    'contacts', 'contact_persons', 'crew_members', 'crew_availability', 'vehicles', 'equipment', 'serials',
    'repairs', 'inspections', 'projects', 'subprojects', 'periods', 'equipment_groups', 'planned_equipment',
    'bookings', 'function_groups', 'functions', 'assignments', 'costs', 'notes', 'tasks', 'documents',
    'subrents', 'purchase_orders', 'time_entries', 'project_requests', 'files', 'audit_log'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for all to anon, authenticated using (true) with check (true)', 'acces_local_' || t, t);
    execute format('alter publication supabase_realtime add table public.%I', t);
  end loop;
end $$;

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to anon, authenticated;
grant usage, select on all sequences in schema public to anon, authenticated;

-- ---------- Stockage des fichiers joints ----------
insert into storage.buckets (id, name, public)
values ('fichiers', 'fichiers', true)
on conflict (id) do nothing;

create policy "fichiers_acces_local" on storage.objects
  for all to anon, authenticated
  using (bucket_id = 'fichiers')
  with check (bucket_id = 'fichiers');
