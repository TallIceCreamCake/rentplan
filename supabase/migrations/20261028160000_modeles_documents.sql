-- Modèles de documents : chaque devis / facture retient son modèle, son en-tête (papier à en-tête),
-- le texte saisi à la génération, le sujet et le nom de fichier, l'affichage du fond, la signature
-- numérique du client et le contenu figé (matériel, fonctions, coûts…) lu par les modules du modèle.
alter table public.documents
  add column if not exists template_id text,
  add column if not exists letterhead_id text,
  add column if not exists body text,
  add column if not exists subject text,
  add column if not exists file_name text,
  add column if not exists show_background boolean,
  add column if not exists signature jsonb,
  add column if not exists content jsonb;

comment on column public.documents.template_id is 'Modèle de document (réglages documentTemplates ou modèle système sys_*)';
comment on column public.documents.letterhead_id is 'En-tête de documents (réglages letterheads)';
comment on column public.documents.body is 'Texte du document (HTML, variables {$…} comprises)';
comment on column public.documents.show_background is 'Afficher le fond de l''en-tête (null = oui)';
comment on column public.documents.signature is 'Signature numérique : nom, e-mail, commentaire, image, date';
comment on column public.documents.content is 'Contenu figé à la génération, lu par les modules du modèle';
