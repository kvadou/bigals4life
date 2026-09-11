create table if not exists public.scorebooks (
  id uuid primary key default gen_random_uuid(),
  state jsonb not null check (jsonb_typeof(state) = 'object'),
  revision integer not null default 1 check (revision > 0),
  updated_at timestamptz not null default now()
);
alter table public.scorebooks enable row level security;
revoke all on public.scorebooks from anon, authenticated;
grant select, insert, update on public.scorebooks to service_role;

create table if not exists public.scorebook_revisions (
  scorebook_id uuid not null references public.scorebooks(id),
  revision integer not null,
  state jsonb not null,
  recorded_at timestamptz not null default now(),
  primary key(scorebook_id, revision)
);
alter table public.scorebook_revisions enable row level security;
revoke all on public.scorebook_revisions from anon, authenticated;
grant select, insert on public.scorebook_revisions to service_role;

create or replace function public.record_scorebook_revision() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.scorebook_revisions(scorebook_id,revision,state)
    values(new.id,new.revision,new.state);
  return new;
end;
$$;
revoke all on function public.record_scorebook_revision() from public;
create trigger record_scorebook_revision after insert or update on public.scorebooks
for each row execute function public.record_scorebook_revision();
