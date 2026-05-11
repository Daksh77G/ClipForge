"use client";

import type { MediaAsset, ProcessingJob, GeneratedClip } from "@/types/db";
import { formatFileSize } from "@/lib/validation/media";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type ClipWithUrl = GeneratedClip & {
  signedUrl?: string | null;
};

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    uploaded: "bg-gray-100 text-gray-600",
    queued: "bg-yellow-100 text-yellow-700",
    processing: "bg-blue-100 text-blue-700",
    completed: "bg-green-100 text-green-700",
    failed: "bg-red-100 text-red-700",
  };

  return (
    <span
      className={`rounded-full px-2 py-1 text-xs font-medium ${
        styles[status] ?? "bg-gray-100 text-gray-600"
      }`}
    >
      {status}
    </span>
  );
}

function formatSeconds(seconds: number) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export default function UploadDetail({
  asset,
  jobs,
  clips,
}: {
  asset: MediaAsset;
  jobs: ProcessingJob[];
  clips: GeneratedClip[];
}) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<string | null>(null);
  const [clipPreviews, setClipPreviews] = useState<ClipWithUrl[]>([]);
  const [loadingClips, setLoadingClips] = useState(false);
  const fetchedPreviewRef = useRef<string | null>(null);

  const latestJob = useMemo(() => jobs[0] ?? null, [jobs]);

  const displayClips = useMemo(() => {
    if (clipPreviews.length > 0) return clipPreviews;
    return clips;
  }, [clipPreviews, clips]);

  useEffect(() => {
    if (!latestJob) return;

    if (latestJob.status === "queued" || latestJob.status === "processing") {
      const timer = setTimeout(() => {
        router.refresh();
      }, 2500);

      return () => clearTimeout(timer);
    }

    if (latestJob.status === "completed") {
      setRunning(false);
      setJobStatus(null);
    }

    if (latestJob.status === "failed") {
      setRunning(false);
      setJobStatus(null);
      setError(latestJob.error_message ?? "Processing failed");
    }
  }, [latestJob?.id, latestJob?.status, latestJob?.error_message, router]);

  useEffect(() => {
    async function loadClipUrls() {
      if (clips.length === 0) {
        setClipPreviews([]);
        fetchedPreviewRef.current = null;
        return;
      }

      const fetchKey = `${asset.id}:${clips.length}:${latestJob?.status ?? "none"}`;

      if (fetchedPreviewRef.current === fetchKey) {
        return;
      }

      setLoadingClips(true);

      try {
        const res = await fetch(`/api/uploads/${asset.id}/clips`, {
          cache: "no-store",
        });
        const data = await res.json().catch(() => null);

        if (res.ok && Array.isArray(data?.clips)) {
          setClipPreviews(data.clips);
          fetchedPreviewRef.current = fetchKey;
        } else {
          setClipPreviews([]);
        }
      } catch {
        setClipPreviews([]);
      } finally {
        setLoadingClips(false);
      }
    }

    if (latestJob?.status !== "queued" && latestJob?.status !== "processing") {
      loadClipUrls();
    }
  }, [asset.id, clips.length, latestJob?.status]);

  async function handleGenerateClips() {
    setRunning(true);
    setError(null);
    setJobStatus("Creating and starting job...");
    fetchedPreviewRef.current = null;

    const res = await fetch("/api/jobs/create", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ mediaAssetId: asset.id }),
    });

    const data = await res.json().catch(() => null);

    if (!res.ok) {
      setError(data?.error ?? "Failed to create job");
      setRunning(false);
      setJobStatus(null);
      return;
    }

    setJobStatus("Job queued and running...");
    setTimeout(() => {
      router.refresh();
    }, 1200);
  }

  async function handleDelete() {
    const confirmed = window.confirm(
      "Delete this upload and all generated clips? This cannot be undone."
    );
    if (!confirmed) return;

    setDeleting(true);
    setError(null);

    const res = await fetch(`/api/uploads/${asset.id}`, {
      method: "DELETE",
    });

    const data = await res.json().catch(() => null);

    if (!res.ok) {
      setError(data?.error ?? "Failed to delete upload");
      setDeleting(false);
      return;
    }

    router.push("/dashboard/uploads");
    router.refresh();
  }

  const canGenerate =
    !running &&
    !deleting &&
    latestJob?.status !== "processing" &&
    latestJob?.status !== "queued";

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <div className="mb-8">
        <Link
          href="/dashboard/uploads"
          className="text-sm text-gray-500 hover:text-gray-800"
        >
          ← Back to uploads
        </Link>

        <div className="mt-4 flex flex-col gap-4 rounded-xl border p-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-bold text-gray-900">
              {asset.original_filename}
            </h1>
            <p className="mt-2 text-sm text-gray-500">
              {formatFileSize(asset.file_size_bytes)} ·{" "}
              {new Date(asset.created_at).toLocaleString()}
            </p>
            <div className="mt-3 flex items-center gap-2">
              <span className="text-sm text-gray-500">Asset status:</span>
              <StatusBadge status={asset.status} />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleGenerateClips}
              disabled={!canGenerate}
              className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              {running ? "Starting..." : "Generate Clips"}
            </button>

            <button
              onClick={handleDelete}
              disabled={deleting || running}
              className="rounded-md border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {deleting ? "Deleting..." : "Delete"}
            </button>
          </div>
        </div>
      </div>

      <div className="mb-8 grid gap-6 md:grid-cols-2">
        <div className="rounded-xl border p-6">
          <h2 className="text-lg font-semibold text-gray-900">Processing</h2>
          <p className="mt-1 text-sm text-gray-500">
            Start AI transcription and clip extraction directly from the app.
          </p>

          <div className="mt-4 space-y-3">
            {latestJob ? (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">Latest status</span>
                  <StatusBadge status={latestJob.status} />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">Step</span>
                  <span className="text-sm text-gray-900">{latestJob.step}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">Progress</span>
                  <span className="text-sm text-gray-900">
                    {latestJob.progress}%
                  </span>
                </div>
              </>
            ) : (
              <p className="text-sm text-gray-500">
                No processing job has been run for this upload yet.
              </p>
            )}
          </div>

          {jobStatus && !error && (
            <p className="mt-4 rounded-lg bg-blue-50 px-4 py-3 text-sm text-blue-700">
              {jobStatus}
            </p>
          )}

          {error && (
            <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">
              {error}
            </p>
          )}
        </div>

        <div className="rounded-xl border p-6">
          <h2 className="text-lg font-semibold text-gray-900">Upload Info</h2>
          <div className="mt-4 space-y-3">
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm text-gray-500">File type</span>
              <span className="text-sm text-gray-900">{asset.mime_type}</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm text-gray-500">Storage bucket</span>
              <span className="text-sm text-gray-900">
                {asset.storage_bucket}
              </span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm text-gray-500">Source type</span>
              <span className="text-sm text-gray-900">{asset.source_type}</span>
            </div>
            <div className="flex items-start justify-between gap-4">
              <span className="text-sm text-gray-500">Storage path</span>
              <span className="max-w-[60%] break-all text-right text-sm text-gray-900">
                {asset.storage_path}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="mb-8 rounded-xl border p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Job History</h2>
          <span className="text-sm text-gray-400">{jobs.length} total</span>
        </div>

        {jobs.length === 0 ? (
          <p className="text-sm text-gray-500">No jobs yet.</p>
        ) : (
          <div className="space-y-3">
            {jobs.map((job) => (
              <div
                key={job.id}
                className="flex flex-col gap-2 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {job.job_type}
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    {new Date(job.created_at).toLocaleString()}
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    Step: {job.step} · Progress: {job.progress}%
                  </p>
                  {job.error_message && (
                    <p className="mt-2 text-xs text-red-600">
                      {job.error_message}
                    </p>
                  )}
                </div>
                <StatusBadge status={job.status} />
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-xl border p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">
            Generated Clips
          </h2>
          <span className="text-sm text-gray-400">{clips.length} total</span>
        </div>

        {loadingClips && clips.length > 0 ? (
          <div className="mb-4 rounded-xl border border-dashed p-4 text-center text-sm text-gray-400">
            Loading clip previews...
          </div>
        ) : null}

        {displayClips.length === 0 ? (
          <div className="rounded-xl border border-dashed p-8 text-center text-sm text-gray-400">
            No clips yet. Run Generate Clips to create them.
          </div>
        ) : (
          <div className="space-y-4">
            {displayClips.map((clip) => (
              <div key={clip.id} className="rounded-xl border p-4">
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {formatSeconds(clip.start_time)} -{" "}
                        {formatSeconds(clip.end_time)}
                        <span className="ml-2 text-xs text-gray-400">
                          ({Math.round(clip.end_time - clip.start_time)}s)
                        </span>
                      </p>
                      <p className="mt-2 text-sm text-gray-600">
                        {clip.reason}
                      </p>
                      <p className="mt-2 break-all text-xs text-gray-500">
                        {clip.storage_path ?? "No storage path yet"}
                      </p>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-700">
                        Score: {clip.score}
                      </span>
                      <StatusBadge status={clip.status ?? "completed"} />
                    </div>
                  </div>

                  {"signedUrl" in clip && clip.signedUrl ? (
                    <video
                      src={clip.signedUrl}
                      controls
                      preload="metadata"
                      playsInline
                      className="w-full rounded-lg border bg-black"
                    />
                  ) : (
                    <p className="text-xs text-gray-400">
                      Preview loading unavailable, but the clip record exists.
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}