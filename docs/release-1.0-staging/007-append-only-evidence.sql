-- Permanent owner bindings and accepted-action identities are append-only for
-- the gameplay service. Administrative migration/retention remains privileged.
begin;
revoke update,delete,truncate on tcg_private.profile_owners,tcg_private.accepted_actions from service_role;
commit;
