import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createServiceClient } from "@/lib/supabase/service";
import { extractAudio } from "./extract-audio";
import { splitAudio } from "./split-audio";
import { transcribeChunks } from "./transcribe";
import { scoreClips } from "./score-clips";
import { createShorts } from "./create-shorts";

function clampProgress(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function truncateErrorMessage(message: string, maxLength = 8000) {
  if (message.length <= maxLength) return message;
  return message.slice(0, maxLength);
}

export async function runProcessingJob(jobId: string) {
  const supabase = createServiceClient();
  let tempDir: string | null = null;

  async function updateJob(
    step: string,
    progress: number,
    status: "queued" | "processing" | "completed" | "failed" = "processing",
    error_message: string | null = null
  ) {
    const { error } = await supabase
      .from("processing_jobs")
      .update({
        step,
        progress: clampProgress(progress),
        status,
        error_message,
      })
      .eq("id", jobId);

    if (error) {
      console.error("Failed to update job", { jobId, step, progress, status, error });
    }
  }

  try {
    console.log("looking for jobId:", jobId);

    const { data: job, error: jobError } = await supabase
      .from("processing_jobs")
      .select("*, media_assets(*)")
      .eq("id", jobId)
      .single();

    console.log("job result:", job);
    console.log("job error:", jobError);

    if (jobError) {
      throw new Error(`Failed to load job: ${jobError.message}`);
    }

    if (!job) {
      throw new Error("Job not found");
    }

    const asset = job.media_assets as {
      storage_bucket: string;
      storage_path: string;
      user_id: string;
    } | null;

    if (!asset?.storage_bucket || !asset?.storage_path || !asset?.user_id) {
      throw new Error("Job media asset is missing required fields");
    }

    await updateJob("downloading_source", 5, "processing");

    const { data: fileData, error: downloadError } = await supabase.storage
      .from(asset.storage_bucket)
      .download(asset.storage_path);

    if (downloadError || !fileData) {
      throw new Error(`Download failed: ${downloadError?.message ?? "Missing file data"}`);
    }

    tempDir = path.join(os.tmpdir(), "shorts-pipeline", jobId);
    await fs.promises.mkdir(tempDir, { recursive: true });

    const ext = asset.storage_path.split(".").pop() ?? "mp4";
    const videoPath = path.join(tempDir, `input.${ext}`);
    await fs.promises.writeFile(videoPath, Buffer.from(await fileData.arrayBuffer()));

    await updateJob("extracting_audio", 15, "processing");
    const audioPath = extractAudio(videoPath);

    await updateJob("splitting_audio", 25, "processing");
    const chunks = splitAudio(audioPath);

    await updateJob("transcribing_audio", 35, "processing");
    const transcript = await transcribeChunks(chunks);

    if (!transcript?.segments?.length) {
      throw new Error("Transcript came back empty");
    }

    await updateJob("scoring_clips", 65, "processing");
    const clipCandidates = await scoreClips(transcript.segments);

    if (!clipCandidates.length) {
      throw new Error("No valid clip candidates were found");
    }

    await updateJob("creating_shorts", 75, "processing");

    const outputDir = path.join(tempDir, "shorts");
    const shorts = await createShorts(
      videoPath,
      clipCandidates,
      transcript.segments,
      outputDir,
      async (message) => {
        let progress = 78;

        const match = message.match(/Creating short (\d+) of (\d+) \((\d+)%\)/);
        if (match) {
          const current = Number(match[1]);
          const total = Number(match[2]);
          const clipPercent = Number(match[3]);

          const overall =
            total > 0
              ? 75 + (((current - 1) + clipPercent / 100) / total) * 15
              : 78;

          progress = clampProgress(overall);
        } else if (message.startsWith("Finished short")) {
          progress = 88;
        } else if (message.startsWith("Completed")) {
          progress = 90;
        }

        await updateJob(message, progress, "processing");
      }
    );

    if (!shorts.length) {
      throw new Error("No shorts were created");
    }

    await updateJob("saving_outputs", 90, "processing");

    for (let i = 0; i < shorts.length; i++) {
      const short = shorts[i];
      const shortBuffer = await fs.promises.readFile(short.path);
      const shortStoragePath = `${asset.user_id}/${jobId}/${path.basename(short.path)}`;

      const { error: uploadError } = await supabase.storage
        .from("source-media")
        .upload(shortStoragePath, shortBuffer, {
          contentType: "video/mp4",
          upsert: true,
        });

      if (uploadError) {
        throw new Error(`Clip upload failed: ${uploadError.message}`);
      }

      const { error: insertClipError } = await supabase.from("generated_clips").insert({
        job_id: jobId,
        user_id: asset.user_id,
        storage_path: shortStoragePath,
        start_time: short.start,
        end_time: short.end,
        score: short.score,
        reason: short.reason,
      });

      if (insertClipError) {
        throw new Error(`Clip insert failed: ${insertClipError.message}`);
      }

      const saveProgress = 90 + ((i + 1) / shorts.length) * 7;
      await updateJob(`saving_clip_${i + 1}_of_${shorts.length}`, saveProgress, "processing");
    }

    const { error: transcriptInsertError } = await supabase.from("transcripts").insert({
      job_id: jobId,
      user_id: asset.user_id,
      full_text: transcript.fullText,
      segments: transcript.segments,
    });

    if (transcriptInsertError) {
      throw new Error(`Transcript insert failed: ${transcriptInsertError.message}`);
    }

    await updateJob("done", 100, "completed", null);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown processing error";

    console.error("runProcessingJob failed", { jobId, error });
    await updateJob("failed", 100, "failed", truncateErrorMessage(message));
    throw error;
  } finally {
    if (tempDir) {
      await fs.promises.rm(tempDir, { recursive: true, force: true });
    }
  }
}