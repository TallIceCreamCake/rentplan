-- =====================================================================
-- RentPlan — sous-modules du menu (Équipements › Emplacements de stock,
-- Enregistrement horaire › Demandes de congé)
-- =====================================================================

-- Emplacements de stock archivables (sous-module « Emplacements de stock archivés »)
alter table public.stock_locations add column if not exists archived boolean not null default false;

-- Les emplacements de stock se gèrent depuis le module Équipements (et toujours depuis la configuration)
drop policy ajout_stock_locations on public.stock_locations;
drop policy modif_stock_locations on public.stock_locations;
drop policy suppr_stock_locations on public.stock_locations;
create policy ajout_stock_locations on public.stock_locations for insert to authenticated
  with check ((select public.can_edit(array['equipements', 'configuration'])));
create policy modif_stock_locations on public.stock_locations for update to authenticated
  using ((select public.can_edit(array['equipements', 'configuration'])))
  with check ((select public.can_edit(array['equipements', 'configuration'])));
create policy suppr_stock_locations on public.stock_locations for delete to authenticated
  using ((select public.can_edit(array['equipements', 'configuration'])));

-- Les demandes de congé se traitent aussi depuis l'enregistrement horaire
drop policy ajout_crew_availability on public.crew_availability;
drop policy modif_crew_availability on public.crew_availability;
drop policy suppr_crew_availability on public.crew_availability;
create policy ajout_crew_availability on public.crew_availability for insert to authenticated
  with check ((select public.can_edit(array['personnel', 'heures'])));
create policy modif_crew_availability on public.crew_availability for update to authenticated
  using ((select public.can_edit(array['personnel', 'heures'])))
  with check ((select public.can_edit(array['personnel', 'heures'])));
create policy suppr_crew_availability on public.crew_availability for delete to authenticated
  using ((select public.can_edit(array['personnel', 'heures'])));
