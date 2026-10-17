-- BiteBoss 82.11
-- Campaigns remain the existing operating unit. This adds per-creative event tracking only.
-- Existing campaign/event RPCs are intentionally preserved for backward compatibility.

create extension if not exists pgcrypto;

create table if not exists public.biteboss_ad_creative_events (
  id uuid primary key default gen_random_uuid(),
  campaign_id text not null,
  creative_id text not null,
  event_type text not null check (event_type in ('impression','click','visit','capture')),
  session_key text not null,
  store_id text,
  placement text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists biteboss_ad_creative_events_created_idx
  on public.biteboss_ad_creative_events (created_at desc);
create index if not exists biteboss_ad_creative_events_campaign_idx
  on public.biteboss_ad_creative_events (campaign_id, creative_id, created_at desc);
create unique index if not exists biteboss_ad_creative_events_dedupe_idx
  on public.biteboss_ad_creative_events (
    campaign_id,
    creative_id,
    event_type,
    session_key,
    coalesce(store_id,''),
    placement
  );

alter table public.biteboss_ad_creative_events enable row level security;
revoke all on table public.biteboss_ad_creative_events from anon, authenticated;

create or replace function public.biteboss_track_ad_creative_event_v8211(
  p_campaign_id text,
  p_creative_id text,
  p_event_type text,
  p_session_key text,
  p_store_id text default null,
  p_placement text default ''
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if nullif(trim(coalesce(p_campaign_id,'')),'') is null
     or nullif(trim(coalesce(p_creative_id,'')),'') is null
     or nullif(trim(coalesce(p_session_key,'')),'') is null then
    return jsonb_build_object('ok',false,'error','INVALID_AD_EVENT');
  end if;

  if p_event_type not in ('impression','click','visit','capture') then
    return jsonb_build_object('ok',false,'error','INVALID_AD_EVENT_TYPE');
  end if;

  insert into public.biteboss_ad_creative_events(
    campaign_id, creative_id, event_type, session_key, store_id, placement
  ) values (
    trim(p_campaign_id), trim(p_creative_id), p_event_type, trim(p_session_key),
    nullif(trim(coalesce(p_store_id,'')),''), left(trim(coalesce(p_placement,'')),40)
  ) on conflict do nothing;

  return jsonb_build_object('ok',true);
end;
$$;

revoke all on function public.biteboss_track_ad_creative_event_v8211(text,text,text,text,text,text) from public;
grant execute on function public.biteboss_track_ad_creative_event_v8211(text,text,text,text,text,text) to anon, authenticated;

create or replace function public.biteboss_admin_ad_creative_analytics_v8211(
  p_days integer default 30
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin jsonb;
  v_days integer := greatest(1, least(coalesce(p_days,30), 365));
  v_since timestamptz := now() - make_interval(days => greatest(1, least(coalesce(p_days,30),365)));
  v_rows jsonb;
begin
  select to_jsonb(public.biteboss_admin_session()) into v_admin;
  if coalesce((v_admin->>'authenticated')::boolean,false) is not true then
    raise exception 'NOT_ADMIN';
  end if;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.campaign_id, x.creative_id),'[]'::jsonb)
  into v_rows
  from (
    select
      campaign_id,
      creative_id,
      count(*) filter (where event_type='impression')::bigint as impressions,
      count(*) filter (where event_type='click')::bigint as clicks,
      count(*) filter (where event_type='visit')::bigint as visits,
      count(*) filter (where event_type='capture')::bigint as captures
    from public.biteboss_ad_creative_events
    where created_at >= v_since
    group by campaign_id, creative_id
  ) x;

  return jsonb_build_object('ok',true,'days',v_days,'creatives',v_rows);
end;
$$;

revoke all on function public.biteboss_admin_ad_creative_analytics_v8211(integer) from public;
grant execute on function public.biteboss_admin_ad_creative_analytics_v8211(integer) to authenticated;
