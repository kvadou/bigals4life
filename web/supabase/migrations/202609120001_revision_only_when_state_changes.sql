-- Claiming a legacy scorebook only touches owner_id, but the trigger tried to record a
-- revision anyway and collided with the existing (scorebook_id, revision) row.
-- Record a revision only when the revision number itself moves.
create or replace function public.record_scorebook_revision() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' or new.revision is distinct from old.revision then
    insert into public.scorebook_revisions(scorebook_id,revision,state)
      values(new.id,new.revision,new.state)
    on conflict (scorebook_id, revision) do nothing;
  end if;
  return new;
end;
$$;
