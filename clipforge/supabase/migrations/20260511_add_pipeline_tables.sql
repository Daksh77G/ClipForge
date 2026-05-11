create table if not exists generated_clips (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references processing_jobs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null,
  start_time float not null,
  end_time float not null,
  score int,
  reason text,
  created_at timestamptz not null default now()
);

create table if not exists transcripts (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references processing_jobs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  full_text text,
  segments jsonb,
  created_at timestamptz not null default now()
);