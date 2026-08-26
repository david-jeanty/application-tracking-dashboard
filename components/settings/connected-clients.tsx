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
 * Everything a student has authorized, with a way to disconnect each.
 *
 * An entry may be an AI assistant connected over MCP or the JobTrack Capture
 * browser extension. Supabase reports a client's name and id and nothing about
 * its kind, so this list names each connection and declines to categorize it —
 * guessing from the name would put a confident label on a value the student
 * chose when they registered the client.
 *
 * The list comes from Supabase on every request rather than from anything
 * stored here, so what it shows is the live state of consent. The disconnect
 * control is an ordinary form posting to a Server Action — no client
 * JavaScript, and the button still works with scripting unavailable.
 */
export function ConnectedClients({ clients }: { clients: ConnectedClient[] }) {
  if (clients.length === 0) {
    return (
      // A rule and two lines. The dashed box with an icon inside it was the
      // loudest thing in Settings, and it was announcing an absence.
      <div className="border-t border-border pt-5">
        <p className="text-sm text-foreground">Nothing connected yet</p>
        <p className="mt-1 max-w-md text-sm leading-6 text-foreground-secondary">
          Once you connect an assistant or the browser extension, it will appear
          here and you can remove it at any time.
        </p>
      </div>
    );
  }

  return (
    // Flat records on hairlines, like every other list in the product.
    <ul className="divide-y divide-border border-y border-border">
      {clients.map((client) => (
        <li
          className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6"
          key={client.id}
        >
          <div className="min-w-0">
            <p className="text-[15px] font-medium text-foreground">
              {client.name}
            </p>
            {describeGrantedAt(client.grantedAt) ? (
              <p className="mt-0.5 text-[13px] text-foreground-secondary">
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
