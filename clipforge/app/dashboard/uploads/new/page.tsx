import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import UploadForm from "@/components/upload/upload-form";
import Link from "next/link";

export default async function NewUploadPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return (
    <main className="mx-auto max-w-xl px-6 py-12">
      <div className="mb-8">
        <Link
          href="/dashboard/uploads"
          className="text-sm text-gray-500 hover:text-gray-800"
        >
          ← Back to uploads
        </Link>
        <h1 className="mt-4 text-3xl font-bold">Upload a file</h1>
        <p className="mt-2 text-sm text-gray-600">
          Upload a video or podcast. We'll transcribe it and find the best clips.
        </p>
      </div>

      <UploadForm />
    </main>
  );
}