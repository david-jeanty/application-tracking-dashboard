export type ExtensionConfig = {
  jobTrackOrigin: string;
  supabaseOrigin: string;
  oauthClientId: string;
};

let configPromise: Promise<ExtensionConfig> | undefined;

function validOrigin(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  try {
    const url = new URL(value);
    if (url.origin !== value || (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1")) {
      return undefined;
    }
    return url.origin;
  } catch {
    return undefined;
  }
}

export async function getExtensionConfig(): Promise<ExtensionConfig> {
  configPromise ??= fetch(chrome.runtime.getURL("config.json"), {
    cache: "no-store",
  }).then(async (response) => {
    if (!response.ok) throw new Error("Extension configuration is unavailable.");
    const value: unknown = await response.json();
    if (!value || typeof value !== "object") {
      throw new Error("Extension configuration is invalid.");
    }

    const candidate = value as Record<string, unknown>;
    const jobTrackOrigin = validOrigin(candidate.jobTrackOrigin);
    const supabaseOrigin = validOrigin(candidate.supabaseOrigin);
    if (
      !jobTrackOrigin ||
      !supabaseOrigin ||
      typeof candidate.oauthClientId !== "string"
    ) {
      throw new Error("Extension configuration is invalid.");
    }

    return {
      jobTrackOrigin,
      supabaseOrigin,
      oauthClientId: candidate.oauthClientId.trim(),
    };
  });

  return configPromise;
}
