create table public.imported_team_results (
  scorebook_id uuid not null references public.scorebooks(id),
  team_number integer not null check (team_number > 0),
  game_number integer not null check (game_number > 0),
  players jsonb not null check (jsonb_typeof(players) = 'array'),
  team_total integer not null check (team_total >= 0),
  source text not null,
  recorded_at timestamptz not null default now(),
  primary key(scorebook_id,team_number,game_number)
);
alter table public.imported_team_results enable row level security;
revoke all on public.imported_team_results from anon, authenticated;
grant select, insert, update on public.imported_team_results to service_role;
