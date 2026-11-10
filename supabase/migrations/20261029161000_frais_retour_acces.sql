-- Comme les autres tables : aucun accès sans connexion aux frais de retour.
revoke all on public.return_charges from anon;
notify pgrst, 'reload schema';
