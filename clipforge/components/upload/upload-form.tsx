"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  ALLOWED_EXTENSIONS,
  formatFileSize,
  MAX_FILE_SIZE_BYTES,
  validateMediaFile,
} from "@/lib/validation/media";

export default function UploadForm() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0] ?? null;
    setError(null);

    if (!selected) return;

    const validationError = validateMediaFile(selected);
    if (validationError) {
      setError(validationError);
      setFile(null);
      return;
    }

    setFile(selected);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!file) return;

    setUploading(true);
    setError(null);
    setProgress("Uploading file...");

    const formData = new FormData();
    formData.append("file", file);

    const res = await fetch("/api/upload", {
      method: "POST",
      body: formData,
    });

    const data = await res.json();

    if (!res.ok) {
      setError(data.error ?? "Upload failed");
      setUploading(false);
      setProgress(null);
      return;
    }

    setProgress("Upload complete! Redirecting...");
    router.push("/dashboard/uploads");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="rounded-xl border-2 border-dashed border-gray-200 p-8 text-center">
        <div className="mb-4">
          <p className="text-sm font-medium text-gray-700">
            Select a video or audio file
          </p>
          <p className="mt-1 text-xs text-gray-500">
            Supported: {ALLOWED_EXTENSIONS.join(", ")} · Max{" "}
            {formatFileSize(MAX_FILE_SIZE_BYTES)}
          </p>
        </div>

        <input
          type="file"
          accept={ALLOWED_EXTENSIONS.join(",")}
          onChange={handleFileChange}
          className="mx-auto block text-sm text-gray-500 file:mr-4 file:rounded-md file:border-0 file:bg-black file:px-4 file:py-2 file:text-sm file:text-white hover:file:bg-gray-800"
        />

        {file && (
          <div className="mt-4 rounded-lg bg-gray-50 p-3 text-left">
            <p className="text-sm font-medium text-gray-800">{file.name}</p>
            <p className="text-xs text-gray-500">{formatFileSize(file.size)}</p>
          </div>
        )}
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </p>
      )}

      {progress && (
        <p className="rounded-lg bg-blue-50 px-4 py-3 text-sm text-blue-600">
          {progress}
        </p>
      )}

      <button
        type="submit"
        disabled={!file || uploading}
        className="w-full rounded-md bg-black px-4 py-3 text-sm font-medium text-white disabled:opacity-40"
      >
        {uploading ? "Uploading..." : "Upload and process"}
      </button>
    </form>
  );
}