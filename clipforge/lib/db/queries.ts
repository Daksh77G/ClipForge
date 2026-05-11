import { createClient } from "@/lib/supabase/server";
import type { MediaAsset, ProcessingJob, GeneratedClip } from "@/types/db";

export async function getMediaAssets(userId: string): Promise<MediaAsset[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("media_assets")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function getProcessingJobs(
  mediaAssetId: string
): Promise<ProcessingJob[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("processing_jobs")
    .select("*")
    .eq("media_asset_id", mediaAssetId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function getMediaAssetById(
  id: string,
  userId: string
): Promise<MediaAsset | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("media_assets")
    .select("*")
    .eq("id", id)
    .eq("user_id", userId)
    .single();

  if (error) return null;
  return data;
}

export async function getGeneratedClips(
  mediaAssetId: string
): Promise<GeneratedClip[]> {
  const supabase = await createClient();

  const { data: jobs } = await supabase
    .from("processing_jobs")
    .select("id")
    .eq("media_asset_id", mediaAssetId);

  if (!jobs || jobs.length === 0) return [];

  const jobIds = jobs.map((j) => j.id);

  const { data, error } = await supabase
    .from("generated_clips")
    .select("*")
    .in("job_id", jobIds)
    .order("score", { ascending: false });

  if (error) throw error;
  return data ?? [];
}