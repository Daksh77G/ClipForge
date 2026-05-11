create table if not exists remote_imports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  media_asset_id uuid references media_assets(id) on delete set null,
  processing_job_id uuid references processing_jobs(id) on delete set null,
  source_url text not null,
  source_type text not null,
  source_title text,
  status text not null default 'pending',
  drive_file_id text,
  imported_storage_path text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);