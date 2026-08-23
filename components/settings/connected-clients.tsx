import { PlugZap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/dates/date-time";
import { revokeGrantAction } from "@/lib/oauth/actions";

/** One authorization, reduced to what the student needs to recognize it. */
export type ConnectedClient = {
  id: string;
  name: string;
  grantedAt: string;
};

/** `formatDateTime` throws on an unusable value; a missing date is not worth a
 * crashed settings page, so the client is still listed without one. */
function describeGrantedAt(value: string): string | null {
  try {
    return formatDateTime(value);
  } catch {
    return null;
  }
}

/**
 * The AI assistants a student has authorized, with a way to disconnect each.
 *
 * The list comes from Supabase on every request rather than from anything
 * stored here, so what it shows is the live state of consent. The disconnect
 * control is an ordinary form posting to a Server Action — no client
 * JavaScript, and the button still works with scripting unavailable.
 */
export function ConnectedClients({ clients }: { clients: ConnectedClient[] }) {
  if (clients.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-5 py-8 text-center">
        <span className="mx-auto grid size-10 place-items-center rounded-xl bg-white text-slate-500">
          <PlugZap aria-hidden="true" className="size-5" />
        </span>
        <p className="mt-3 text-sm font-medium text-slate-800">
          No assistants connected yet
        </p>
        <p className="mx-auto mt-1 max-w-sm text-sm leading-6 text-slate-600">
          Once you connect one using the steps above, it will appear here and
          you can disconnect it at any time.
        </p>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
      {clients.map((client) => (
        <li
          className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
          key={client.id}
        >
          <div className="min-w-0">
            <p className="font-medium text-slate-950">{client.name}</p>
            {describeGrantedAt(client.grantedAt) ? (
              <p className="mt-0.5 text-sm text-slate-600">
                Connected {describeGrantedAt(client.grantedAt)}
              </p>
            ) : null}
          </div>
          <form action={revokeGrantAction}>
            <input name="clientId" type="hidden" value={client.id} />
            <Button
              aria-label={`Disconnect ${client.name}`}
              type="submit"
              variant="secondary"
            >
              Disconnect
            </Button>
          </form>
        </li>
      ))}
    </ul>
  );
}
