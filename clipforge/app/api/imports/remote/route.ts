import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseRemoteSource } from "@/lib/remote-imports/parse-source";

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { sourceUrl } = (await request.json()) as { sourceUrl?: string };

  if (!sourceUrl) {
    return NextResponse.json({ error: "Missing sourceUrl" }, { status: 400 });
  }

  const sourceType = parseRemoteSource(sourceUrl);

  const { data, error } = await supabase
    .from("remote_imports")
    .insert({
      user_id: user.id,
      source_url: sourceUrl,
      source_type: sourceType,
      status: "pending",
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await fetch(`${request.nextUrl.origin}/api/jobs/run`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.REMOTE_IMPORT_SHARED_SECRET}`,
    },
    body: JSON.stringify({ remoteImportId: data.id }),
  });

  return NextResponse.json({ success: true, remoteImportId: data.id });
}