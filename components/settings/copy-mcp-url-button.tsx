"use client";

import { Check, Copy } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Copies the connection address next to it.
 *
 * The address is meant to be pasted verbatim into an assistant's connector
 * setup, and a long `mcp` URL is easy to mis-select by hand. This only ever
 * reads the value it was given — it does not derive or fetch the address
 * itself, so it cannot drift from what the page displays.
 */
export function CopyMcpUrlButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timeout = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timeout);
  }, [copied]);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      // Clipboard access can be denied by the browser; the address is still
      // selectable by hand right beside this button.
    }
  }

  return (
    <button
      aria-label={copied ? "Copied" : "Copy connection address"}
      className={cn(
        "grid size-9 shrink-0 place-items-center rounded-control border border-border-strong bg-surface text-foreground-secondary transition-colors hover:bg-surface-muted hover:text-foreground",
      )}
      onClick={handleCopy}
      type="button"
    >
      {copied ? (
        <Check aria-hidden="true" className="size-4" strokeWidth={2} />
      ) : (
        <Copy aria-hidden="true" className="size-4" strokeWidth={2} />
      )}
    </button>
  );
}
