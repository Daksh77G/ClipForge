import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMediaAssets } from "@/lib/db/queries";
import UploadList from "@/components/upload/upload-list";

export default async function UploadsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const assets = await getMediaAssets(user.id);

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Uploads</h1>
          <p className="mt-1 text-sm text-gray-600">
            Your uploaded videos and podcasts
          </p>
        </div>
        <Link
          href="/dashboard/uploads/new"
          className="rounded-md bg-black px-4 py-2 text-sm text-white"
        >
          New upload
        </Link>
      </div>

      <UploadList assets={assets} />
    </main>
  );
}