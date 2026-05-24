alter table public.concepts
  add column if not exists retention_pct smallint default 100
    check (retention_pct between 0 and 100),
  add column if not exists next_review_at date default current_date + 1;

update public.concepts c
set
  retention_pct = rs.retention_pct,
  next_review_at = rs.next_review_at
from public.review_schedule rs
where rs.concept_id = c.id
  and rs.user_id = c.user_id;

create or replace function public.fn_sync_concept_retention()
returns trigger as $$
begin
  update public.concepts
  set
    retention_pct = new.retention_pct,
    next_review_at = new.next_review_at
  where id = new.concept_id
    and user_id = new.user_id;

  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_sync_concept_retention on public.review_schedule;

create trigger trg_sync_concept_retention
  after update on public.review_schedule
  for each row
  when (
    old.retention_pct is distinct from new.retention_pct or
    old.next_review_at is distinct from new.next_review_at
  )
  execute function public.fn_sync_concept_retention();