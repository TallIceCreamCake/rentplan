-- Préparation et retour du matériel d'un projet.
-- bookings.details : préparation et retour par article (numéros de série cochés, état au retour, notes, auteur).
-- subprojects.logistics : étapes du sous-projet (préparation validée, départ, retour clôturé).
-- return_charges : frais constatés au retour (nettoyage, maintenance, remplacement, retard…), à facturer.
alter table public.bookings add column if not exists details jsonb not null default '{}'::jsonb;
alter table public.subprojects add column if not exists logistics jsonb not null default '{}'::jsonb;

create table if not exists public.return_charges (
  id text primary key,
  project_id text not null references public.projects (id) on delete cascade,
  subproject_id text not null references public.subprojects (id) on delete cascade,
  equipment_id text references public.equipment (id) on delete set null,
  kind text not null default 'autre',
  label text not null,
  quantity numeric not null default 1,
  price numeric not null default 0,
  note text,
  -- a_facturer · ajoute (aux coûts du projet) · facture (facture complémentaire) · offert
  status text not null default 'a_facturer',
  cost_id text references public.costs (id) on delete set null,
  invoice_id text references public.documents (id) on delete set null,
  created_by text,
  created_at timestamptz not null default now(),
  updated_by text
);
create index if not exists return_charges_subproject_idx on public.return_charges (subproject_id);

alter table public.return_charges enable row level security;
create policy lecture_return_charges on public.return_charges for select to authenticated using ((select public.is_active_user()));
create policy ajout_return_charges on public.return_charges for insert to authenticated with check ((select public.can_edit(array['entrepot', 'projets'])));
create policy modif_return_charges on public.return_charges for update to authenticated using ((select public.can_edit(array['entrepot', 'projets']))) with check ((select public.can_edit(array['entrepot', 'projets'])));
create policy suppr_return_charges on public.return_charges for delete to authenticated using ((select public.can_edit(array['entrepot', 'projets'])));
grant select, insert, update, delete on public.return_charges to authenticated;

create trigger return_charges_registre after insert or update or delete on public.return_charges for each row execute function public.log_change();
alter publication supabase_realtime add table public.return_charges;
