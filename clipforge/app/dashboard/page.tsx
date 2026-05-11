import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col px-6 py-12">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="mt-2 text-sm text-gray-600">
            Signed in as {user!.email}
          </p>
        </div>

        <form action="/auth/signout" method="post">
          <button
            type="submit"
            className="rounded-md border px-4 py-2 text-sm hover:bg-gray-50"
          >
            Sign out
          </button>
        </form>
      </div>

      <section className="rounded-xl border p-6">
        <h2 className="text-xl font-semibold">Welcome to ClipForge</h2>
        <p className="mt-2 text-sm text-gray-600">
          Auth is working. Next step: upload your first video or podcast.
        </p>

        <div className="mt-4">
          <Link
            href="/dashboard/uploads/new"
            className="inline-block rounded-md bg-black px-4 py-2 text-sm text-white"
          >
            Upload a file
          </Link>
        </div>
      </section>
    </main>
  );
}