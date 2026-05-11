import { NextRequest, NextResponse } from "next/server";
import { runProcessingJob } from "@/lib/pipeline/run-job";
import { createServiceClient } from "@/lib/supabase/service";

export async function POST(request: NextRequest) {
  const auth = request.headers.get("authorization");
  const expected = `Bearer ${process.env.REMOTE_IMPORT_SHARED_SECRET}`;

  if (!process.env.REMOTE_IMPORT_SHARED_SECRET || auth !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { jobId } = (await request.json()) as { jobId?: string };
  if (!jobId) {
    return NextResponse.json({ error: "Missing jobId" }, { status: 400 });
  }

  const supabase = createServiceClient();

  try {
    await runProcessingJob(jobId);
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await supabase
      .from("processing_jobs")
      .update({ status: "failed", step: message })
      .eq("id", jobId);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}