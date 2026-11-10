-- Créneaux d'une affectation : une même personne (ou un véhicule) planifiée sur plusieurs horaires et plusieurs jours
-- au sein d'une fonction, au lieu d'être affectée plusieurs fois. Vide : horaires propres ou de la fonction.
alter table public.assignments add column if not exists shifts jsonb not null default '[]'::jsonb;
notify pgrst, 'reload schema';
