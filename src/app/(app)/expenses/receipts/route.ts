import { NextResponse } from "next/server";
import { createReceiptDownloadUrl } from "@/lib/r2";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const key = new URL(request.url).searchParams.get("key");

  if (!key) {
    return new Response("Missing receipt key", { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const { data, error } = await supabase
    .from("expenses")
    .select("id, receipt_file_key")
    .eq("receipt_file_key", key)
    .maybeSingle();

  if (error || !data?.receipt_file_key) {
    return new Response("Receipt not found", { status: 404 });
  }

  return NextResponse.redirect(await createReceiptDownloadUrl(data.receipt_file_key));
}
