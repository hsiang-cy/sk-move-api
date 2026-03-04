import { Hono } from 'hono'
import { and, eq, inArray, ne } from 'drizzle-orm'
import { createDb } from '../../db/connect'
import {
  order as orderTable,
  compute as computeTable,
  destination as destinationTable,
  vehicle as vehicleTable,
  custom_vehicle_type as vehicleTypeTable,
  info_between_two_point as infoBetweenTable,
} from '../../db/schema'
import type { ApiVariables } from './middleware'

type Bindings = {
  DATABASE_URL: string
  ORTOOLS_URL: string
  API_BASE_URL: string
  GOOGLE_ROUTES_API_KEY: string
}
type Env = { Bindings: Bindings; Variables: ApiVariables }

export const orderRoutes = new Hono<Env>()

orderRoutes
  .get('/', async (c) => {
    const db = createDb(c.env.DATABASE_URL)
    const account_id = c.get('account_id')
    const items = await db.select().from(orderTable)
      .where(and(eq(orderTable.account_id, account_id), ne(orderTable.status, 'deleted')))
    return c.json(items)
  })

  .get('/:id', async (c) => {
    const db = createDb(c.env.DATABASE_URL)
    const account_id = c.get('account_id')
    const [item] = await db.select().from(orderTable)
      .where(and(
        eq(orderTable.id, parseInt(c.req.param('id'))),
        eq(orderTable.account_id, account_id),
        ne(orderTable.status, 'deleted'),
      ))
      .limit(1)
    if (!item) return c.json({ error: 'Not found' }, 404)
    return c.json(item)
  })

  // 建立訂單：接受 destination_ids + vehicle_ids，從 DB 查出資料後建立快照
  .post('/', async (c) => {
    const db = createDb(c.env.DATABASE_URL)
    const account_id = c.get('account_id')
    const body: any = await c.req.json()

    const destination_ids: number[] = body.destination_ids ?? []
    const vehicle_ids: number[] = body.vehicle_ids ?? []

    if (destination_ids.length < 2) {
      return c.json({ error: 'At least 2 destinations required' }, 400)
    }
    if (vehicle_ids.length < 1) {
      return c.json({ error: 'At least 1 vehicle required' }, 400)
    }

    // 查出地點（驗證所有權）
    const destinations = await db.select().from(destinationTable)
      .where(and(
        inArray(destinationTable.id, destination_ids),
        eq(destinationTable.account_id, account_id),
        ne(destinationTable.status, 'deleted'),
      ))
    if (destinations.length !== destination_ids.length) {
      return c.json({ error: 'One or more destinations not found' }, 404)
    }

    // 查出車輛（帶 vehicle_type 取得 capacity）
    const vehicles = await db.select({
      id: vehicleTable.id,
      vehicle_number: vehicleTable.vehicle_number,
      capacity: vehicleTypeTable.capacity,
      data: vehicleTable.data,
    })
      .from(vehicleTable)
      .innerJoin(vehicleTypeTable, eq(vehicleTable.vehicle_type, vehicleTypeTable.id))
      .where(and(
        inArray(vehicleTable.id, vehicle_ids),
        eq(vehicleTable.account_id, account_id),
        ne(vehicleTable.status, 'deleted'),
      ))
    if (vehicles.length !== vehicle_ids.length) {
      return c.json({ error: 'One or more vehicles not found' }, 404)
    }

    // 建立快照
    const destination_snapshot = destinations.map((d) => ({
      id: d.id,
      name: d.name,
      address: d.address,
      lat: d.lat,
      lng: d.lng,
      is_depot: (d.data as any)?.is_depot ?? false,
      pickup: (d.data as any)?.pickup ?? 0,
      delivery: (d.data as any)?.delivery ?? 0,
      service_time: (d.data as any)?.service_time ?? 0,
      time_window_start: (d.data as any)?.time_window_start ?? 0,
      time_window_end: (d.data as any)?.time_window_end ?? 1440,
    }))

    const vehicle_snapshot = vehicles.map((v) => ({
      id: v.id,
      vehicle_number: v.vehicle_number,
      capacity: v.capacity,
      fixed_cost: (v.data as any)?.fixed_cost ?? 0,
    }))

    // 補齊缺少的兩點距離快取（同 GraphQL createOrder 邏輯）
    const destIds = destinations.map((d) => d.id)
    if (destIds.length >= 2) {
      const existing = await db
        .select({ a_point: infoBetweenTable.a_point, b_point: infoBetweenTable.b_point })
        .from(infoBetweenTable)
        .where(and(inArray(infoBetweenTable.a_point, destIds), inArray(infoBetweenTable.b_point, destIds)))

      const existingSet = new Set(existing.map((r) => `${r.a_point}-${r.b_point}`))
      const missingPairs = new Set<string>()
      for (const a of destinations) {
        for (const b of destinations) {
          if (a.id !== b.id && !existingSet.has(`${a.id}-${b.id}`)) {
            missingPairs.add(`${a.id}-${b.id}`)
          }
        }
      }

      if (missingPairs.size > 0) {
        const waypoints = destinations.map((d) => ({
          waypoint: { location: { latLng: { latitude: parseFloat(d.lat), longitude: parseFloat(d.lng) } } },
        }))

        const response = await fetch(
          'https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Goog-Api-Key': c.env.GOOGLE_ROUTES_API_KEY,
              'X-Goog-FieldMask': 'originIndex,destinationIndex,distanceMeters,duration,condition',
            },
            body: JSON.stringify({
              origins: waypoints,
              destinations: waypoints,
              travelMode: 'DRIVE',
              routingPreference: 'TRAFFIC_UNAWARE',
            }),
          }
        )

        if (!response.ok) {
          return c.json({ error: `Google Routes API error: ${response.status}` }, 502)
        }

        const entries = (await response.json()) as Array<{
          originIndex: number
          destinationIndex: number
          distanceMeters: number
          duration: string
          condition: string
        }>

        const newRows: Array<{
          a_point: number
          b_point: number
          distance_from_a_to_b: string
          time_from_a_to_b: string
        }> = []

        for (const entry of entries) {
          if (entry.originIndex === entry.destinationIndex) continue
          const key = `${destIds[entry.originIndex]}-${destIds[entry.destinationIndex]}`
          if (!missingPairs.has(key)) continue
          if (entry.condition !== 'ROUTE_EXISTS') {
            return c.json({ error: `No route between destination ${destIds[entry.originIndex]} and ${destIds[entry.destinationIndex]}` }, 422)
          }
          const durationSeconds = parseInt(entry.duration.replace('s', ''), 10)
          newRows.push({
            a_point: destIds[entry.originIndex],
            b_point: destIds[entry.destinationIndex],
            distance_from_a_to_b: String(entry.distanceMeters),
            time_from_a_to_b: String(Math.round(durationSeconds / 60)),
          })
        }

        if (newRows.length > 0) {
          await db.insert(infoBetweenTable).values(newRows)
        }
      }
    }

    const [created] = await db.insert(orderTable).values({
      account_id,
      destination_snapshot,
      vehicle_snapshot,
      data: body.data,
      comment_for_account: body.comment_for_account,
    }).returning()

    return c.json(created, 201)
  })

  .delete('/:id', async (c) => {
    const db = createDb(c.env.DATABASE_URL)
    const account_id = c.get('account_id')
    const now = Math.floor(Date.now() / 1000)
    const [deleted] = await db.update(orderTable)
      .set({ status: 'deleted', updated_at: now })
      .where(and(
        eq(orderTable.id, parseInt(c.req.param('id'))),
        eq(orderTable.account_id, account_id),
        ne(orderTable.status, 'deleted'),
      ))
      .returning()
    if (!deleted) return c.json({ error: 'Not found' }, 404)
    return c.json({ ok: true })
  })

  // 對一個訂單觸發計算
  .post('/:id/compute', async (c) => {
    const db = createDb(c.env.DATABASE_URL)
    const account_id = c.get('account_id')
    const order_id = parseInt(c.req.param('id'))
    const body: any = await c.req.json().catch(() => ({}))
    const now = Math.floor(Date.now() / 1000)

    // 查出 order
    const [order] = await db.select().from(orderTable)
      .where(and(
        eq(orderTable.id, order_id),
        eq(orderTable.account_id, account_id),
        ne(orderTable.status, 'deleted'),
      ))
      .limit(1)
    if (!order) return c.json({ error: 'Order not found' }, 404)

    // 建立 compute 記錄（同 GraphQL createCompute 邏輯）
    const [compute] = await db.insert(computeTable).values({
      account_id,
      order_id,
      data: body.data,
      comment_for_account: body.comment_for_account,
      compute_status: 'pending',
      start_time: now,
    }).returning()

    const markFailed = (reason: string) =>
      db.update(computeTable)
        .set({ compute_status: 'failed', fail_reason: reason, updated_at: Math.floor(Date.now() / 1000) })
        .where(eq(computeTable.id, compute.id))

    const destinations = order.destination_snapshot as any[]
    const vehicles = order.vehicle_snapshot as any[]
    const destIds = destinations.map((d: any) => d.id as number)
    const n = destIds.length

    const pairs = await db.select().from(infoBetweenTable)
      .where(and(inArray(infoBetweenTable.a_point, destIds), inArray(infoBetweenTable.b_point, destIds)))

    if (pairs.length < n * (n - 1)) {
      await markFailed(`距離矩陣資料不完整，需要 ${n * (n - 1)} 筆，實際只有 ${pairs.length} 筆`)
      return c.json(compute, 202)
    }

    const idxMap: Record<number, number> = Object.fromEntries(destIds.map((id, i) => [id, i]))
    const distMatrix = Array.from({ length: n }, () => Array<number>(n).fill(0))
    const timeMatrix = Array.from({ length: n }, () => Array<number>(n).fill(0))
    for (const p of pairs) {
      distMatrix[idxMap[p.a_point]][idxMap[p.b_point]] = Number(p.distance_from_a_to_b)
      timeMatrix[idxMap[p.a_point]][idxMap[p.b_point]] = Number(p.time_from_a_to_b)
    }

    const vrpPayload = {
      compute_id: compute.id,
      webhook_url: `${c.env.API_BASE_URL}/internal/vrp-callback`,
      depot_index: Math.max(0, destinations.findIndex((d: any) => d.is_depot)),
      locations: destinations.map((d: any) => ({
        id: d.id,
        name: d.name ?? '',
        lat: parseFloat(d.lat),
        lng: parseFloat(d.lng),
        pickup: d.pickup ?? 0,
        delivery: d.delivery ?? 0,
        service_time: d.service_time ?? 0,
        time_window_start: d.time_window_start ?? 0,
        time_window_end: d.time_window_end ?? 1440,
      })),
      vehicles: vehicles.map((v: any) => ({
        id: v.id,
        capacity: v.capacity ?? 0,
        fixed_cost: v.fixed_cost ?? 0,
      })),
      distance_matrix: distMatrix,
      time_matrix: timeMatrix,
      time_limit_seconds: body.time_limit_seconds ?? 30,
    }

    try {
      const res = await fetch(`${c.env.ORTOOLS_URL}/vrp/solve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(vrpPayload),
      })
      if (!res.ok) {
        const errText = await res.text().catch(() => `HTTP ${res.status}`)
        await markFailed(`OR-Tools 回傳錯誤: ${errText}`)
      }
    } catch (e: any) {
      await markFailed(`無法連線到演算法服務: ${e.message}`)
    }

    return c.json(compute, 202)
  })

  // 查詢一個訂單的所有計算任務
  .get('/:id/computes', async (c) => {
    const db = createDb(c.env.DATABASE_URL)
    const account_id = c.get('account_id')
    const order_id = parseInt(c.req.param('id'))

    // 確認 order 屬於此帳號
    const [order] = await db.select({ id: orderTable.id }).from(orderTable)
      .where(and(eq(orderTable.id, order_id), eq(orderTable.account_id, account_id)))
      .limit(1)
    if (!order) return c.json({ error: 'Not found' }, 404)

    const items = await db.select().from(computeTable)
      .where(eq(computeTable.order_id, order_id))
    return c.json(items)
  })
