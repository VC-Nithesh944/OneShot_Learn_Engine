-- Store the quiz-calculated retention on each attempt so the latest value
-- can be read back consistently after refresh.

alter table public.quiz_attempts
  add column if not exists estimated_retention_pct smallint
    check (estimated_retention_pct between 0 and 100);

create index if not exists idx_quiz_attempts_user_concept_attempted_at
  on public.quiz_attempts (user_id, concept_id, attempted_at desc);

with ranked_attempts as (
  select
    qa.id,
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
    ) as attempt_rank,
    count(*) over (
      partition by qa.concept_id, qa.user_id
    ) as attempt_count
  from public.quiz_attempts qa
  join public.concepts c
    on c.id = qa.concept_id
   and c.user_id = qa.user_id
),
computed as (
  select
    id,
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
  from ranked_attempts
  where attempt_rank = 1
)
update public.quiz_attempts qa
set estimated_retention_pct = c.estimated_retention_pct
from computed c
where qa.id = c.id;
