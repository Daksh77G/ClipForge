import fs from "node:fs";
import Groq from "groq-sdk";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}

export interface Transcript {
  fullText: string;
  segments: TranscriptSegment[];
}

export async function transcribeChunks(
  chunkPaths: string[]
): Promise<Transcript> {
  let fullText = "";
  const allSegments: TranscriptSegment[] = [];
  let timeOffset = 0;

  for (const chunkPath of chunkPaths) {
    const response = await groq.audio.transcriptions.create({
      file: fs.createReadStream(chunkPath),
      model: "whisper-large-v3-turbo",
      response_format: "verbose_json",
      timestamp_granularities: ["segment"],
      language: "en",
      temperature: 0.0,
    });

    const raw = response as unknown as {
      text: string;
      segments: { start: number; end: number; text: string }[];
    };

    fullText += (fullText ? " " : "") + raw.text;

    for (const seg of raw.segments ?? []) {
      allSegments.push({
        start: seg.start + timeOffset,
        end: seg.end + timeOffset,
        text: seg.text.trim(),
      });
    }

    const lastSeg = raw.segments?.at(-1);
    if (lastSeg) timeOffset += lastSeg.end;
  }

  return { fullText, segments: allSegments };
}