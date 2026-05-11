import Groq from "groq-sdk";
import { TranscriptSegment } from "./transcribe";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export interface ClipCandidate {
  start: number;
  end: number;
  reason: string;
  score: number;
}

const MIN_CLIP_SECONDS = 15;
const MAX_CLIP_SECONDS = 45;
const TARGET_CLIP_COUNT = 3;

function getSegmentBoundsAroundTime(
  segments: TranscriptSegment[],
  start: number,
  end: number
) {
  const overlapping = segments.filter(
    (s) => s.end >= start && s.start <= end && s.text.trim()
  );

  if (overlapping.length === 0) {
    return { start, end };
  }

  return {
    start: Math.max(0, overlapping[0].start),
    end: overlapping[overlapping.length - 1].end,
  };
}

function expandClipToMinimum(
  clip: ClipCandidate,
  segments: TranscriptSegment[]
): ClipCandidate | null {
  let start = Math.max(0, clip.start);
  let end = Math.max(start, clip.end);

  if (end - start >= MIN_CLIP_SECONDS) {
    return { ...clip, start, end };
  }

  const center = (start + end) / 2;
  const desiredStart = Math.max(0, center - MIN_CLIP_SECONDS / 2);
  const desiredEnd = center + MIN_CLIP_SECONDS / 2;

  const bounded = getSegmentBoundsAroundTime(segments, desiredStart, desiredEnd);

  start = bounded.start;
  end = bounded.end;

  if (end - start < MIN_CLIP_SECONDS) {
    end = start + MIN_CLIP_SECONDS;
  }

  return {
    ...clip,
    start,
    end,
  };
}

function normalizeClip(
  clip: ClipCandidate,
  segments: TranscriptSegment[]
): ClipCandidate | null {
  if (
    typeof clip.start !== "number" ||
    typeof clip.end !== "number" ||
    Number.isNaN(clip.start) ||
    Number.isNaN(clip.end)
  ) {
    return null;
  }

  let start = Math.max(0, clip.start);
  let end = Math.max(start, clip.end);

  let normalized: ClipCandidate = {
    start,
    end,
    reason: clip.reason?.trim() || "Strong moment",
    score: Math.max(1, Math.min(10, Math.round(clip.score || 0))),
  };

  normalized = expandClipToMinimum(normalized, segments) ?? normalized;

  if (normalized.end - normalized.start > MAX_CLIP_SECONDS) {
    normalized.end = normalized.start + MAX_CLIP_SECONDS;
  }

  if (normalized.end - normalized.start < MIN_CLIP_SECONDS) {
    return null;
  }

  if (
    normalized.reason.toLowerCase().includes("intro") ||
    normalized.reason.toLowerCase().includes("outro") ||
    normalized.reason.toLowerCase().includes("filler")
  ) {
    return null;
  }

  return normalized;
}

function overlaps(a: ClipCandidate, b: ClipCandidate) {
  return Math.max(a.start, b.start) < Math.min(a.end, b.end);
}

function buildFallbackClips(segments: TranscriptSegment[]): ClipCandidate[] {
  const speakingSegments = segments.filter((s) => s.text.trim().length > 20);
  if (speakingSegments.length === 0) return [];

  const fallback: ClipCandidate[] = [];

  for (let i = 0; i < speakingSegments.length; i += Math.max(1, Math.floor(speakingSegments.length / TARGET_CLIP_COUNT))) {
    const seg = speakingSegments[i];
    const start = Math.max(0, seg.start - 3);
    const end = start + 25;

    fallback.push({
      start,
      end,
      reason: "Fallback clip built from a strong transcript segment",
      score: 6,
    });
  }

  return fallback.slice(0, TARGET_CLIP_COUNT);
}

export async function scoreClips(
  segments: TranscriptSegment[]
): Promise<ClipCandidate[]> {
  const transcriptText = segments
    .map((s) => `[${s.start.toFixed(1)}s - ${s.end.toFixed(1)}s] ${s.text}`)
    .join("\n");

  const prompt = `You are a short-form video editor. Review this transcript and identify the best moments for engaging clips.

Return ONLY a JSON array like this, with no extra text:
[
  { "start": 12.5, "end": 34.0, "reason": "Strong hook and clear insight", "score": 9 }
]

Rules:
- Return 3 to 5 clips
- Each clip should feel self-contained
- Prefer clips with a strong hook in the first 3 seconds
- Each clip should be between ${MIN_CLIP_SECONDS} and ${MAX_CLIP_SECONDS} seconds
- Avoid intros, outros, filler, and incomplete thoughts
- Avoid heavily overlapping clips
- Score each clip from 1 to 10

Transcript:
${transcriptText}`;

  const res = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.3,
    max_completion_tokens: 1024,
  });

  const content = res.choices[0]?.message?.content ?? "[]";
  const jsonMatch = content.match(/\[[\s\S]*\]/);

  let parsed: ClipCandidate[] = [];

  if (jsonMatch) {
    try {
      parsed = JSON.parse(jsonMatch[0]) as ClipCandidate[];
    } catch {
      parsed = [];
    }
  }

  let cleaned = parsed
    .map((clip) => normalizeClip(clip, segments))
    .filter((clip): clip is ClipCandidate => clip !== null)
    .sort((a, b) => b.score - a.score);

  const deduped: ClipCandidate[] = [];
  for (const clip of cleaned) {
    const overlapsExisting = deduped.some((existing) => overlaps(existing, clip));
    if (!overlapsExisting) {
      deduped.push(clip);
    }
  }

  if (deduped.length < TARGET_CLIP_COUNT) {
    const fallback = buildFallbackClips(segments)
      .map((clip) => normalizeClip(clip, segments))
      .filter((clip): clip is ClipCandidate => clip !== null);

    for (const clip of fallback) {
      const overlapsExisting = deduped.some((existing) => overlaps(existing, clip));
      if (!overlapsExisting) {
        deduped.push(clip);
      }
      if (deduped.length >= TARGET_CLIP_COUNT) break;
    }
  }

  return deduped
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}