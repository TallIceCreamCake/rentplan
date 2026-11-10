-- Propositions (A, B, C… sans limite) : variantes d'un même contenu de projet, dont le client n'en retient qu'une.
-- proposal : { set, label, state: ouverte | retenue | ecartee, prevStatus } ; vide pour un sous-projet ordinaire.
alter table public.subprojects add column if not exists proposal jsonb;
notify pgrst, 'reload schema';
