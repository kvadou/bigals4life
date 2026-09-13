-- Private live sessions. All access is checked by authenticated server handlers.
create table public.live_sessions (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 activity text not null check(activity in ('league','prebowl','practice','social')),
 audience text not null check(audience in ('team','invited')),
 scorebook_id uuid references public.scorebooks(id) on delete cascade,
 team_scope_id uuid references public.scorebooks(id) on delete cascade,
 title text not null check(char_length(title) between 1 and 100),
 created_at timestamptz not null default now(),
 expires_at timestamptz not null,
 ended_at timestamptz,
 check(expires_at > created_at and expires_at <= created_at + interval '8 hours'),
 check((activity in ('league','prebowl')) = (scorebook_id is not null)),
 check((audience = 'team') = (team_scope_id is not null))
);
create index live_sessions_active on public.live_sessions(expires_at) where ended_at is null;
create index live_sessions_owner on public.live_sessions(owner_id);
create table public.live_session_invites (
 session_id uuid not null references public.live_sessions(id) on delete cascade,
 email citext not null check(char_length(email)<=254),
 primary key(session_id,email)
);
create index live_session_invites_email on public.live_session_invites(email);
create table public.live_session_connections (
 id uuid primary key default gen_random_uuid(),
 session_id uuid not null references public.live_sessions(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 participant_identity text not null unique,
 connection_slot integer not null check(connection_slot between 0 and 199),
 unique(session_id,connection_slot),
 mode text not null check(mode in ('watch','publish')),
 expires_at timestamptz not null,
 reported_at timestamptz,
 received jsonb not null default '[]'::jsonb check(jsonb_typeof(received)='array'),
 outgoing jsonb check(outgoing is null or jsonb_typeof(outgoing)='object')
);
create index live_connections_session on public.live_session_connections(session_id,reported_at);
create index live_connections_expiry on public.live_session_connections(expires_at);
do $$ declare t text; begin
 foreach t in array array['live_sessions','live_session_invites','live_session_connections'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from anon, authenticated',t);
  execute format('grant select, insert, update, delete on public.%I to service_role',t);
 end loop;
end $$;

-- Retention: connection issuance is capped at 200 per session by bounded unique slots.
-- Expired sessions are inaccessible immediately. An operator may delete expired
-- live_sessions rows after the desired audit window; invitations/connections
-- cascade. This migration intentionally installs no unattended cleanup job.
