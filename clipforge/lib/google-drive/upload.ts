import fs from "node:fs";
import path from "node:path";
import mime from "mime-types";
import { getDriveClient } from "./client";

export async function uploadFileToDrive(localPath: string) {
  const drive = getDriveClient();
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;

  if (!folderId) {
    throw new Error("Missing GOOGLE_DRIVE_FOLDER_ID");
  }

  const filename = path.basename(localPath);
  const mimeType = mime.lookup(filename) || "application/octet-stream";

  const res = await drive.files.create({
    requestBody: {
      name: filename,
      parents: [folderId],
    },
    media: {
      mimeType,
      body: fs.createReadStream(localPath),
    },
    fields: "id,name",
  });

  return res.data;
}