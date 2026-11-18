import type { Scheduler } from './scheduler.js';

// Render's free plan spins a web service down after ~15 minutes without
// INBOUND traffic. A request to localhost never leaves the container, so it
// doesn't count: the ping has to go to the public URL so it traverses Render's
// proxy. Render injects RENDER_EXTERNAL_URL on web services; SELF_PING_URL
// overrides it for other hosts. With neither set, nothing is started.
const DEFAULT_INTERVAL_MS = 10 * 60 * 1000;
const MIN_INTERVAL_MS = 60 * 1000;
const PING_TIMEOUT_MS = 15_000;

export function selfPingUrl(env: NodeJS.ProcessEnv = process.env): string | null {
  if (env.SELF_PING === '0' || env.SELF_PING === 'false') return null;
  const base = (env.SELF_PING_URL || env.RENDER_EXTERNAL_URL || '').trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(base)) return null;
  return `${base}/api/ping`;
}

export function selfPingIntervalMs(env: NodeJS.ProcessEnv = process.env): number {
  const n = Number(env.SELF_PING_INTERVAL_MS);
  return Number.isFinite(n) && n >= MIN_INTERVAL_MS ? Math.floor(n) : DEFAULT_INTERVAL_MS;
}

export async function pingOnce(url: string, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  try {
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(PING_TIMEOUT_MS) });
    if (!res.ok) console.warn(`[self-ping] ${url} answered ${res.status}`);
    return res.ok;
  } catch (err: any) {
    console.warn(`[self-ping] ${url} failed: ${err?.message ?? err}`);
    return false;
  }
}

/** Start the keep-awake ping. Returns a stop function, or null when disabled. */
export function startSelfPing(
  scheduler: Scheduler,
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = fetch,
): (() => void) | null {
  const url = selfPingUrl(env);
  if (!url) return null;
  const interval = selfPingIntervalMs(env);
  console.log(`[self-ping] keeping the service awake: GET ${url} every ${Math.round(interval / 1000)}s`);
  return scheduler.every(interval, () => { void pingOnce(url, fetchImpl); }, { name: 'self-ping' });
}
