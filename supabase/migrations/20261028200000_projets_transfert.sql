-- Projets de transfert (comme dans Rentman) : du matériel déplacé d'un emplacement de stock
-- (stock_location_id) vers un autre (transfer_to_id). Les projets existants restent « standard ».
alter table public.projects
  add column if not exists kind text not null default 'standard',
  add column if not exists transfer_to_id text references public.stock_locations (id) on delete set null;

comment on column public.projects.kind is 'standard ou transfert';
comment on column public.projects.transfer_to_id is 'Emplacement d''arrivée d''un projet de transfert';
