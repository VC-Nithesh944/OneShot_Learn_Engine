-- One-time migration:
-- 1) Stop review_schedule from overwriting concepts.retention_pct.
-- 2) Backfill concepts.retention_pct from the latest quiz_attempts per concept/user.

create or replace function public.fn_sync_concept_retention()
returns trigger as $$
begin
  update public.concepts
  set next_review_at = new.next_review_at
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
    old.next_review_at is distinct from new.next_review_at
  )
  execute function public.fn_sync_concept_retention();

with latest_attempts as (
  select
    qa.concept_id,
    qa.user_id,
    coalesce(qa.score, 0) as score,
    coalesce(qa.quality_rating, 0) as quality_rating,
    coalesce(qa.time_taken_ms, 0) as time_taken_ms,
    coalesce(qa.review_in_future, true) as review_in_future,
    coalesce(c.exam_probability, 3) as exam_probability,
    row_number() over (
      partition by qa.concept_id, qa.user_id
      order by qa.attempted_at desc, qa.id desc
    ) as rn,
    count(*) over (
      partition by qa.concept_id, qa.user_id
    ) as attempt_count
  from public.quiz_attempts qa
  join public.concepts c
    on c.id = qa.concept_id
   and c.user_id = qa.user_id
),
estimated as (
  select
    concept_id,
    user_id,
    round(
      greatest(
        12,
        least(
          98,
          (
            (18 + (greatest(0, least(100, score)) / 100.0) * 48)
            * case
                when (time_taken_ms / 5.0 / 1000.0) <= 12 then 1.05
                when (time_taken_ms / 5.0 / 1000.0) <= 20 then 1.02
                when (time_taken_ms / 5.0 / 1000.0) <= 35 then 0.97
                else 0.90
              end
            * case
                when quality_rating >= 5 then 1.08
                when quality_rating >= 4 then 1.04
                when quality_rating >= 3 then 1.00
                when quality_rating >= 2 then 0.93
                else 0.86
              end
            * case
                when attempt_count >= 5 then 1.08
                when attempt_count >= 3 then 1.05
                when attempt_count >= 2 then 1.02
                else 0.98
              end
            * case
                when exam_probability >= 5 then 1.06
                when exam_probability >= 4 then 1.03
                when exam_probability >= 3 then 1.01
                else 0.98
              end
            * case
                when review_in_future then 1.03
                else 0.97
              end
          )
        )
      )
    )::int as estimated_retention_pct
  from latest_attempts
  where rn = 1
)
update public.concepts c
set retention_pct = e.estimated_retention_pct
from estimated e
where c.id = e.concept_id
  and c.user_id = e.user_id;
