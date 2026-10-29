-- Staging cleanup only; preserve any inventory or opening history.
begin;
lock table tcg_private.pack_catalog,tcg_private.card_inventory,tcg_private.pack_receipts in access exclusive mode;
do $$begin
  if exists(select 1 from tcg_private.card_inventory) or exists(select 1 from tcg_private.pack_receipts) then
    raise exception 'Refusing pack rollback: durable rows exist';
  end if;
end$$;
drop function tcg_private.open_pack(uuid,uuid,jsonb);
drop table tcg_private.pack_receipts;
drop table tcg_private.card_inventory;
drop table tcg_private.pack_catalog;
commit;
