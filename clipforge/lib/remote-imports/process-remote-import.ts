import fs from "node:fs";
import path from "node:path";
import { createClient } from "@/lib/supabase/server";
import { parseRemoteSource } from "./parse-source";
import { uploadFileToDrive } from "@/lib/google-drive/upload";
import { deleteDriveFile } from "@/lib/google-drive/delete";
import { downloadToTemp } from "./download-to-temp";

export async function processRemoteImport(remoteImportId: string) {
  const supabase = await createClient();

  const { data: remoteImport, error } = await supabase
    .from("remote_imports")
    .select("*")
    .eq("id", remoteImportId)
    .single();

  if (error || !remoteImport) {
    throw new Error("Remote import not found");
  }

  const sourceType = parseRemoteSource(remoteImport.source_url);

  if (sourceType === "youtube") {
    throw new Error("YouTube remote download is not enabled");
  }

  await supabase
    .from("remote_imports")
    .update({ status: "downloading", source_type: sourceType })
    .eq("id", remoteImportId);

  const localPath = await downloadToTemp(remoteImport.source_url);

  await supabase
    .from("remote_imports")
    .update({ status: "uploading_to_drive" })
    .eq("id", remoteImportId);

  const driveFile = await uploadFileToDrive(localPath);

  await supabase
    .from("remote_imports")
    .update({
      status: "processing",
      drive_file_id: driveFile.id,
    })
    .eq("id", remoteImportId);

  const filename = path.basename(localPath);
  const storagePath = `${remoteImport.user_id}/${remoteImport.id}/${filename}`;

  const fileBuffer = await fs.promises.readFile(localPath);
  const { error: storageError } = await supabase.storage
    .from("source-media")
    .upload(storagePath, fileBuffer, {
      upsert: false,
      contentType: "application/octet-stream",
    });

  if (storageError) {
    throw new Error(storageError.message);
  }

  const { data: mediaAsset, error: mediaError } = await supabase
    .from("media_assets")
    .insert({
      user_id: remoteImport.user_id,
      storage_bucket: "source-media",
      storage_path: storagePath,
      original_filename: filename,
      mime_type: "application/octet-stream",
      file_size_bytes: fileBuffer.length,
      source_type: "remote_import",
      status: "queued",
    })
    .select()
    .single();

  if (mediaError) {
    throw new Error(mediaError.message);
  }

  const { data: job, error: jobError } = await supabase
    .from("processing_jobs")
    .insert({
      media_asset_id: mediaAsset.id,
      user_id: remoteImport.user_id,
      job_type: "transcription",
      status: "queued",
      progress: 0,
      step: "waiting",
    })
    .select()
    .single();

  if (jobError) {
    throw new Error(jobError.message);
  }

  await supabase
    .from("remote_imports")
    .update({
      status: "completed",
      media_asset_id: mediaAsset.id,
      processing_job_id: job.id,
      imported_storage_path: storagePath,
    })
    .eq("id", remoteImportId);

  await deleteDriveFile(driveFile.id!);
  await fs.promises.unlink(localPath);

  return { mediaAssetId: mediaAsset.id, jobId: job.id };
}