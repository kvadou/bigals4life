-- Scorebook ownership and membership. Service-role only, like every other table; identity is verified in the server routes.
create extension if not exists citext;

alter table public.scorebooks add column if not exists owner_id uuid references auth.users(id);

create table if not exists public.scorebook_members (
  scorebook_id uuid not null references public.scorebooks(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','editor','viewer')),
  added_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  primary key (scorebook_id, user_id)
);
create index if not exists scorebook_members_user on public.scorebook_members(user_id);

create table if not exists public.scorebook_invites (
  scorebook_id uuid not null references public.scorebooks(id) on delete cascade,
  email citext not null,
  role text not null check (role in ('owner','editor','viewer')),
  invited_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  primary key (scorebook_id, email)
);
create index if not exists scorebook_invites_email on public.scorebook_invites(email);

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  bowler_name text check (bowler_name is null or bowler_name in ('Doug','Mustafa','Kyle','Pete')),
  updated_at timestamptz not null default now()
);

do $$ declare t text; begin
  foreach t in array array['scorebook_members','scorebook_invites','profiles'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to service_role', t);
  end loop;
end $$;
