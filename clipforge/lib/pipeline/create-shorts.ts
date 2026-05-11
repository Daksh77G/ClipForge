import path from "node:path";
import fs from "node:fs";
import { execSync } from "node:child_process";
import { ClipCandidate } from "./score-clips";
import { TranscriptSegment } from "./transcribe";

export interface ShortClip {
  path: string;
  start: number;
  end: number;
  reason: string;
  score: number;
}

function formatSrtTime(t: number) {
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = Math.floor(t % 60);
  const ms = Math.floor((t % 1) * 1000);

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
    const duration = Math.max(0.6, end - start);

    const groups = buildWordGroups(seg.text, 4);
    const groupDuration = duration / Math.max(groups.length, 1);

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

export async function createShorts(
  videoPath: string,
  clips: ClipCandidate[],
  segments: TranscriptSegment[],
  outputDir: string
): Promise<ShortClip[]> {
  await fs.promises.mkdir(outputDir, { recursive: true });
  const results: ShortClip[] = [];

  for (let i = 0; i < clips.length; i++) {
    const clip = clips[i];
    const duration = clip.end - clip.start;
    const outputPath = path.join(outputDir, `short_${i + 1}.mp4`);
    const srtPath = path.join(outputDir, `short_${i + 1}.srt`);

    fs.writeFileSync(srtPath, buildSrt(segments, clip.start, clip.end));

    const escapedSrtPath = srtPath.replace(/\\/g, "/").replace(/:/g, "\\:");

    const filter = [
      "[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=20:10[bg]",
      "[0:v]scale=-2:768:force_original_aspect_ratio=decrease[fg]",
      "[fg]format=rgba,split[fg1][fg2]",
      "[fg1]drawbox=x=0:y=0:w=iw:h=ih:color=black@0.18:t=fill[fgfill]",
      "[fgfill]drawbox=x=0:y=0:w=iw:h=ih:color=white@0.06:t=3[fgcard]",
      "[bg][fgcard]overlay=(W-w)/2:(H-h)/2-10[comp]",
      `[comp]subtitles='${escapedSrtPath}':force_style='Alignment=2,FontName=Arial,FontSize=7,PrimaryColour=&H00FFFFFF,OutlineColour=&H000000,BackColour=&H66000000,Bold=1,Outline=2,Shadow=0,MarginV=150'`,
    ].join(";");

    execSync(
      `ffmpeg -y -ss ${clip.start} -t ${duration} -i "${videoPath}" ` +
        `-filter_complex "${filter}" ` +
        `-map 0:a? -c:v libx264 -preset fast -crf 23 -c:a aac -b:a 128k "${outputPath}"`,
      { stdio: "pipe" }
    );

    results.push({
      path: outputPath,
      start: clip.start,
      end: clip.end,
      reason: clip.reason,
      score: clip.score,
    });
  }

  return results;
}