import { createClient } from "@supabase/supabase-js";

export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  console.log("service client url:", url ? "✓" : "MISSING");
  console.log("service client key:", key ? "✓" : "MISSING");

  if (!url || !key) {
    throw new Error("Missing Supabase service role credentials");
  }

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}