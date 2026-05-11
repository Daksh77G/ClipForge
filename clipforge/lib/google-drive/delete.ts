import { getDriveClient } from "./client";

export async function deleteDriveFile(fileId: string) {
  const drive = getDriveClient();
  await drive.files.delete({ fileId });
}