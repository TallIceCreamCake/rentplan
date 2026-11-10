-- =====================================================================
-- RentPlan — comptes utilisateurs, rôles et droits d'accès
-- Les comptes reposent sur Supabase Auth (auth.users) ; chaque compte a un
-- profil (nom, rôle, membre du personnel lié, tableaux de bord, préférences).
-- Les données ne sont plus accessibles qu'aux comptes connectés et activés.
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------- Rôles utilisateur ----------
-- permissions = { "finances": bool, "manageUsers": bool, "modules": { "<module>": "aucun" | "lecture" | "modification" } }
create table public.user_roles (
  id text primary key,
  name text not null,
  permissions jsonb not null default '{}'::jsonb,
  is_system boolean not null default false,
  sort int not null default 0,
  created_at timestamptz not null default now()
);

insert into public.user_roles (id, name, is_system, sort, permissions) values
  ('poweruser', 'PowerUser', true, 0, '{"finances": true, "manageUsers": true, "modules": {
    "dashboard": "modification", "agenda": "modification", "entrepot": "modification", "projets": "modification",
    "planificateur": "modification", "penuries": "modification", "finances": "modification", "equipements": "modification",
    "contacts": "modification", "personnel": "modification", "vehicules": "modification", "taches": "modification",
    "heures": "modification", "maintenance": "modification", "statistiques": "modification", "demandes": "modification",
    "configuration": "modification"}}'),
  ('bureau', 'Bureau', false, 1, '{"finances": true, "manageUsers": false, "modules": {
    "dashboard": "modification", "agenda": "modification", "entrepot": "modification", "projets": "modification",
    "planificateur": "modification", "penuries": "modification", "finances": "modification", "equipements": "modification",
    "contacts": "modification", "personnel": "modification", "vehicules": "modification", "taches": "modification",
    "heures": "modification", "maintenance": "modification", "statistiques": "lecture", "demandes": "modification",
    "configuration": "lecture"}}'),
  ('entrepot', 'Entrepôt', false, 2, '{"finances": false, "manageUsers": false, "modules": {
    "dashboard": "modification", "agenda": "lecture", "entrepot": "modification", "projets": "lecture",
    "penuries": "lecture", "equipements": "modification", "contacts": "lecture", "vehicules": "lecture",
    "taches": "modification", "heures": "modification", "maintenance": "modification"}}'),
  ('freelance', 'Freelance', false, 3, '{"finances": false, "manageUsers": false, "modules": {
    "dashboard": "modification", "agenda": "lecture", "taches": "modification", "heures": "modification"}}'),
  ('defaut', 'Utilisateur par défaut', true, 4, '{"finances": false, "manageUsers": false, "modules": {
    "dashboard": "modification", "agenda": "lecture"}}');

-- ---------- Profils ----------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null default '',
  full_name text not null default '',
  role_id text not null default 'defaut' references public.user_roles (id),
  active boolean not null default false,
  crew_id text, -- membre du personnel lié (pas de clé étrangère : survit au rechargement de la démo)
  dashboards jsonb not null default '[]'::jsonb,
  preferences jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz
);

-- ---------- Fonctions d'autorisation (évaluées une fois par requête via « (select …) ») ----------
create or replace function public.my_permissions() returns jsonb
language sql stable security definer set search_path = public as $$
  select r.permissions
    from public.profiles p
    join public.user_roles r on r.id = p.role_id
   where p.id = auth.uid() and p.active
$$;

create or replace function public.is_active_user() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and active)
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((public.my_permissions() ->> 'manageUsers')::boolean, false)
$$;

create or replace function public.can_see_finances() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((public.my_permissions() ->> 'finances')::boolean, false)
$$;

-- Vrai si le rôle a le droit « modification » sur au moins un des modules
create or replace function public.can_edit(modules text[]) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(bool_or(public.my_permissions() -> 'modules' ->> m = 'modification'), false)
    from unnest(modules) m
$$;

-- Vrai si le rôle peut modifier au moins un module (consommation des compteurs de numérotation)
create or replace function public.can_edit_something() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from jsonb_each_text(coalesce(public.my_permissions() -> 'modules', '{}'::jsonb)) where value = 'modification'
  )
$$;

create or replace function public.my_crew_id() returns text
language sql stable security definer set search_path = public as $$
  select crew_id from public.profiles where id = auth.uid() and active
$$;

-- Écran de connexion : savoir s'il faut proposer la création du premier compte (administrateur)
create or replace function public.has_accounts() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles)
$$;

