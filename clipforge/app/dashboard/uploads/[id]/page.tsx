import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMediaAssetById, getProcessingJobs, getGeneratedClips } from "@/lib/db/queries";
import UploadDetail from "@/components/upload/upload-detail";

export default async function UploadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const asset = await getMediaAssetById(id, user.id);
  if (!asset) redirect("/dashboard/uploads");

  const jobs = await getProcessingJobs(asset.id);
  const clips = await getGeneratedClips(asset.id);

  return <UploadDetail asset={asset} jobs={jobs} clips={clips} />;
}