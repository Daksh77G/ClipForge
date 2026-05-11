import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: asset, error: assetError } = await supabase
    .from("media_assets")
    .select("id, user_id")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (assetError || !asset) {
    return NextResponse.json({ error: "Upload not found" }, { status: 404 });
  }

  const { data: jobs, error: jobsError } = await supabase
    .from("processing_jobs")
    .select("id")
    .eq("media_asset_id", id);

  if (jobsError) {
    return NextResponse.json({ error: jobsError.message }, { status: 500 });
  }

  const jobIds = (jobs ?? []).map((job) => job.id);

  if (jobIds.length === 0) {
    return NextResponse.json({ clips: [] });
  }

  const { data: clips, error: clipsError } = await supabase
    .from("generated_clips")
    .select("id, job_id, user_id, storage_path, start_time, end_time, score, reason, created_at")
    .in("job_id", jobIds)
    .order("score", { ascending: false });

  if (clipsError) {
    return NextResponse.json({ error: clipsError.message }, { status: 500 });
  }

  const clipsWithUrls = await Promise.all(
    (clips ?? []).map(async (clip) => {
      if (!clip.storage_path) {
        return { ...clip, signedUrl: null };
      }

      const { data, error } = await supabase.storage
        .from("source-media")
        .createSignedUrl(clip.storage_path, 60 * 60);

      return {
        ...clip,
        signedUrl: error ? null : data?.signedUrl ?? null,
      };
    })
  );

  return NextResponse.json({ clips: clipsWithUrls });
}