import { createClient } from "@/lib/supabase/server";
import type { MediaAsset, ProcessingJob } from "@/types/db";

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