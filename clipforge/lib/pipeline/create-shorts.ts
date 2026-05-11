import path from "node:path";
import fs from "node:fs";
import { spawn } from "node:child_process";
import { ClipCandidate } from "./score-clips";
import { TranscriptSegment } from "./transcribe";

export interface ShortClip {
  path: string;
  start: number;
  end: number;
  reason: string;
  score: number;
}

const MAX_CLIPS = 3;
const CLIP_RENDER_TIMEOUT_MS = 4 * 60 * 1000;

function formatSrtTime(t: number) {
  const safe = Math.max(0, t);
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = Math.floor(safe % 60);
  const ms = Math.floor((safe % 1) * 1000);

  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(
    s
  ).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
}

function splitWords(text: string) {
  return text
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
}

function buildWordGroups(text: string, wordsPerGroup = 4): string[] {
  const words = splitWords(text);
  const groups: string[] = [];

  for (let i = 0; i < words.length; i += wordsPerGroup) {
    groups.push(words.slice(i, i + wordsPerGroup).join(" "));
  }

  return groups;
}

function buildSrt(
  segments: TranscriptSegment[],
  clipStart: number,
  clipEnd: number
): string {
  const relevant = segments.filter(
    (s) => s.end > clipStart && s.start < clipEnd && s.text.trim()
  );

  let index = 1;
  const entries: string[] = [];

  for (const seg of relevant) {
    const start = Math.max(0, seg.start - clipStart);
    const end = Math.min(clipEnd - clipStart, seg.end - clipStart);

    if (end <= start) continue;

    const duration = Math.max(0.6, end - start);
    const groups = buildWordGroups(seg.text, 4);

    if (groups.length === 0) continue;

    const groupDuration = duration / groups.length;

    groups.forEach((group, i) => {
      const groupStart = start + i * groupDuration;
      const groupEnd = Math.min(end, groupStart + groupDuration);

      entries.push(
        `${index}\n${formatSrtTime(groupStart)} --> ${formatSrtTime(
          groupEnd
        )}\n${group}\n`
      );
      index += 1;
    });
  }

  return entries.join("\n");
}

function parseFfmpegTimeToSeconds(value: string): number {
  const match = value.match(/(\d+):(\d+):(\d+(?:\.\d+)?)/);
  if (!match) return 0;

  const [, hh, mm, ss] = match;
  return Number(hh) * 3600 + Number(mm) * 60 + Number(ss);
}

function truncateError(text: string, maxLength = 8000) {
  if (text.length <= maxLength) return text;
  return text.slice(-maxLength);
}

async function removeIfExists(filePath: string) {
  try {
    await fs.promises.unlink(filePath);
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code !== "ENOENT") throw err;
  }
}

async function renderClip(args: {
  videoPath: string;
  outputPath: string;
  srtPath: string;
  start: number;
  duration: number;
  clipIndex: number;
  clipCount: number;
  onProgress?: (message: string) => void;
}): Promise<void> {
  const {
    videoPath,
    outputPath,
    srtPath,
    start,
    duration,
    clipIndex,
    clipCount,
    onProgress,
  } = args;

  const escapedSrtPath = srtPath.replace(/\\/g, "/").replace(/:/g, "\\:");

  const filter = [
    "[0:v]scale=180:320:force_original_aspect_ratio=increase,crop=180:320,boxblur=10:3,scale=1080:1920[bg]",
    "[0:v]scale=-2:820:force_original_aspect_ratio=decrease[fg]",
    "[fg]drawbox=x=0:y=0:w=iw:h=ih:color=black@0.08:t=fill[fgcard]",
    "[bg][fgcard]overlay=(W-w)/2:(H-h)/2-10[comp]",
    `[comp]subtitles='${escapedSrtPath}':force_style='Alignment=2,FontName=Arial,FontSize=7,PrimaryColour=&H00FFFFFF,OutlineColour=&H000000,BackColour=&H66000000,Bold=1,Outline=2,Shadow=0,MarginV=150'`,
  ].join(";");

  const ffmpegArgs = [
    "-y",
    "-ss",
    String(start),
    "-t",
    String(duration),
    "-i",
    videoPath,
    "-filter_complex",
    filter,
    "-map",
    "0:v",
    "-map",
    "0:a?",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "24",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-movflags",
    "+faststart",
    outputPath,
  ];

  await new Promise<void>((resolve, reject) => {
    const proc = spawn("ffmpeg", ffmpegArgs, {
      stdio: ["ignore", "ignore", "pipe"],
    });

    let stderr = "";
    let settled = false;
    let lastPercent = -1;

    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      proc.kill("SIGINT");
      reject(
        new Error(
          `ffmpeg timed out for short ${clipIndex + 1}/${clipCount}\n${truncateError(
            stderr
          )}`
        )
      );
    }, CLIP_RENDER_TIMEOUT_MS);

    proc.stderr.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      stderr += text;

      const timeMatch = text.match(/time=(\d+:\d+:\d+(?:\.\d+)?)/g);
      if (!timeMatch?.length) return;

      const last = timeMatch[timeMatch.length - 1];
      const value = last.split("=")[1];
      const seconds = parseFfmpegTimeToSeconds(value);

      if (!duration || duration <= 0) return;

      const percent = Math.max(
        0,
        Math.min(99, Math.round((seconds / duration) * 100))
      );

      if (percent !== lastPercent) {
        lastPercent = percent;
        onProgress?.(
          `Creating short ${clipIndex + 1} of ${clipCount} (${percent}%)`
        );
      }
    });

    proc.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(error);
    });

    proc.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);

      if (code === 0) {
        onProgress?.(`Finished short ${clipIndex + 1} of ${clipCount}`);
        resolve();
        return;
      }

      reject(
        new Error(
          `ffmpeg failed for short ${clipIndex + 1}/${clipCount}\n${truncateError(
            stderr
          )}`
        )
      );
    });
  });
}

export async function createShorts(
  videoPath: string,
  clips: ClipCandidate[],
  segments: TranscriptSegment[],
  outputDir: string,
  onProgress?: (message: string) => void
): Promise<ShortClip[]> {
  await fs.promises.mkdir(outputDir, { recursive: true });

  const results: ShortClip[] = [];
  const limitedClips = clips
    .filter((clip) => clip.end > clip.start)
    .slice(0, MAX_CLIPS);

  if (limitedClips.length === 0) {
    onProgress?.("No valid clips to render");
    return [];
  }

  for (let i = 0; i < limitedClips.length; i++) {
    const clip = limitedClips[i];
    const duration = Math.max(1, clip.end - clip.start);
    const outputPath = path.join(outputDir, `short_${i + 1}.mp4`);
    const srtPath = path.join(outputDir, `short_${i + 1}.srt`);

    await removeIfExists(outputPath);
    await removeIfExists(srtPath);

    fs.writeFileSync(srtPath, buildSrt(segments, clip.start, clip.end));

    onProgress?.(`Preparing short ${i + 1} of ${limitedClips.length}`);

    try {
      await renderClip({
        videoPath,
        outputPath,
        srtPath,
        start: clip.start,
        duration,
        clipIndex: i,
        clipCount: limitedClips.length,
        onProgress,
      });
    } catch (error) {
      await removeIfExists(outputPath);
      throw error;
    }

    results.push({
      path: outputPath,
      start: clip.start,
      end: clip.end,
      reason: clip.reason,
      score: clip.score,
    });
  }

  onProgress?.(`Completed ${results.length} short${results.length === 1 ? "" : "s"}`);

  return results;
}