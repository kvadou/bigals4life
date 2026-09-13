-- Host-controlled, private session gallery. No anonymous/client SQL access.
alter table public.live_sessions add column gallery_paused boolean not null default false;
create table public.live_gallery_events (
 id uuid primary key default gen_random_uuid(),
 session_id uuid not null references public.live_sessions(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 event_slot integer not null check(event_slot between 0 and 1999),
 kind text not null check(kind in ('reaction','comment','coach')),
 text text not null check(char_length(text) between 1 and 280),
 author text not null check(char_length(author) between 1 and 40 and position('@' in author)=0),
 created_at timestamptz not null default now(),
 unique(session_id,event_slot),
 check(kind <> 'reaction' or text in ('🎳','🔥','👏','😂','💪','🦃'))
);
create index live_gallery_latest on public.live_gallery_events(session_id,created_at desc,id desc);
alter table public.live_gallery_events enable row level security;
revoke all on public.live_gallery_events from anon,authenticated;
grant select,insert,update,delete on public.live_gallery_events to service_role;
-- Serialize insertion against host pause/end. Even an in-flight POST cannot
-- insert after a committed pause or expiry; auth still lives in the handler.
create function public.check_live_gallery_open() returns trigger language plpgsql set search_path=public as $$
declare session_row public.live_sessions%rowtype;
begin
 select * into session_row from public.live_sessions where id=new.session_id for update;
 if not found or session_row.gallery_paused or session_row.ended_at is not null or session_row.expires_at <= now() then
  raise exception 'Gallery is unavailable';
 end if;
 return new;
end $$;
revoke all on function public.check_live_gallery_open() from public,anon,authenticated;
create trigger live_gallery_open before insert on public.live_gallery_events for each row execute function public.check_live_gallery_open();
-- Bounded unique slots cap stored events even under concurrent requests.
-- Host removals free slots. Events cascade when an expired session is removed.
