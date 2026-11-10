-- Matériel perdu (entrepôt) : le stock des articles non sérialisés baisse quand des unités sont déclarées
-- perdues et remonte si la perte est annulée. La suppression d'un projet ne remet pas le matériel perdu en stock.
-- Les numéros de série perdus sont gérés par leur statut.
create or replace function public.stock_perdu() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  ecart numeric := coalesce(new.perdu, 0) - case when tg_op = 'UPDATE' then coalesce(old.perdu, 0) else 0 end;
begin
  if ecart <> 0 then
    update equipment
       set stock = coalesce(stock, 0) - ecart
     where id = new.equipment_id and kind <> 'vente' and type <> 'kit' and not coalesce(serialized, false);
  end if;
  return new;
end
$$;

drop trigger if exists bookings_stock_perdu on public.bookings;
create trigger bookings_stock_perdu
  after insert or update of perdu on public.bookings
  for each row execute function public.stock_perdu();
