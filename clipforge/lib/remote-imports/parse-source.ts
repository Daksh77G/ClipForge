import { RemoteSourceType } from "./types";

export function parseRemoteSource(url: string): RemoteSourceType {
  const u = new URL(url);
  const host = u.hostname.toLowerCase();

  if (host.includes("drive.google.com")) return "google_drive";
  if (host.includes("dropbox.com")) return "dropbox";
  if (host.includes("loom.com")) return "loom";
  if (host.includes("youtube.com") || host.includes("youtu.be")) return "youtube";
  return "direct_url";
}