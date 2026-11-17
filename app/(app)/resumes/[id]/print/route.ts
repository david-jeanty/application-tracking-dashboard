import { NextResponse } from "next/server";
import { z } from "zod";
import { isAgentOwner } from "@/lib/agent/owner";
import { readResumeFile } from "@/lib/agent/resumes-repository";
import { RESUME_FILES_BUCKET } from "@/lib/agent/storage";
import { createClient } from "@/lib/supabase/server";

/**
 * The printable HTML resume.lol returned for a build. Owner only.
 *
 * Used when the server could not print the PDF (the layout check was
 * skipped): David opens this and prints it from the browser. The page is
 * served sandboxed, as its own unique origin: its pagination script may run
 * and it may open the print dialog, but it cannot read Interndex cookies or
 * call Interndex as David.
 */
export async function GET(
  _request: Request,
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
  if (!file?.html_path) return notFound();

  const { data, error } = await supabase.storage.from(RESUME_FILES_BUCKET).download(file.html_path);
  if (error || !data) return notFound();

  return new NextResponse(await data.text(), {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": "sandbox allow-scripts allow-modals",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}
