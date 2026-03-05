import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { createDb } from '../db/connect'
import { compute as computeTable, route as routeTable, route_stop as routeStopTable } from '../db/schema'

type Bindings = {
  DATABASE_URL: string
  QSTASH_CURRENT_SIGNING_KEY: string
  QSTASH_NEXT_SIGNING_KEY: string
}

export const webhookRoutes = new Hono<{ Bindings: Bindings }>()

// ── QStash 簽名驗證 ────────────────────────────────────────────────────────────
// QStash callback 的 Upstash-Signature header 是 HMAC-SHA256 JWT

async function verifyQStashSignature(
  signature: string,
  signingKey: string,
  bodyText: string,
): Promise<boolean> {
  try {
    const parts = signature.split('.')
    if (parts.length !== 3) return false
    const [headerB64, payloadB64, sigB64] = parts

    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(signingKey),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify'],
    )

    const b64ToBytes = (s: string) =>
      Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))

    const valid = await crypto.subtle.verify(
      'HMAC',
      key,
      b64ToBytes(sigB64),
      new TextEncoder().encode(`${headerB64}.${payloadB64}`),
    )
    if (!valid) return false

    const payload = JSON.parse(atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/')))
    if (payload.exp < Math.floor(Date.now() / 1000)) return false

    // 驗證 body hash（hex SHA-256）
    const bodyHashBuf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(bodyText))
    const bodyHash = Array.from(new Uint8Array(bodyHashBuf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
    if (payload.body !== bodyHash) return false

    return true
  } catch {
    return false
  }
}

// ── /internal/vrp-callback ────────────────────────────────────────────────────

webhookRoutes.post('/internal/vrp-callback', async (c) => {
  const bodyText = await c.req.text()
  const signature = c.req.header('Upstash-Signature') ?? ''

  // 驗證 QStash 簽名（先試 current key，輪換期間再試 next key）
  const verified =
    (await verifyQStashSignature(signature, c.env.QSTASH_CURRENT_SIGNING_KEY, bodyText)) ||
    (await verifyQStashSignature(signature, c.env.QSTASH_NEXT_SIGNING_KEY, bodyText))

  if (!verified) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  let body: any
  try {
    body = JSON.parse(bodyText)
  } catch {
    return c.json({ error: 'Invalid JSON' }, 400)
  }

  // Rust API 將 compute_id echo 回 response
  const { compute_id, status, routes, message } = body

  if (typeof compute_id !== 'number') {
    return c.json({ error: 'Missing compute_id' }, 400)
  }

  const db = createDb(c.env.DATABASE_URL)
  const now = Math.floor(Date.now() / 1000)

  if (status === 'error') {
    await db.update(computeTable)
      .set({ compute_status: 'failed', fail_reason: message ?? 'Unknown error', end_time: now, updated_at: now })
      .where(eq(computeTable.id, compute_id))
    return c.json({ ok: true })
  }

  // 寫入 route 與 route_stop（Rust API 格式）
  for (const r of (routes ?? []) as any[]) {
    const stops: any[] = r.stops ?? []

    const [insertedRoute] = await db.insert(routeTable).values({
      compute_id,
      vehicle_id: r.vehicle_id,
      total_distance: Math.round(r.total_distance ?? 0),
      total_time: Math.round(r.completion_time ?? 0),   // Rust 回傳 completion_time
      total_load: r.total_delivery ?? 0,
    }).returning()

    if (stops.length > 0) {
      await db.insert(routeStopTable).values(
        stops.map((s: any, idx: number) => ({
          route_id: insertedRoute.id,
          destination_id: s.location_id,               // Rust 回傳 location_id（外部 ID）
          sequence: idx,
          arrival_time: Math.round(s.arrival_time ?? 0),
          demand: s.delivery ?? 0,
        }))
      )
    }
  }

  await db.update(computeTable)
    .set({ compute_status: 'completed', end_time: now, updated_at: now })
    .where(eq(computeTable.id, compute_id))

  return c.json({ ok: true })
})
