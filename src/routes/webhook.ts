import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { Receiver } from '@upstash/qstash'
import { createDb } from '../db/connect'
import {
  compute as computeTable,
  compute_one_click as computeOneClickTable,
  order as orderTable,
  route as routeTable,
  route_stop as routeStopTable,
} from '../db/schema'

type Bindings = {
  DATABASE_URL: string
  QSTASH_CURRENT_SIGNING_KEY: string
  QSTASH_NEXT_SIGNING_KEY: string
}

export const webhookRoutes = new Hono<{ Bindings: Bindings }>()

// ── /internal/vrp-callback ────────────────────────────────────────────────────
// BentoV1 response envelope（由 QStash 包裝）：
//   { status: number, header: {...}, body: "<base64>", url: string, callType: "callback" }
// body 解碼後為 BentoV1 response：
//   { compute_id: string, status: "success"|"partial"|"error", routes: [...], unserved_orders: [...], message?: string }

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

  const db = createDb(c.env.DATABASE_URL)
  const now = Math.floor(Date.now() / 1000)
  const { compute_id } = body

  if (typeof compute_id !== 'string') {
    return c.json({ error: 'Missing compute_id' }, 400)
  }

  // VRP API 回傳 HTTP 非 200 時，envelope.status 非 200
  if (envelope.status !== 200) {
    await db.update(computeTable)
      .set({ compute_status: 'failed', fail_reason: `VRP API 回傳 ${envelope.status}`, end_time: now, updated_at: now })
      .where(eq(computeTable.id, compute_id))
    return c.json({ ok: true })
  }

  const { status, routes, unserved_orders, message } = body

  if (status === 'error') {
    await db.update(computeTable)
      .set({ compute_status: 'failed', fail_reason: message ?? 'Unknown error', end_time: now, updated_at: now })
      .where(eq(computeTable.id, compute_id))
    return c.json({ ok: true })
  }

  // 取得 order 快照（用於反向映射 location_id → db_id、vehicle_id idx → db_id）
  const [computeRow] = await db.select({ compute_one_click_id: computeTable.compute_one_click_id })
    .from(computeTable).where(eq(computeTable.id, compute_id)).limit(1)

  if (!computeRow) {
    return c.json({ error: 'compute not found' }, 404)
  }

  const [click] = await db.select({ order_id: computeOneClickTable.order_id })
    .from(computeOneClickTable).where(eq(computeOneClickTable.id, computeRow.compute_one_click_id)).limit(1)

  const [order] = await db.select({ location_snapshot: orderTable.location_snapshot, vehicle_snapshot: orderTable.vehicle_snapshot })
    .from(orderTable).where(eq(orderTable.id, click.order_id)).limit(1)

  // 反向映射表
  type LocEntry = { idx: number; db_id: string }
  type VehEntry = { idx: number; db_id: string }
  const locationSnapshot = order.location_snapshot as LocEntry[]
  const vehicleSnapshot = order.vehicle_snapshot as VehEntry[]
  const locByIdx: Record<number, string> = Object.fromEntries(locationSnapshot.map(l => [l.idx, l.db_id]))
  const vehByIdx: Record<number, string> = Object.fromEntries(vehicleSnapshot.map(v => [v.idx, v.db_id]))

  // 寫入路線與停靠點
  for (const r of (routes ?? []) as any[]) {
    const vehicleDbId = vehByIdx[r.vehicle_id]
    if (!vehicleDbId) continue

    const [insertedRoute] = await db.insert(routeTable).values({
      compute_id,
      vehicle_id: vehicleDbId,
      total_distance: Math.round(r.total_distance ?? 0),
      total_time: Math.round(r.total_distance ?? 0), // BentoV1 不直接回傳 total_time，以 total_distance 暫代
      total_load: 0,
    }).returning()

    const stops: any[] = r.stops ?? []
    if (stops.length > 0) {
      await db.insert(routeStopTable).values(
        stops.map((s: any, idx: number) => ({
          route_id: insertedRoute.id,
          destination_id: locByIdx[s.location_id],
          sequence: idx,
          arrival_time: Math.round(s.arrival_time ?? 0),
          action: s.action ?? 'delivery',
          bento_order_ids: s.orders ?? [],
        }))
      )
    }
  }

  await db.update(computeTable)
    .set({
      compute_status: status === 'partial' ? 'completed' : 'completed',
      end_time: now,
      updated_at: now,
      // unserved_orders 記入 data 欄位
      ...(unserved_orders?.length > 0 && { data: { unserved_orders } }),
    })
    .where(eq(computeTable.id, compute_id))

  return c.json({ ok: true })
})
