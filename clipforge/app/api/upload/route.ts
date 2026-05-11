import { createClient } from "@/lib/supabase/server";
import { validateMediaFile } from "@/lib/validation/media";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  const validationError = validateMediaFile(file);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  // Insert media asset record first to get the ID
  const { data: mediaAsset, error: mediaError } = await supabase
    .from("media_assets")
    .insert({
      user_id: user.id,
      storage_bucket: "source-media",
      storage_path: "pending",
      original_filename: file.name,
      mime_type: file.type,
      file_size_bytes: file.size,
      source_type: "upload",
      status: "uploaded",
    })
    .select()
    .single();

  if (mediaError) {
    return NextResponse.json(
      { error: "Failed to create media record" },
      { status: 500 }
    );
  }

  // Upload file to Supabase Storage
  const storagePath = `${user.id}/${mediaAsset.id}/original${
    "." + file.name.split(".").pop()
  }`;

  const arrayBuffer = await file.arrayBuffer();
  const { error: uploadError } = await supabase.storage
    .from("source-media")
    .upload(storagePath, arrayBuffer, {
      contentType: file.type,
      upsert: false,
    });

  if (uploadError) {
    // Clean up the media record if upload failed
    await supabase.from("media_assets").delete().eq("id", mediaAsset.id);
    return NextResponse.json(
      { error: "Failed to upload file" },
      { status: 500 }
    );
  }

  // Update media asset with real storage path
  await supabase
    .from("media_assets")
    .update({ storage_path: storagePath, status: "queued" })
    .eq("id", mediaAsset.id);

  // Create processing job
  const { data: job, error: jobError } = await supabase
    .from("processing_jobs")
    .insert({
      media_asset_id: mediaAsset.id,
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
      { error: "Failed to create processing job" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    mediaAssetId: mediaAsset.id,
    jobId: job.id,
  });
}