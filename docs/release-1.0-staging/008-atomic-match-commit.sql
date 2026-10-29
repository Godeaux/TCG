-- Trusted-reducer persistence boundary, NOT a browser gameplay endpoint.
-- The caller must authenticate the action and compute legal next state/projections.
-- Initial checkpoint/seat creation remains service-owned; no existing client cutover.
begin;
alter table tcg_private.match_checkpoints add column finished boolean not null default false;
alter table tcg_private.accepted_actions add column request_hash bytea;

create function tcg_private.commit_match_action(
  p_match uuid, p_action_id uuid, p_actor uuid, p_expected_revision bigint,
  p_action jsonb, p_canonical jsonb, p_seat_zero jsonb, p_seat_one jsonb,
  p_finished boolean
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  checkpoint tcg_private.match_checkpoints%rowtype;
  accepted tcg_private.accepted_actions%rowtype;
  fingerprint bytea;
begin
  if p_match is null or p_action_id is null or p_actor is null
    or p_expected_revision is null or p_expected_revision < 0
    or p_action is null or jsonb_typeof(p_action) <> 'object'
    or octet_length(p_action::text) > 65536 then
    raise exception 'Invalid action request' using errcode='22023';
  end if;
  fingerprint := sha256(convert_to(jsonb_build_object(
    'actor',p_actor,'expected_revision',p_expected_revision,'action',p_action)::text,'UTF8'));
  -- Shared row lock serializes different action IDs as well as retries.
  select * into checkpoint from tcg_private.match_checkpoints where match_id=p_match for update;
  if not found then raise exception 'Unknown match' using errcode='22023'; end if;
  if not exists(select 1 from tcg_private.match_seats s
      join tcg_private.profile_owners o on o.profile_id=s.profile_id
      where s.match_id=p_match and o.auth_user_id=p_actor) then
    raise exception 'Actor is not a verified match participant' using errcode='42501';
  end if;
  select * into accepted from tcg_private.accepted_actions
    where match_id=p_match and action_id=p_action_id;
  if found then
    if accepted.request_hash is distinct from fingerprint then
      raise exception 'Action identity reused with different request' using errcode='22023';
    end if;
    -- Retry acknowledges the original commit even after later actions or finish.
    -- Proposed next state is ignored: the engine must not apply it again.
    return jsonb_build_object('match_id',p_match,'action_id',p_action_id,
      'accepted_revision',accepted.accepted_revision);
  end if;
  if checkpoint.finished then raise exception 'Match already finished' using errcode='22023'; end if;
  if checkpoint.revision <> p_expected_revision then
    raise exception 'Stale match revision' using errcode='40001';
  end if;
  if p_finished is null or p_canonical is null or p_seat_zero is null or p_seat_one is null
    or jsonb_typeof(p_canonical) <> 'object' or jsonb_typeof(p_seat_zero) <> 'object'
    or jsonb_typeof(p_seat_one) <> 'object'
    or octet_length(p_canonical::text)+octet_length(p_seat_zero::text)+octet_length(p_seat_one::text)>2097152 then
    raise exception 'Invalid next-state projections' using errcode='22023';
  end if;
  update tcg_private.match_checkpoints set revision=revision+1,
    canonical_state=p_canonical, seat_zero_view=p_seat_zero, seat_one_view=p_seat_one,
    finished=p_finished, updated_at=clock_timestamp() where match_id=p_match;
  insert into tcg_private.accepted_actions(match_id,action_id,actor_auth_id,accepted_revision,request_hash)
    values(p_match,p_action_id,p_actor,p_expected_revision+1,fingerprint);
  return jsonb_build_object('match_id',p_match,'action_id',p_action_id,
    'accepted_revision',p_expected_revision+1);
end; $$;
revoke all on function tcg_private.commit_match_action(uuid,uuid,uuid,bigint,jsonb,jsonb,jsonb,jsonb,boolean)
  from public,anon,authenticated;
grant execute on function tcg_private.commit_match_action(uuid,uuid,uuid,bigint,jsonb,jsonb,jsonb,jsonb,boolean)
  to service_role;
-- Existing service bootstrap INSERT remains; updates/receipts must use one commit.
revoke update,delete,truncate on tcg_private.match_checkpoints from service_role;
revoke insert,update,delete,truncate on tcg_private.accepted_actions from service_role;
commit;
