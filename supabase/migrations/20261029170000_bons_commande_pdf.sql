-- Bon de commande en PDF : modèle de document, en-tête, texte et fond choisis pour chaque bon.
alter table public.purchase_orders
  add column if not exists template_id text,
  add column if not exists letterhead_id text,
  add column if not exists body text,
  add column if not exists show_background boolean;
notify pgrst, 'reload schema';
