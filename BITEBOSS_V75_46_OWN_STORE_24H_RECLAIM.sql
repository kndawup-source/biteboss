-- BiteBoss v75.46 — own-store 24-hour automatic reclaim
-- Run once in Supabase SQL Editor after the current v75.45 backend migrations.
-- Safe to re-run: config upsert + CREATE OR REPLACE only.
--
-- Rule:
-- 1) A current Boss keeps ownership continuously.
-- 2) The same Boss can create a new reclaim only after 24 hours from the current reign start.
-- 3) At a non-partner store, reclaim completes automatically after the normal GPS dwell.
-- 4) A self-reclaim starts a fresh protection window and a fresh reign/claim/check-in record.
-- 5) It is NOT logged as a battle win, so hot-store/challenge metrics are not artificially inflated.

begin;

-- -----------------------------------------------------------------------------
-- PREFLIGHT
-- -----------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.biteboss_app_config') is null then
    raise exception 'BiteBoss backend missing: biteboss_app_config';
  end if;
  if to_regclass('public.biteboss_stores') is null then
    raise exception 'BiteBoss backend missing: biteboss_stores';
  end if;
  if to_regclass('public.biteboss_store_control') is null then
    raise exception 'BiteBoss backend missing: biteboss_store_control';
  end if;
  if to_regclass('public.biteboss_store_reigns') is null then
    raise exception 'BiteBoss backend missing: biteboss_store_reigns';
  end if;
  if to_regclass('public.biteboss_presence_sessions') is null then
    raise exception 'BiteBoss backend missing: biteboss_presence_sessions';
  end if;
  if to_regclass('public.biteboss_claims') is null then
    raise exception 'BiteBoss backend missing: biteboss_claims';
  end if;
  if to_regprocedure('public.biteboss_presence_ping(uuid,double precision,double precision,double precision)') is null then
    raise exception 'BiteBoss RPC missing: biteboss_presence_ping';
  end if;
  if to_regprocedure('public.biteboss_player_user_id()') is null then
    raise exception 'BiteBoss RPC missing: biteboss_player_user_id';
  end if;
  if to_regprocedure('public.biteboss_player_authenticated()') is null then
    raise exception 'BiteBoss RPC missing: biteboss_player_authenticated';
  end if;
  if to_regprocedure('public.biteboss_touch_store_visit(uuid,uuid)') is null then
    raise exception 'BiteBoss RPC missing: biteboss_touch_store_visit';
  end if;
end $$;

-- Fixed product rule: same-store reclaim interval is 24 hours.
insert into public.biteboss_app_config(key,value)
values ('boss_reclaim_minutes','1440'::jsonb)
on conflict(key) do update
set value='1440'::jsonb,
    updated_at=now();

-- -----------------------------------------------------------------------------
-- CURRENT BOSS RECLAIM STATE
-- The open reign is authoritative. Existing installations already have one open
-- reign per occupied store from the v63+ reign tracker.
-- -----------------------------------------------------------------------------
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

  select r.started_at into v_started_at
  from public.biteboss_store_reigns r
  where r.store_id=p_store_id
    and r.boss_user_id=p_user_id
    and r.ended_at is null
  order by r.started_at desc
  limit 1;

  v_started_at := coalesce(v_started_at,v_control.boss_since,v_control.updated_at,now());
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

