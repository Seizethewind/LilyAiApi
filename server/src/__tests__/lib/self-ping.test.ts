import { describe, it, expect, vi } from 'vitest';
import { selfPingUrl, selfPingIntervalMs, startSelfPing, pingOnce } from '../../lib/self-ping.js';
import type { Scheduler } from '../../lib/scheduler.js';

describe('self-ping', () => {
  it('is off without a public URL', () => {
    expect(selfPingUrl({})).toBeNull();
    expect(startSelfPing({ every: vi.fn(), after: vi.fn() } as Scheduler, {})).toBeNull();
  });

  it('uses RENDER_EXTERNAL_URL, SELF_PING_URL wins, SELF_PING=0 disables', () => {
    expect(selfPingUrl({ RENDER_EXTERNAL_URL: 'https://a.onrender.com/' })).toBe('https://a.onrender.com/api/ping');
    expect(selfPingUrl({ RENDER_EXTERNAL_URL: 'https://a.onrender.com', SELF_PING_URL: 'https://b.example' })).toBe('https://b.example/api/ping');
    expect(selfPingUrl({ RENDER_EXTERNAL_URL: 'https://a.onrender.com', SELF_PING: '0' })).toBeNull();
  });

  it('defaults to 10 minutes and ignores intervals under 60s', () => {
    expect(selfPingIntervalMs({})).toBe(600_000);
    expect(selfPingIntervalMs({ SELF_PING_INTERVAL_MS: '5000' })).toBe(600_000);
    expect(selfPingIntervalMs({ SELF_PING_INTERVAL_MS: '120000' })).toBe(120_000);
  });

  it('schedules a ping that hits the public health URL', async () => {
    let tick: () => void = () => {};
    const scheduler = { every: vi.fn((_ms: number, fn: () => void) => { tick = fn; return () => {}; }), after: vi.fn() } as unknown as Scheduler;
    const fetchImpl = vi.fn(async () => new Response('ok', { status: 200 })) as unknown as typeof fetch;
    startSelfPing(scheduler, { RENDER_EXTERNAL_URL: 'https://a.onrender.com' }, fetchImpl);
    expect(scheduler.every).toHaveBeenCalledWith(600_000, expect.any(Function), { name: 'self-ping' });
    tick();
    await Promise.resolve();
    expect(fetchImpl).toHaveBeenCalledWith('https://a.onrender.com/api/ping', expect.anything());
  });

  it('reports failure without throwing', async () => {
    const bad = vi.fn(async () => { throw new Error('boom'); }) as unknown as typeof fetch;
    expect(await pingOnce('https://x/api/ping', bad)).toBe(false);
  });
});
