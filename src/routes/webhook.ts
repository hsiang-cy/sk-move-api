import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { createDb } from '../db/connect'
import { compute as computeTable, route as routeTable, route_stop as routeStopTable } from '../db/schema'

type Bindings = {
  DATABASE_URL: string
  JWT_SECRET: string
  ORTOOLS_URL: string
  API_BASE_URL: string
  ORTOOLS_WEBHOOK_SECRET: string
}

export const webhookRoutes = new Hono<{ Bindings: Bindings }>()

webhookRoutes.post('/internal/vrp-callback', async (c) => {
  // 若設定了 secret，驗證 header
  const secret = c.env.ORTOOLS_WEBHOOK_SECRET
  if (secret && c.req.header('X-Webhook-Secret') !== secret) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  const body: any = await c.req.json()
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

  // 寫入 route 與 route_stop
  for (const r of (routes ?? []) as any[]) {
    const stops: any[] = r.stops ?? []
    const lastStop = stops[stops.length - 1]

    const [insertedRoute] = await db.insert(routeTable).values({
      compute_id,
      vehicle_id: r.vehicle_id,
      total_distance: r.total_distance ?? 0,
      total_time: lastStop?.arrival_time ?? 0,  // 最後一站抵達時間即為總用時
      total_load: r.total_delivery ?? 0,
    }).returning()

    if (stops.length > 0) {
      await db.insert(routeStopTable).values(
        stops.map((s: any, idx: number) => ({
          route_id: insertedRoute.id,
          destination_id: s.location_id,
          sequence: idx,
          arrival_time: s.arrival_time ?? 0,
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
