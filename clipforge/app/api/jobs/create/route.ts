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

  const { mediaAssetId } = await request.json();

  if (!mediaAssetId) {
    return NextResponse.json({ error: "Missing mediaAssetId" }, { status: 400 });
  }

  const { data: job, error } = await supabase
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

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  fetch("http://localhost:3000/api/jobs/run", {
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