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
  const { filename, mimeType, fileSize } = body as {
    filename?: string;
    mimeType?: string;
    fileSize?: number;
  };

  if (!filename || !mimeType || !fileSize) {
    return NextResponse.json(
      { error: "Missing filename, mimeType, or fileSize" },
      { status: 400 }
    );
  }

  const { data: mediaAsset, error } = await supabase
    .from("media_assets")
    .insert({
      user_id: user.id,
      storage_bucket: "source-media",
      storage_path: "pending",
      original_filename: filename,
      mime_type: mimeType,
      file_size_bytes: fileSize,
      source_type: "upload",
      status: "uploaded",
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json(
      { error: `Failed to create media record: ${error.message}` },
      { status: 500 }
    );
  }

  const ext = filename.includes(".") ? filename.split(".").pop() : "bin";
  const storagePath = `${user.id}/${mediaAsset.id}/original.${ext}`;

  return NextResponse.json({
    success: true,
    mediaAssetId: mediaAsset.id,
    storagePath,
  });
}