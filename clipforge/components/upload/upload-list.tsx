import type { MediaAsset } from "@/types/db";
import { formatFileSize } from "@/lib/validation/media";
import Link from "next/link";

function StatusBadge({ status }: { status: MediaAsset["status"] }) {
  const styles: Record<MediaAsset["status"], string> = {
    uploaded: "bg-gray-100 text-gray-600",
    queued: "bg-yellow-100 text-yellow-700",
    processing: "bg-blue-100 text-blue-700",
    completed: "bg-green-100 text-green-700",
    failed: "bg-red-100 text-red-700",
  };

  return (
    <span
      className={`rounded-full px-2 py-1 text-xs font-medium ${styles[status]}`}
    >
      {status}
    </span>
  );
}

export default function UploadList({ assets }: { assets: MediaAsset[] }) {
  if (assets.length === 0) {
    return (
      <div className="rounded-xl border border-dashed p-12 text-center">
        <p className="text-sm text-gray-500">No uploads yet.</p>
        <Link
          href="/dashboard/uploads/new"
          className="mt-4 inline-block rounded-md bg-black px-4 py-2 text-sm text-white"
        >
          Upload your first file
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {assets.map((asset) => (
        <div
          key={asset.id}
          className="flex items-center justify-between rounded-xl border p-4"
        >
          <div>
            <p className="text-sm font-medium text-gray-900">
              {asset.original_filename}
            </p>
            <p className="mt-1 text-xs text-gray-500">
              {formatFileSize(asset.file_size_bytes)} ·{" "}
              {new Date(asset.created_at).toLocaleDateString()}
            </p>
          </div>
          <StatusBadge status={asset.status} />
        </div>
      ))}
    </div>
  );
}