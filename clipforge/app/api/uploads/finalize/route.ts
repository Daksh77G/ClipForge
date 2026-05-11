import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { mediaAssetId, storagePath } = body as {
    mediaAssetId?: string;
    storagePath?: string;
  };

  if (!mediaAssetId || !storagePath) {
    return NextResponse.json(
      { error: "Missing mediaAssetId or storagePath" },
      { status: 400 }
    );
  }

  const { error: updateError } = await supabase
    .from("media_assets")
    .update({
      storage_path: storagePath,
      status: "queued",
    })
    .eq("id", mediaAssetId)
    .eq("user_id", user.id);

  if (updateError) {
    return NextResponse.json(
      { error: `Failed to update media asset: ${updateError.message}` },
      { status: 500 }
    );
  }

  const { data: job, error: jobError } = await supabase
    .from("processing_jobs")
    .insert({
      media_asset_id: mediaAssetId,
      user_id: user.id,
      job_type: "transcription",
      status: "queued",
      progress: 0,
      step: "waiting",
    })
    .select()
    .single();

  if (jobError) {
    return NextResponse.json(
      { error: `Failed to create processing job: ${jobError.message}` },
      { status: 500 }
    );
  }

  // Trigger the pipeline worker — use localhost to avoid SSL issues in Codespaces
  fetch(`http://localhost:3000/api/jobs/run`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.REMOTE_IMPORT_SHARED_SECRET}`,
    },
    body: JSON.stringify({ jobId: job.id }),
  }).catch((err) => console.error("Failed to trigger job runner:", err));

  return NextResponse.json({
    success: true,
    jobId: job.id,
  });
}