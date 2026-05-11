import path from "node:path";
import fs from "node:fs";
import { execSync } from "node:child_process";

export function splitAudio(audioPath: string): string[] {
  const dir = path.dirname(audioPath);
  const base = path.basename(audioPath, ".mp3");
  const pattern = path.join(dir, `${base}_chunk_%03d.mp3`);

  execSync(
    `ffmpeg -y -i "${audioPath}" -f segment -segment_time 600 -c copy "${pattern}"`,
    { stdio: "pipe" }
  );

  return fs
    .readdirSync(dir)
    .filter((f) => f.startsWith(`${base}_chunk_`) && f.endsWith(".mp3"))
    .sort()
    .map((f) => path.join(dir, f));
}