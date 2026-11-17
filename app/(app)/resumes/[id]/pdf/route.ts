import { NextResponse } from "next/server";
import { z } from "zod";
import { isAgentOwner } from "@/lib/agent/owner";
import { readResumeFile } from "@/lib/agent/resumes-repository";
import { RESUME_FILES_BUCKET } from "@/lib/agent/storage";
import { pdfFileName } from "@/lib/agent/web";
import { createClient } from "@/lib/supabase/server";

/**
 * Opens or downloads one built resume PDF. Owner only.
 *
 * The PDF lives in a private bucket. This checks the session and the
 * OWNER_USER_ID gate, then redirects to a signed link that works for 60
 * seconds. Every other user, and any id that is not theirs, gets a 404.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const notFound = () => new NextResponse(null, { status: 404 });
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !isAgentOwner(user.id)) return notFound();

  const file = await readResumeFile(supabase, user.id, id);
  if (!file?.pdf_path) return notFound();

  const download = new URL(request.url).searchParams.get("download") === "1";
  const { data, error } = await supabase.storage
    .from(RESUME_FILES_BUCKET)
    .createSignedUrl(
      file.pdf_path,
      60,
      download ? { download: pdfFileName(file.name, file.company, file.role) } : undefined,
    );
  if (error || !data?.signedUrl) return notFound();

  return NextResponse.redirect(data.signedUrl, { status: 303, headers: { "Cache-Control": "private, no-store" } });
}
