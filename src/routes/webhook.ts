import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { Receiver } from '@upstash/qstash'
import { createDb } from '../db/connect'
import { compute as computeTable, route as routeTable, route_stop as routeStopTable } from '../db/schema'

type Bindings = {
  DATABASE_URL: string
  QSTASH_CURRENT_SIGNING_KEY: string
  QSTASH_NEXT_SIGNING_KEY: string
}

export const webhookRoutes = new Hono<{ Bindings: Bindings }>()

// ── /internal/vrp-callback ────────────────────────────────────────────────────

webhookRoutes.post('/internal/vrp-callback', async (c) => {
  const bodyText = await c.req.text()
  const signature = c.req.header('Upstash-Signature') ?? ''

  const receiver = new Receiver({
    currentSigningKey: c.env.QSTASH_CURRENT_SIGNING_KEY,
    nextSigningKey: c.env.QSTASH_NEXT_SIGNING_KEY,
  })

  try {
    await receiver.verify({ signature, body: bodyText })
  } catch {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  // QStash Callback envelope: { status, header, body (base64), url, callType }
  let envelope: any
  try {
    envelope = JSON.parse(bodyText)
  } catch {
    return c.json({ error: 'Invalid JSON' }, 400)
  }

  let body: any
  try {
    const decoded = atob(envelope.body)
    body = JSON.parse(decoded)
  } catch {
    return c.json({ error: 'Invalid callback body' }, 400)
  }

  if (envelope.status !== 200) {
    const db = createDb(c.env.DATABASE_URL)
    const now = Math.floor(Date.now() / 1000)
    const { compute_id } = body
    if (typeof compute_id === 'number') {
      await db.update(computeTable)
        .set({ compute_status: 'failed', fail_reason: `VRP API 回傳 ${envelope.status}`, end_time: now, updated_at: now })
        .where(eq(computeTable.id, compute_id))
    }
    return c.json({ ok: true })
  }

  // Python API 將 compute_id echo 回 response
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
