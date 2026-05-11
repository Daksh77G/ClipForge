import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function DELETE(
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
    .select("*")
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

  if (jobIds.length > 0) {
    const { data: clips } = await supabase
      .from("generated_clips")
      .select("storage_path")
      .in("job_id", jobIds);

    const clipPaths = (clips ?? [])
      .map((clip) => clip.storage_path)
      .filter((p): p is string => Boolean(p));

    if (clipPaths.length > 0) {
      await supabase.storage.from("source-media").remove(clipPaths);
    }

    await supabase.from("generated_clips").delete().in("job_id", jobIds);
    await supabase.from("transcripts").delete().in("job_id", jobIds);
    await supabase.from("processing_jobs").delete().in("id", jobIds);
  }

  if (asset.storage_path && asset.storage_path !== "pending") {
    await supabase.storage.from("source-media").remove([asset.storage_path]);
  }

  const { error: deleteAssetError } = await supabase
    .from("media_assets")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (deleteAssetError) {
    return NextResponse.json(
      { error: deleteAssetError.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}