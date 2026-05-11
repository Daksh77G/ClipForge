import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { uploadFileToDrive } from "../lib/google-drive/upload";
import { deleteDriveFile } from "../lib/google-drive/delete";

async function main() {
  const tempFile = path.join(os.tmpdir(), `drive-test-${Date.now()}.txt`);
  fs.writeFileSync(tempFile, "hello drive");

  const uploaded = await uploadFileToDrive(tempFile);
  console.log("uploaded:", uploaded);

  if (uploaded.id) {
    await deleteDriveFile(uploaded.id);
    console.log("deleted:", uploaded.id);
  }

  fs.unlinkSync(tempFile);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});