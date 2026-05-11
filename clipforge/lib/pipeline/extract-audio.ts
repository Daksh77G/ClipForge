import { execSync } from "node:child_process";
import fs from "node:fs";

export function extractAudio(videoPath: string): string {
  const outputPath = videoPath.replace(/\.[^.]+$/, "_audio.mp3");

  execSync(
    `ffmpeg -y -i "${videoPath}" -vn -ac 1 -ar 16000 -b:a 64k "${outputPath}"`,
    { stdio: "pipe" }
  );

  if (!fs.existsSync(outputPath)) {
    throw new Error("Audio extraction failed");
  }

  return outputPath;
}