-- ---------- Création automatique du profil à l'inscription ----------
-- Le tout premier compte devient PowerUser actif ; les suivants attendent l'activation d'un administrateur.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  first_account boolean;
begin
  lock table public.profiles in share row exclusive mode;
  select not exists (select 1 from public.profiles) into first_account;
  insert into public.profiles (id, email, full_name, role_id, active)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(coalesce(new.email, ''), '@', 1)),
    case when first_account then 'poweruser' else 'defaut' end,
    first_account
  );
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Un utilisateur ne peut pas changer son propre rôle, son activation ni son membre du personnel.
-- (auth.uid() est vide pour les accès directs à la base : Studio, psql.)
create or replace function public.protect_profile() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    new.role_id := old.role_id;
    new.active := old.active;
    new.crew_id := old.crew_id;
  end if;
  new.id := old.id;
  new.email := old.email;
  new.created_at := old.created_at;
  return new;
end $$;

create trigger profiles_protect
  before update on public.profiles
  for each row execute function public.protect_profile();

-- Il doit toujours rester au moins un administrateur actif (sauf s'il n'y a plus aucun compte)
create or replace function public.ensure_admin_exists() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.profiles) and not exists (
    select 1
      from public.profiles p
      join public.user_roles r on r.id = p.role_id
     where p.active and coalesce((r.permissions ->> 'manageUsers')::boolean, false)
  ) then
    raise exception 'Il doit rester au moins un administrateur actif.';
  end if;
  return null;
end $$;

create trigger profiles_admin_guard
  after update or delete on public.profiles
  for each statement execute function public.ensure_admin_exists();

create trigger roles_admin_guard
  after update or delete on public.user_roles
  for each statement execute function public.ensure_admin_exists();

create or replace function public.protect_system_roles() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.is_system then
    raise exception 'Le rôle « % » ne peut pas être supprimé.', old.name;
  end if;
  return old;
end $$;

create trigger roles_protect_system
  before delete on public.user_roles
  for each row execute function public.protect_system_roles();

-- ---------- Actions réservées aux administrateurs ----------
create or replace function public.admin_set_password(target uuid, new_password text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public.is_admin() then
    raise exception 'Action réservée aux administrateurs.';
  end if;
  if length(coalesce(new_password, '')) < 6 then
    raise exception 'Le mot de passe doit contenir au moins 6 caractères.';
  end if;
  update auth.users
     set encrypted_password = extensions.crypt(new_password, extensions.gen_salt('bf')),
         updated_at = now()
   where id = target;
end $$;

create or replace function public.admin_delete_user(target uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Action réservée aux administrateurs.';
  end if;
  if target = auth.uid() then
    raise exception 'Vous ne pouvez pas supprimer votre propre compte.';
  end if;
  delete from auth.users where id = target;
end $$;

revoke execute on function public.admin_set_password(uuid, text) from public, anon;
revoke execute on function public.admin_delete_user(uuid) from public, anon;
grant execute on function public.admin_set_password(uuid, text) to authenticated;
grant execute on function public.admin_delete_user(uuid) to authenticated;
grant execute on function public.has_accounts() to anon, authenticated;

-- ---------- Profils et rôles : accès ----------
alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;

create policy profils_lecture on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select public.is_active_user()));
create policy profils_modif_soi on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy profils_modif_admin on public.profiles for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy roles_lecture on public.user_roles for select to authenticated using (true);
create policy roles_ajout on public.user_roles for insert to authenticated with check ((select public.is_admin()));
create policy roles_modif on public.user_roles for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy roles_suppr on public.user_roles for delete to authenticated using ((select public.is_admin()));

-- ---------- Données métier : lecture pour les comptes actifs, écriture selon le rôle ----------
do $$
declare
  rec record;
begin
  for rec in
    select * from (values
      ('categories', array['equipements']),
      ('stock_locations', array['configuration']),
      ('project_types', array['configuration']),
      ('default_functions', array['configuration']),
      ('default_costs', array['configuration']),
      ('contacts', array['contacts', 'demandes']),
      ('contact_persons', array['contacts']),
      ('crew_members', array['personnel']),
      ('crew_availability', array['personnel']),
      ('vehicles', array['vehicules']),
      ('equipment', array['equipements']),
      ('serials', array['equipements']),
      ('repairs', array['maintenance', 'equipements']),
      ('inspections', array['maintenance', 'equipements']),
      ('projects', array['projets', 'demandes']),
      ('subprojects', array['projets', 'demandes', 'entrepot']),
      ('periods', array['projets', 'demandes']),
      ('equipment_groups', array['projets', 'demandes']),
      ('planned_equipment', array['projets', 'demandes', 'penuries']),
      ('bookings', array['entrepot', 'projets']),
      ('function_groups', array['projets']),
      ('functions', array['projets', 'planificateur']),
      ('assignments', array['projets', 'planificateur']),
      ('costs', array['projets']),
      ('notes', array['projets', 'entrepot']),
      ('tasks', array['taches', 'projets']),
      ('documents', array['finances', 'projets']),
      ('subrents', array['penuries', 'projets']),
      ('purchase_orders', array['finances', 'projets', 'penuries']),
      ('time_entries', array['heures']),
      ('project_requests', array['demandes']),
      ('files', array['projets', 'equipements'])
    ) as t(name, modules)
  loop
    execute format('drop policy if exists %I on public.%I', 'acces_local_' || rec.name, rec.name);
    execute format('create policy %I on public.%I for select to authenticated using ((select public.is_active_user()))', 'lecture_' || rec.name, rec.name);
    execute format('create policy %I on public.%I for insert to authenticated with check ((select public.can_edit(%L::text[])))', 'ajout_' || rec.name, rec.name, rec.modules);
    execute format('create policy %I on public.%I for update to authenticated using ((select public.can_edit(%L::text[]))) with check ((select public.can_edit(%L::text[])))', 'modif_' || rec.name, rec.name, rec.modules, rec.modules);
    execute format('create policy %I on public.%I for delete to authenticated using ((select public.can_edit(%L::text[])))', 'suppr_' || rec.name, rec.name, rec.modules);
  end loop;
