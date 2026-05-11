export type MediaAssetStatus = "uploaded" | "queued" | "processing" | "completed" | "failed";
export type JobStatus = "queued" | "processing" | "completed" | "failed";

export interface MediaAsset {
  id: string;
  user_id: string;
  storage_bucket: string;
  storage_path: string;
  original_filename: string;
  mime_type: string;
  file_size_bytes: number;
  source_type: string;
  source_url: string | null;
  status: MediaAssetStatus;
  created_at: string;
}

export interface ProcessingJob {
  id: string;
  media_asset_id: string;
  user_id: string;
  job_type: string;
  status: JobStatus;
  progress: number;
  step: string;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface Transcript {
  id: string;
  job_id: string;
  full_text: string;
  language: string | null;
  duration_seconds: number | null;
  created_at: string;
}

export interface GeneratedClip {
  id: string;
  job_id: string;
  user_id: string;
  start_time: number;
  end_time: number;
  score: number;
  reason: string;
  storage_path: string | null;
  status: string;
  created_at: string;
}