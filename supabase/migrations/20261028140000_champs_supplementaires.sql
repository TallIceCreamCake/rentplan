-- =====================================================================
-- RentPlan — Configuration › Champs de saisie supplémentaires
-- Valeurs des champs définis par l'utilisateur, par projet, équipement et contact
-- =====================================================================
alter table public.projects add column if not exists custom_fields jsonb not null default '{}'::jsonb;
alter table public.equipment add column if not exists custom_fields jsonb not null default '{}'::jsonb;
alter table public.contacts add column if not exists custom_fields jsonb not null default '{}'::jsonb;
