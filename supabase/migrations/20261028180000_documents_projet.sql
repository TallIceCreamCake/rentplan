-- Documents non financiers (bons de préparation et de livraison, feuilles de route, documents libres) :
-- lisibles par tous les comptes actifs ; les devis, contrats, factures et notes de crédit restent
-- réservés aux rôles ayant la visibilité des finances.
drop policy if exists lecture_documents on public.documents;
create policy lecture_documents on public.documents for select to authenticated
  using (
    (select public.is_active_user())
    and ((select public.can_see_finances()) or type not in ('devis', 'contrat', 'facture', 'avoir'))
  );