-- -----------------------------------------------------------------------------
-- GPS PRESENCE — v75.46
-- Non-Boss flow delegates to the canonical RPC unchanged.
-- Current-Boss flow only starts a dwell session when the 24h reclaim is due.
-- -----------------------------------------------------------------------------
create or replace function public.biteboss_presence_ping_v7546(
  p_store_id uuid,
  p_lat double precision,
  p_lng double precision,
  p_accuracy_m double precision default null
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_uid uuid := public.biteboss_player_user_id();
  v_store public.biteboss_stores;
  v_control public.biteboss_store_control;
  v_session public.biteboss_presence_sessions;
  v_claim public.biteboss_claims;
  v_reclaim jsonb;
  v_visit jsonb := '{}'::jsonb;
  v_radius_m double precision := greatest(1,public.biteboss_config_number('gps_radius_m',50)::double precision);
  v_max_accuracy double precision := greatest(1,public.biteboss_config_number('max_location_accuracy_m',100)::double precision);
  v_required_seconds integer := greatest(30,public.biteboss_config_number('gps_dwell_seconds',120)::integer);
  v_ping_seconds integer := greatest(5,public.biteboss_config_number('gps_presence_ping_seconds',10)::integer);
  v_protect_minutes integer := greatest(1,public.biteboss_config_number('protect_minutes',60)::integer);
  v_grace_seconds integer;
  v_distance double precision;
  v_elapsed integer;
  v_now timestamptz;
  v_available_at timestamptz;
  v_remaining integer;
begin
  if not public.biteboss_player_authenticated() or v_uid is null then
    return jsonb_build_object(
      'eligible',false,'status','login_required','reason','MEMBER_LOGIN_REQUIRED',
      'required_seconds',v_required_seconds,'remaining_seconds',v_required_seconds
    );
  end if;

  select * into v_store
  from public.biteboss_stores
  where id=p_store_id and status='active';

  if v_store.id is null then
    return jsonb_build_object('eligible',false,'status','blocked','reason','STORE_NOT_AVAILABLE');
  end if;

  -- Partner stores retain the QR contract even when the current player is Boss.
  if v_store.partnership_status='partnered' then
    return public.biteboss_presence_ping(p_store_id,p_lat,p_lng,p_accuracy_m);
  end if;

  select * into v_control
  from public.biteboss_store_control
  where store_id=p_store_id;

  -- Everybody except the current Boss stays on the existing canonical battle flow.
  if v_control.boss_user_id is distinct from v_uid then
    return public.biteboss_presence_ping(p_store_id,p_lat,p_lng,p_accuracy_m);
  end if;

  if exists(
    select 1 from public.biteboss_store_members m
    where m.store_id=p_store_id and m.user_id in(v_uid,auth.uid())
  ) then
    delete from public.biteboss_presence_sessions where user_id=v_uid and store_id=p_store_id;
    return jsonb_build_object('eligible',false,'status','blocked','reason','STORE_STAFF_CANNOT_CLAIM');
  end if;

  if v_store.latitude is null or v_store.longitude is null then
    return jsonb_build_object('eligible',false,'status','blocked','reason','STORE_LOCATION_MISSING');
  end if;

  if p_lat is null or p_lng is null then
    return jsonb_build_object('eligible',false,'status','blocked','reason','LOCATION_REQUIRED');
  end if;

  if p_accuracy_m is not null and p_accuracy_m>v_max_accuracy then
    delete from public.biteboss_presence_sessions where user_id=v_uid and store_id=p_store_id;
    return jsonb_build_object(
      'eligible',true,'status','low_accuracy','accuracy_m',round(p_accuracy_m::numeric,0),
      'required_seconds',v_required_seconds,'remaining_seconds',v_required_seconds
    );
  end if;

  v_distance := 6371000 * 2 * atan2(
    sqrt(power(sin(radians(v_store.latitude-p_lat)/2),2)
      +cos(radians(p_lat))*cos(radians(v_store.latitude))*power(sin(radians(v_store.longitude-p_lng)/2),2)),
    sqrt(greatest(0,1-(power(sin(radians(v_store.latitude-p_lat)/2),2)
      +cos(radians(p_lat))*cos(radians(v_store.latitude))*power(sin(radians(v_store.longitude-p_lng)/2),2))))
  );

  if v_distance>v_radius_m then
    delete from public.biteboss_presence_sessions where user_id=v_uid and store_id=p_store_id;
    return jsonb_build_object(
      'eligible',true,'status','outside','distance_m',round(v_distance::numeric,1),
      'radius_m',v_radius_m,'required_seconds',v_required_seconds,'remaining_seconds',v_required_seconds
    );
  end if;

  v_reclaim := public.biteboss_own_store_reclaim_state_v7546(p_store_id,v_uid);
  v_remaining := coalesce((v_reclaim->>'remaining_seconds')::integer,0);
  v_available_at := nullif(v_reclaim->>'available_at','')::timestamptz;

  -- Before 24h: it is a visit, not another capture. Throttle defense/visit writes.
  if v_remaining>0 then
    delete from public.biteboss_presence_sessions where user_id=v_uid and store_id=p_store_id;

    if v_control.last_boss_visit_at is null or v_control.last_boss_visit_at<now()-interval '5 minutes' then
      v_visit := public.biteboss_touch_store_visit(p_store_id,v_uid);
      update public.biteboss_store_control
      set last_boss_visit_at=now(),updated_at=now()
      where store_id=p_store_id and boss_user_id=v_uid;
    end if;

    return jsonb_build_object(
      'eligible',false,
      'status','boss_reclaim_cooldown',
      'reason','OWN_STORE_RECLAIM_COOLDOWN',
      'store_id',p_store_id,
      'store_name',v_store.name,
      'reclaim_available_at',v_available_at,
      'reclaim_remaining_seconds',v_remaining,
      'required_seconds',v_required_seconds,
      'remaining_seconds',v_required_seconds
    );
  end if;

  -- Reclaim is due: use the normal continuous GPS dwell clock.
  v_grace_seconds := greatest(20,v_ping_seconds*3);

  select * into v_session
  from public.biteboss_presence_sessions
  where user_id=v_uid and store_id=p_store_id
  for update;

  if v_session.user_id is null then
    insert into public.biteboss_presence_sessions(
      user_id,store_id,started_at,last_seen_at,latitude,longitude,accuracy_m,distance_m
    ) values (
      v_uid,p_store_id,now(),now(),p_lat,p_lng,p_accuracy_m,v_distance
    ) returning * into v_session;
  elsif v_session.last_seen_at<now()-make_interval(secs=>v_grace_seconds) then
    update public.biteboss_presence_sessions
    set started_at=now(),last_seen_at=now(),latitude=p_lat,longitude=p_lng,
        accuracy_m=p_accuracy_m,distance_m=v_distance
    where user_id=v_uid and store_id=p_store_id
    returning * into v_session;
  else
    update public.biteboss_presence_sessions
    set last_seen_at=now(),latitude=p_lat,longitude=p_lng,
        accuracy_m=p_accuracy_m,distance_m=v_distance
    where user_id=v_uid and store_id=p_store_id
    returning * into v_session;
  end if;

  v_elapsed := greatest(0,extract(epoch from(now()-v_session.started_at))::integer);

  if v_elapsed<v_required_seconds then
    return jsonb_build_object(
      'eligible',true,'status','tracking','mode','reclaim',
      'store_id',p_store_id,'store_name',v_store.name,
      'elapsed_seconds',v_elapsed,'required_seconds',v_required_seconds,
      'remaining_seconds',greatest(0,v_required_seconds-v_elapsed),
      'distance_m',round(v_distance::numeric,1)
    );
  end if;

  -- Serialize the final reclaim and re-check ownership + 24h boundary.
  perform pg_advisory_xact_lock(hashtext(p_store_id::text));

  select * into v_control
  from public.biteboss_store_control
  where store_id=p_store_id
  for update;

  if v_control.boss_user_id is distinct from v_uid then
    delete from public.biteboss_presence_sessions where user_id=v_uid and store_id=p_store_id;
    -- Ownership changed during dwell: resume canonical challenge handling next tick.
    return jsonb_build_object('eligible',false,'status','ownership_changed','reason','BOSS_CHANGED');
  end if;

  v_reclaim := public.biteboss_own_store_reclaim_state_v7546(p_store_id,v_uid);
  v_remaining := coalesce((v_reclaim->>'remaining_seconds')::integer,0);
  if v_remaining>0 then
    delete from public.biteboss_presence_sessions where user_id=v_uid and store_id=p_store_id;
    return jsonb_build_object(
      'eligible',false,'status','boss_reclaim_cooldown','reason','OWN_STORE_RECLAIM_COOLDOWN',
      'reclaim_available_at',v_reclaim->>'available_at',
      'reclaim_remaining_seconds',v_remaining,
      'required_seconds',v_required_seconds,'remaining_seconds',v_required_seconds
    );
  end if;

  v_now := now();
  v_visit := public.biteboss_touch_store_visit(p_store_id,v_uid);

  -- Finish the current continuous reign segment and immediately start the next.
  update public.biteboss_store_reigns
  set ended_at=v_now
  where store_id=p_store_id and boss_user_id=v_uid and ended_at is null;

  insert into public.biteboss_store_reigns(store_id,boss_user_id,started_at)
  values(p_store_id,v_uid,v_now);

  update public.biteboss_store_control
  set boss_since=v_now,
      protected_until=v_now+make_interval(mins=>v_protect_minutes),
      last_boss_visit_at=v_now,
      updated_at=v_now
  where store_id=p_store_id and boss_user_id=v_uid;

  update public.biteboss_store_player_stats
  set role='boss',crew_since=null,last_challenge_at=v_now,updated_at=v_now
  where store_id=p_store_id and user_id=v_uid;

  -- Keep one active claim row while preserving previous claim history.
  update public.biteboss_claims
  set status='expired',released_at=coalesce(released_at,v_now)
  where store_id=p_store_id and status='active';

  insert into public.biteboss_claims(
    store_id,user_id,qr_code_id,status,claimed_at,protected_until,
    latitude,longitude,accuracy_m,distance_m
  ) values (
    p_store_id,v_uid,null,'active',v_now,v_now+make_interval(mins=>v_protect_minutes),
    p_lat,p_lng,p_accuracy_m,v_distance
  ) returning * into v_claim;

  insert into public.biteboss_checkins(store_id,user_id,claim_id)
  values(p_store_id,v_uid,v_claim.id);

  insert into public.biteboss_event_logs(user_id,store_id,event_type,payload)
  values(
    v_uid,p_store_id,'boss_reclaimed',
    jsonb_build_object(
      'claim_id',v_claim.id,
      'method','gps_dwell',
      'reclaim_minutes',1440,
      'distance_m',round(v_distance::numeric,1),
      'protect_minutes',v_protect_minutes
    )
  );

  delete from public.biteboss_presence_sessions where user_id=v_uid and store_id=p_store_id;

  return jsonb_build_object(
    'ok',true,
    'eligible',true,
    'status','claimed',
    'outcome','boss_reclaim',
    'claim_id',v_claim.id,
    'store_id',p_store_id,
    'store_name',v_store.name,
    'protected_until',v_claim.protected_until,
    'reclaimed_at',v_now,
    'reclaim_minutes',1440,
    'distance_m',round(v_distance::numeric,1),
    'method','gps_dwell',
    'xp_awarded',coalesce((v_visit->>'visit_xp')::integer,0),
    'required_seconds',v_required_seconds,
    'remaining_seconds',0
  );
end;
$$;

revoke all on function public.biteboss_presence_ping_v7546(uuid,double precision,double precision,double precision) from public;
grant execute on function public.biteboss_presence_ping_v7546(uuid,double precision,double precision,double precision) to authenticated;

commit;

-- Optional verification after running:
-- select
--   (select value #>> '{}' from public.biteboss_app_config where key='boss_reclaim_minutes') as boss_reclaim_minutes,
--   to_regprocedure('public.biteboss_own_store_reclaim_state_v7546(uuid,uuid)') is not null as reclaim_state_rpc_ready,
--   to_regprocedure('public.biteboss_presence_ping_v7546(uuid,double precision,double precision,double precision)') is not null as presence_rpc_ready;
