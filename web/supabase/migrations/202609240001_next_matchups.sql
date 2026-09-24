-- Next week's pairings from Gary's sheet (roster "Lane N" headers), so the app knows who we bowl on league night.
alter table public.league_weeks add column if not exists next_matchups jsonb;
