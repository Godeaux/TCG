-- Staging cleanup ONLY. Refuse if any economy/seat/result history exists.
begin;
lock table tcg_private.match_seats,tcg_private.reward_results,
 tcg_private.economy_accounts,tcg_private.reward_receipts in access exclusive mode;
do $$begin
  if exists(select 1 from tcg_private.match_seats)
    or exists(select 1 from tcg_private.reward_results)
    or exists(select 1 from tcg_private.economy_accounts)
    or exists(select 1 from tcg_private.reward_receipts) then
    raise exception 'Refusing reward rollback: durable rows exist';
  end if;
end$$;
drop function tcg_private.settle_reward(uuid,uuid);
drop table tcg_private.reward_receipts;
drop table tcg_private.economy_accounts;
drop table tcg_private.reward_results;
drop table tcg_private.match_seats;
commit;
