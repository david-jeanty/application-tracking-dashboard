import { NextResponse } from "next/server";
import { buildAccountExport } from "@/lib/account/export";
import { createClient } from "@/lib/supabase/server";

/**
 * Downloads everything Interndex stores about the signed-in student, as one
 * JSON file.
 *
 * No privileged key is involved: this reads through the ordinary
 * session-bound client `createClient()` builds from the request's own
 * cookies, so row-level security is the same enforcing boundary it is
 * everywhere else in the app — scoped to whichever account `getUser()`
 * reports, never a client-supplied id.
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

  const filename = `interndex-data-export-${new Date().toISOString().slice(0, 10)}.json`;

  return new NextResponse(JSON.stringify(result.data, null, 2), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
    },
  });
}
