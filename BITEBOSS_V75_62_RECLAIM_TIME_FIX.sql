-- BiteBoss v75.62 — authoritative reclaim time repair
-- Run once in Supabase SQL Editor.
-- Purpose:
-- 1) Reset the 24h reclaim clock from the newest real ownership timestamp.
-- 2) Repair legacy rows where an old active reign could incorrectly make a reclaimed store show "available now".
-- 3) Keep the existing v75.46 presence/reclaim RPC contract unchanged.

create or replace function public.biteboss_own_store_reclaim_state_v7546(
  p_store_id uuid,
  p_user_id uuid default public.biteboss_player_user_id()
)
returns jsonb
language plpgsql
stable
security definer
set search_path=public
as $$
declare
  v_control public.biteboss_store_control;
  v_reign_started_at timestamptz;
  v_claimed_at timestamptz;
  v_started_at timestamptz;
  v_minutes integer := 1440;
  v_available_at timestamptz;
  v_remaining integer := 0;
begin
  if p_store_id is null or p_user_id is null then
    return jsonb_build_object('is_boss',false,'eligible',false,'remaining_seconds',0);
  end if;

  select * into v_control
  from public.biteboss_store_control
  where store_id=p_store_id;

  if v_control.boss_user_id is distinct from p_user_id then
    return jsonb_build_object('is_boss',false,'eligible',false,'remaining_seconds',0);
  end if;

  select max(r.started_at) into v_reign_started_at
  from public.biteboss_store_reigns r
  where r.store_id=p_store_id
    and r.boss_user_id=p_user_id
    and r.ended_at is null;

  select max(c.claimed_at) into v_claimed_at
  from public.biteboss_claims c
  where c.store_id=p_store_id
    and c.user_id=p_user_id
    and c.status='active';

  -- Use the newest authoritative ownership timestamp. This is important for
  -- legacy data where an old active reign row can survive while boss_since or
  -- the active claim has already been refreshed by a reclaim.
  v_started_at := greatest(
    coalesce(v_reign_started_at,'epoch'::timestamptz),
    coalesce(v_control.boss_since,'epoch'::timestamptz),
    coalesce(v_claimed_at,'epoch'::timestamptz)
  );

  if v_started_at='epoch'::timestamptz then
    v_started_at := coalesce(v_control.updated_at,now());
  end if;

  v_available_at := v_started_at + make_interval(mins=>v_minutes);
  v_remaining := greatest(0,ceil(extract(epoch from(v_available_at-now())))::integer);

  return jsonb_build_object(
    'is_boss',true,
    'eligible',v_remaining=0,
    'reclaim_minutes',v_minutes,
    'last_claimed_at',v_started_at,
    'available_at',v_available_at,
    'remaining_seconds',v_remaining
  );
end;
$$;

revoke all on function public.biteboss_own_store_reclaim_state_v7546(uuid,uuid) from public;
grant execute on function public.biteboss_own_store_reclaim_state_v7546(uuid,uuid) to authenticated;

-- Verification
select
  (select value #>> '{}' from public.biteboss_app_config where key='boss_reclaim_minutes') as boss_reclaim_minutes,
  to_regprocedure('public.biteboss_own_store_reclaim_state_v7546(uuid,uuid)') is not null as reclaim_state_rpc_ready,
  to_regprocedure('public.biteboss_presence_ping_v7546(uuid,double precision,double precision,double precision)') is not null as presence_rpc_ready;