end $$;

-- Documents financiers : invisibles pour les rôles sans « visibilité des finances »
drop policy lecture_documents on public.documents;
create policy lecture_documents on public.documents for select to authenticated
  using ((select public.is_active_user()) and (select public.can_see_finances()));
drop policy lecture_purchase_orders on public.purchase_orders;
create policy lecture_purchase_orders on public.purchase_orders for select to authenticated
  using ((select public.is_active_user()) and (select public.can_see_finances()));

-- Un membre du personnel peut répondre à ses propres invitations, sans autre modification
create policy invitation_assignments on public.assignments for update to authenticated
  using (crew_id = (select public.my_crew_id())) with check (crew_id = (select public.my_crew_id()));

create or replace function public.protect_invitation() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.can_edit(array['projets', 'planificateur'])
     and (to_jsonb(new) - 'invitation' - 'updated_by') is distinct from (to_jsonb(old) - 'invitation' - 'updated_by') then
    raise exception 'Seule la réponse à l''invitation peut être modifiée.';
  end if;
  return new;
end $$;

create trigger assignments_invitation
  before update on public.assignments
  for each row execute function public.protect_invitation();

-- ---------- Paramètres : la configuration est réservée, les compteurs de numérotation restent utilisables ----------
drop policy acces_local_app_settings on public.app_settings;
create policy lecture_app_settings on public.app_settings for select to authenticated using ((select public.is_active_user()));
create policy ajout_app_settings on public.app_settings for insert to authenticated with check ((select public.can_edit(array['configuration'])));
create policy modif_app_settings on public.app_settings for update to authenticated
  using ((select public.can_edit_something())) with check ((select public.can_edit_something()));
create policy suppr_app_settings on public.app_settings for delete to authenticated using ((select public.can_edit(array['configuration'])));

create or replace function public.protect_settings() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  counters text[];
begin
  if auth.uid() is null or public.can_edit(array['configuration']) then
    return new;
  end if;
  select coalesce(array_agg(k), '{}') into counters
    from (select jsonb_object_keys(new.data) as k union select jsonb_object_keys(old.data)) s
   where k like 'next%';
  if (new.data - counters) is distinct from (old.data - counters) then
    raise exception 'Seuls les rôles ayant accès à la configuration peuvent la modifier.';
  end if;
  return new;
end $$;

create trigger app_settings_protect
  before update on public.app_settings
  for each row execute function public.protect_settings();

-- ---------- Registre : lecture pour tous, purge avec la configuration ; auteur = compte connecté ----------
drop policy acces_local_audit_log on public.audit_log;
create policy lecture_audit_log on public.audit_log for select to authenticated using ((select public.is_active_user()));
create policy suppr_audit_log on public.audit_log for delete to authenticated using ((select public.can_edit(array['configuration'])));

create or replace function public.log_change() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  rec jsonb;
  diff jsonb;
  who text;
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
  -- L'auteur est le compte connecté (repli : valeur envoyée par l'application)
  select nullif(full_name, '') into who from public.profiles where id = auth.uid();
  insert into public.audit_log (table_name, row_id, project_id, action, author, label, changes)
  values (
    tg_table_name,
    rec->>'id',
    coalesce(rec->>'project_id', case when tg_table_name = 'projects' then rec->>'id' end),
    lower(tg_op),
    coalesce(who, rec->>'updated_by'),
    coalesce(rec->>'name', rec->>'title', rec->>'number'),
    diff
  );
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

-- ---------- Fichiers joints : réservés aux comptes actifs ----------
drop policy "fichiers_acces_local" on storage.objects;
create policy fichiers_lecture on storage.objects for select to authenticated using (bucket_id = 'fichiers');
create policy fichiers_ajout on storage.objects for insert to authenticated
  with check (bucket_id = 'fichiers' and (select public.is_active_user()));
create policy fichiers_suppr on storage.objects for delete to authenticated
  using (bucket_id = 'fichiers' and (select public.is_active_user()));

-- ---------- Droits : plus aucun accès anonyme aux données ----------
revoke all on all tables in schema public from anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

alter publication supabase_realtime add table public.profiles, public.user_roles;
