-- Articles de vente : le stock est déduit quand un sous-projet passe à « Retourné » (matériel vendu parti)
-- et remis en stock s'il quitte ce statut. Exécuté par la base pour fonctionner quel que soit le rôle
-- de la personne qui change le statut.
create or replace function public.stock_vente_retour() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  sens integer;
begin
  if (old.status = 'retourne') = (new.status = 'retourne') then
    return new;
  end if;
  sens := case when new.status = 'retourne' then -1 else 1 end;
  update equipment e
     set stock = coalesce(e.stock, 0) + sens * q.qty
    from (
      select pe.equipment_id, sum(pe.quantity) as qty
        from planned_equipment pe
       where pe.subproject_id = new.id and not coalesce(pe.is_optional, false)
       group by pe.equipment_id
    ) q
   where e.id = q.equipment_id and e.kind = 'vente' and not coalesce(e.serialized, false);
  return new;
end
$$;

drop trigger if exists subprojects_stock_vente on public.subprojects;
create trigger subprojects_stock_vente
  after update of status on public.subprojects
  for each row execute function public.stock_vente_retour();
