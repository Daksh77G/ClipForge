import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";

export async function downloadToTemp(url: string) {
  const tempDir = path.join(os.tmpdir(), "remote-imports");
  await fs.promises.mkdir(tempDir, { recursive: true });

  const filePath = path.join(tempDir, `${crypto.randomUUID()}.bin`);
  const res = await fetch(url);

  if (!res.ok || !res.body) {
    throw new Error(`Download failed with status ${res.status}`);
  }

  const fileStream = fs.createWriteStream(filePath);

  await new Promise<void>((resolve, reject) => {
    const reader = res.body!.getReader();

    async function pump() {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          fileStream.write(Buffer.from(value));
        }
        fileStream.end();
        resolve();
      } catch (err) {
        reject(err);
      }
    }

    pump();
  });

  return filePath;
}