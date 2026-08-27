/**
 * Run best-effort background work off the request/response path.
 *
 * Notification delivery must never delay a checkout or payment-webhook
 * acknowledgement. On OpenNext/Cloudflare the promise is attached to
 * `ctx.waitUntil`, so the Worker can finish the response and keep processing;
 * in any other runtime (node dev, unit tests) it falls back to awaiting the
 * work so behavior guarantees stay identical outside production.
 */
export async function runInBackground(work: () => Promise<unknown>): Promise<void> {
  try {
    const { getCloudflareContext } = await import('@opennextjs/cloudflare');
    const context = await getCloudflareContext({ async: true });
    context.ctx.waitUntil(work());
  } catch {
    await work().catch(() => {});
  }
}
