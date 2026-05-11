import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createServiceClient } from "@/lib/supabase/service";
import { extractAudio } from "./extract-audio";
import { splitAudio } from "./split-audio";
import { transcribeChunks } from "./transcribe";
import { scoreClips } from "./score-clips";
import { createShorts } from "./create-shorts";

export async function runProcessingJob(jobId: string) {
  const supabase = createServiceClient();

  async function updateJob(step: string, progress: number, status = "processing") {
    await supabase
      .from("processing_jobs")
      .update({ step, progress, status })
      .eq("id", jobId);
  }

  console.log("looking for jobId:", jobId);

  const { data: job, error: jobError } = await supabase
    .from("processing_jobs")
    .select("*, media_assets(*)")
    .eq("id", jobId)
    .single();

  console.log("job result:", job);
  console.log("job error:", jobError);

  if (!job) throw new Error("Job not found");

  const asset = job.media_assets as {
    storage_bucket: string;
    storage_path: string;
    user_id: string;
  };

  await updateJob("downloading", 5);

  const { data: fileData, error: downloadError } = await supabase.storage
    .from(asset.storage_bucket)
    .download(asset.storage_path);

  if (downloadError || !fileData) {
    throw new Error(`Download failed: ${downloadError?.message}`);
  }

  const tempDir = path.join(os.tmpdir(), "shorts-pipeline", jobId);
  await fs.promises.mkdir(tempDir, { recursive: true });

  const ext = asset.storage_path.split(".").pop() ?? "mp4";
  const videoPath = path.join(tempDir, `input.${ext}`);
  await fs.promises.writeFile(videoPath, Buffer.from(await fileData.arrayBuffer()));

  await updateJob("extracting_audio", 15);
  const audioPath = extractAudio(videoPath);

  await updateJob("splitting_audio", 25);
  const chunks = splitAudio(audioPath);

  await updateJob("transcribing", 35);
  const transcript = await transcribeChunks(chunks);

  await updateJob("scoring_clips", 65);
  const clipCandidates = await scoreClips(transcript.segments);

  await updateJob("creating_shorts", 75);
  const outputDir = path.join(tempDir, "shorts");
  const shorts = await createShorts(videoPath, clipCandidates, transcript.segments, outputDir);

  await updateJob("saving_outputs", 90);

  for (const short of shorts) {
    const shortBuffer = await fs.promises.readFile(short.path);
    const shortStoragePath = `${asset.user_id}/${jobId}/${path.basename(short.path)}`;

    await supabase.storage
      .from("source-media")
      .upload(shortStoragePath, shortBuffer, { contentType: "video/mp4", upsert: true });

    await supabase.from("generated_clips").insert({
      job_id: jobId,
      user_id: asset.user_id,
      storage_path: shortStoragePath,
      start_time: short.start,
      end_time: short.end,
      score: short.score,
      reason: short.reason,
    });
  }

  await supabase.from("transcripts").insert({
    job_id: jobId,
    user_id: asset.user_id,
    full_text: transcript.fullText,
    segments: transcript.segments,
  });

  await updateJob("done", 100, "completed");
  await fs.promises.rm(tempDir, { recursive: true, force: true });
}