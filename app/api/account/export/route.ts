import { NextResponse } from "next/server";
import { buildAccountExport } from "@/lib/account/export";
import { buildAccountExportWorkbookBuffer } from "@/lib/account/export-workbook";
import { createClient } from "@/lib/supabase/server";

const XLSX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/**
 * Downloads everything Interndex stores about the signed-in student, as one
 * Excel workbook: an Applications sheet, a Status history sheet, and a
 * Profile sheet.
 *
 * No privileged key is involved: this reads through the ordinary
 * session-bound client `createClient()` builds from the request's own
 * cookies, so row-level security is the same enforcing boundary it is
 * everywhere else in the app — scoped to whichever account `getUser()`
 * reports, never a client-supplied id. The workbook itself is built from
 * that same data in `lib/account/export-workbook.ts`, so nothing beyond the
 * student's own profile, applications, and status history ever reaches it.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ status: "unauthenticated" }, { status: 401 });
  }

  const result = await buildAccountExport(supabase, user.id, user.email ?? null);

  if (result.outcome === "error") {
    return NextResponse.json({ status: "error" }, { status: 500 });
  }

  const workbookBuffer = await buildAccountExportWorkbookBuffer(result.data);
  const filename = `interndex-export-${new Date().toISOString().slice(0, 10)}.xlsx`;

  return new NextResponse(new Uint8Array(workbookBuffer), {
    status: 200,
    headers: {
      "content-type": XLSX_CONTENT_TYPE,
      "content-disposition": `attachment; filename="${filename}"`,
    },
  });
}
