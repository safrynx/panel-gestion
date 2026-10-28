/** Client of the site's /api/bot/* endpoints, authenticated with a shared token. */

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function siteConfig(): { url: string; token: string } {
  const url = process.env.SITE_URL?.replace(/\/+$/, "");
  const token = process.env.BOT_API_TOKEN;
  if (!url || !token) throw new Error("SITE_URL and BOT_API_TOKEN are required (see .env.example)");
  return { url, token };
}

/**
 * POST a JSON body to the site. Retries a couple of times on network errors / 5xx
 * (the site may be restarting); returns the parsed response, or null when it still failed.
 * A 4xx is never retried: it means the request itself is wrong (bad token, invalid body).
 */
export async function sitePost<T = Record<string, unknown>>(path: string, body: unknown = {}, attempts = 3): Promise<T | null> {
  const { url, token } = siteConfig();
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const res = await fetch(`${url}/api/bot/${path}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(60_000)
      });
      if (res.ok) return (await res.json()) as T;
      const detail = await res.text().catch(() => "");
      console.error(`[site] ${path} -> HTTP ${res.status} ${detail.slice(0, 200)}`);
      if (res.status < 500) return null;
    } catch (error) {
      console.error(`[site] ${path} unreachable (${attempt}/${attempts}):`, error instanceof Error ? error.message : error);
    }
    if (attempt < attempts) await wait(1500 * attempt);
  }
  return null;
}
