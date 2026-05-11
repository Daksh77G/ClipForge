export const ALLOWED_MIME_TYPES = [
  "video/mp4",
  "video/quicktime",
  "audio/mpeg",
  "audio/mp4",
  "audio/wav",
  "audio/x-wav",
  "audio/x-m4a",
];

export const ALLOWED_EXTENSIONS = [".mp4", ".mov", ".mp3", ".m4a", ".wav"];

export const MAX_FILE_SIZE_BYTES = 500 * 1024 * 1024; // 500MB

export function validateMediaFile(file: File): string | null {
  const ext = "." + file.name.split(".").pop()?.toLowerCase();

  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return `File type not supported. Allowed: ${ALLOWED_EXTENSIONS.join(", ")}`;
  }

  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    return `Invalid file type: ${file.type}`;
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    return `File too large. Maximum size is 500MB`;
  }

  if (file.size === 0) {
    return `File is empty`;
  }

  return null;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}