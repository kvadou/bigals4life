alter table public.live_sessions
 add column soundboard_enabled boolean not null default true,
 add column soundboard_last_play_at timestamptz,
 add column speaker_connection_id uuid references public.live_session_connections(id) on delete set null,
 add column speaker_expires_at timestamptz;
create table public.live_sound_clips (
 id uuid primary key default gen_random_uuid(),
 session_id uuid not null references public.live_sessions(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 clip_slot integer not null check(clip_slot between 0 and 9),
 title text not null check(char_length(title) between 1 and 40),
 audio_base64 text not null check(octet_length(audio_base64) between 1 and 349528),
 created_at timestamptz not null default now(),
 unique(session_id,clip_slot)
);
create table public.live_sound_events (
 id uuid primary key default gen_random_uuid(),
 session_id uuid not null references public.live_sessions(id) on delete cascade,
 event_slot integer not null check(event_slot between 0 and 1999),
 sound_id text not null,
 author text not null check(char_length(author) between 1 and 40 and position('@' in author)=0),
 created_at timestamptz not null default now(),
 unique(session_id,event_slot)
);
create index live_sound_events_latest on public.live_sound_events(session_id,created_at desc,id desc);
do $$ declare t text; begin
 foreach t in array array['live_sound_clips','live_sound_events'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from anon,authenticated',t);
  execute format('grant select,insert,update,delete on public.%I to service_role',t);
 end loop;
end $$;

-- Server-only RPC. The route verifies current membership before invoking it.
-- Locking the session serializes clip slots, plays, speaker claims and mute.
create function public.live_soundboard_action(p_session uuid,p_user uuid,p_action text,p_payload jsonb,p_author text)
returns jsonb language plpgsql set search_path=public as $$
declare s public.live_sessions%rowtype; c public.live_session_connections%rowtype;
 slot integer; clip_id uuid; clip_owner uuid; now_at timestamptz;
begin
 select * into s from public.live_sessions where id=p_session for update;
 now_at:=clock_timestamp();
 if not found or s.ended_at is not null or s.expires_at<=now_at then
  return jsonb_build_object('error','Session not available.','status',404);
 end if;
 if p_action in ('play','speaker') then
  select * into c from public.live_session_connections where id=(p_payload->>'connectionId')::uuid and session_id=p_session and user_id=p_user and expires_at>now_at;
  if not found then return jsonb_build_object('error','Connection not available.','status',404); end if;
 end if;
 if p_action='enabled' then
  if s.owner_id<>p_user then return jsonb_build_object('error','Only the host can mute the soundboard.','status',403);end if;
  update public.live_sessions set soundboard_enabled=(p_payload->>'enabled')::boolean where id=p_session;
  return jsonb_build_object('updated',true);
 elsif p_action='speaker' then
  if (p_payload->>'claim')::boolean then
   if s.speaker_connection_id is not null and s.speaker_expires_at>now_at and s.speaker_connection_id<>c.id then return jsonb_build_object('claimed',false);end if;
   update public.live_sessions set speaker_connection_id=c.id,speaker_expires_at=least(now_at+interval '30 seconds',s.expires_at) where id=p_session;
   return jsonb_build_object('claimed',true);
  else
   if s.speaker_connection_id=c.id then update public.live_sessions set speaker_connection_id=null,speaker_expires_at=null where id=p_session;end if;
   return jsonb_build_object('claimed',false);
  end if;
 elsif p_action='save' then
  select candidate into slot from generate_series(0,9) candidate where not exists(select 1 from public.live_sound_clips where session_id=p_session and clip_slot=candidate) limit 1;
  if slot is null then return jsonb_build_object('error','This session already has 10 recordings.','status',409);end if;
  insert into public.live_sound_clips(session_id,user_id,clip_slot,title,audio_base64) values(p_session,p_user,slot,p_payload->>'title',p_payload->>'audioBase64') returning id into clip_id;
  return jsonb_build_object('clip',jsonb_build_object('id',clip_id,'title',p_payload->>'title'));
 elsif p_action='remove' then
  select id,user_id into clip_id,clip_owner from public.live_sound_clips where id=(p_payload->>'clipId')::uuid and session_id=p_session;
  if not found then return jsonb_build_object('error','Recording not available.','status',404);end if;
  if clip_owner<>p_user and s.owner_id<>p_user then return jsonb_build_object('error','Only the uploader or host can remove this recording.','status',403);end if;
  delete from public.live_sound_clips where id=clip_id and session_id=p_session;
  return jsonb_build_object('removed',true);
 elsif p_action='play' then
  if not s.soundboard_enabled then return jsonb_build_object('error','The host has muted the soundboard.','status',403);end if;
  if s.soundboard_last_play_at>now_at-interval '5 seconds' then return jsonb_build_object('error','Give the last sound a moment to finish.','status',429);end if;
  if p_payload->>'soundId' not in ('pickle','turkey','violin','heating') then
   if not exists(select 1 from public.live_sound_clips where id=(p_payload->>'soundId')::uuid and session_id=p_session) then return jsonb_build_object('error','Recording not available.','status',404);end if;
  end if;
  select candidate into slot from generate_series(0,1999) candidate where not exists(select 1 from public.live_sound_events where session_id=p_session and event_slot=candidate) limit 1;
  if slot is null then return jsonb_build_object('error','This session has reached its sound limit.','status',409);end if;
  insert into public.live_sound_events(session_id,event_slot,sound_id,author,created_at) values(p_session,slot,p_payload->>'soundId',p_author,now_at);
  update public.live_sessions set soundboard_last_play_at=now_at where id=p_session;
  return jsonb_build_object('accepted',true);
 end if;
 return jsonb_build_object('error','Choose a valid soundboard action.','status',400);
end $$;
revoke all on function public.live_soundboard_action(uuid,uuid,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.live_soundboard_action(uuid,uuid,text,jsonb,text) to service_role;
-- Clip/audio and event rows cascade with session removal. No public storage URL.
