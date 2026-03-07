import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { HTTPException } from 'hono/http-exception'
import { and, eq, inArray, ne } from 'drizzle-orm'
import { createDb } from '../../../db/connect'
import {
  order as orderTable,
  compute as computeTable,
  compute_one_click as computeOneClickTable,
  bento_order as bentoOrderTable,
  bento_order_item as bentoOrderItemTable,
  destination as destinationTable,
  vehicle as vehicleTable,
  custom_vehicle_type as vehicleTypeTable,
  info_between_two_point as infoBetweenTable,
} from '../../../db/schema'
import type { ApiVariables } from '../middleware'
import { ErrorSchema, OkSchema, IdParam, StatusEnum, validationHook } from '../schemas'
import { ComputeSchema } from '../computes'

type Bindings = {
  DATABASE_URL: string
  vrp_api_python: string
  API_BASE_URL: string
  GOOGLE_ROUTES_API_KEY: string
  QSTASH_URL: string
  QSTASH_TOKEN: string
}
type Env = { Bindings: Bindings; Variables: ApiVariables }

// ── Schemas ────────────────────────────────────────────────────────────────────

export const OrderSchema = z.object({
  id: z.uuid(),
  account_id: z.uuid(),
  status: StatusEnum,
  data: z.any(),
  location_snapshot: z.any(),
  bento_order_snapshot: z.any(),
  vehicle_snapshot: z.any(),
  comment_for_account: z.string().nullable(),
  created_at: z.number().nullable(),
  updated_at: z.number().nullable(),
}).openapi('Order')

export const CreateOrderBody = z.object({
  bento_order_ids: z.array(z.uuid()).min(1, '至少需要 1 筆便當訂單').openapi({
    description: '便當訂單 UUID 陣列',
    example: ['018f3a2b-0001-7abc-8def-000000000001'],
  }),
  vehicle_ids: z.array(z.uuid()).min(1, '至少需要 1 輛車輛').openapi({
    description: '車輛 UUID 陣列',
    example: ['018f3a2b-0002-7abc-8def-000000000002'],
  }),
  data: z.any().optional(),
  comment_for_account: z.string().optional(),
}).openapi('CreateOrderBody')

export const TriggerComputeBody = z.object({
  data: z.any().optional(),
  comment_for_account: z.string().optional(),
  time_limit_seconds: z.number().int().positive().optional().openapi({ example: 30 }),
}).openapi('TriggerComputeBody')

// ── Router ────────────────────────────────────────────────────────────────────

export const orderRoutes = new OpenAPIHono<Env>({ defaultHook: validationHook })

const tags = ['訂單']
const security = [{ Bearer: [] }]
const auth401 = { content: { 'application/json': { schema: ErrorSchema } }, description: '未授權' }
const notFound404 = { content: { 'application/json': { schema: ErrorSchema } }, description: '找不到資源' }

// ── Routes ────────────────────────────────────────────────────────────────────

const listOrdersRoute = createRoute({
  method: 'get', path: '/', tags, summary: '取得所有訂單', security,
  responses: {
    200: { content: { 'application/json': { schema: z.array(OrderSchema) } }, description: '訂單列表' },
    401: auth401,
  },
})

const getOrderRoute = createRoute({
  method: 'get', path: '/{id}', tags, summary: '取得單一訂單', security,
  request: { params: IdParam },
  responses: {
    200: { content: { 'application/json': { schema: OrderSchema } }, description: '訂單資料' },
    401: auth401,
    404: notFound404,
  },
})

const createOrderRoute = createRoute({
  method: 'post', path: '/', tags, summary: '建立訂單（從便當訂單 + 車輛建立 VRP 計算任務組）', security,
  request: { body: { content: { 'application/json': { schema: CreateOrderBody } }, required: true } },
  responses: {
    201: { content: { 'application/json': { schema: OrderSchema } }, description: '建立成功' },
    400: { content: { 'application/json': { schema: ErrorSchema } }, description: '請求資料錯誤' },
    401: auth401,
    404: notFound404,
    422: { content: { 'application/json': { schema: ErrorSchema } }, description: '無法計算兩點間的路線' },
    502: { content: { 'application/json': { schema: ErrorSchema } }, description: 'Google Routes API 發生錯誤' },
  },
})

const deleteOrderRoute = createRoute({
  method: 'delete', path: '/{id}', tags, summary: '刪除訂單', security,
  request: { params: IdParam },
  responses: {
    200: { content: { 'application/json': { schema: OkSchema } }, description: '刪除成功' },
    401: auth401,
    404: notFound404,
  },
})

const triggerComputeRoute = createRoute({
  method: 'post', path: '/{id}/compute', tags, summary: '觸發訂單計算', security,
  request: {
    params: IdParam,
    body: { content: { 'application/json': { schema: TriggerComputeBody } }, required: false },
  },
  responses: {
    202: { content: { 'application/json': { schema: ComputeSchema } }, description: '計算任務已建立' },
    401: auth401,
    404: notFound404,
  },
})

const listOrderComputesRoute = createRoute({
  method: 'get', path: '/{id}/computes', tags, summary: '取得訂單的所有計算任務', security,
  request: { params: IdParam },
  responses: {
    200: { content: { 'application/json': { schema: z.array(ComputeSchema) } }, description: '計算任務列表' },
    401: auth401,
    404: notFound404,
  },
})

// ── Handlers ──────────────────────────────────────────────────────────────────

orderRoutes.openapi(listOrdersRoute, async (c) => {
  const db = createDb(c.env.DATABASE_URL)
  const account_id = c.get('account_id')
  const items = await db.select().from(orderTable)
    .where(and(eq(orderTable.account_id, account_id), ne(orderTable.status, 'deleted')))
  return c.json(items, 200)
})

orderRoutes.openapi(getOrderRoute, async (c) => {
  const db = createDb(c.env.DATABASE_URL)
  const account_id = c.get('account_id')
  const { id } = c.req.valid('param')
  const [item] = await db.select().from(orderTable)
    .where(and(
      eq(orderTable.id, id),
      eq(orderTable.account_id, account_id),
      ne(orderTable.status, 'deleted'),
    ))
    .limit(1)
  if (!item) throw new HTTPException(404, { message: '找不到資源' })
  return c.json(item, 200)
})

orderRoutes.openapi(createOrderRoute, async (c) => {
  const db = createDb(c.env.DATABASE_URL)
  const account_id = c.get('account_id')
  const body = c.req.valid('json')

  // 1. 查出便當訂單
  const bentoOrders = await db.select().from(bentoOrderTable)
    .where(and(
      inArray(bentoOrderTable.id, body.bento_order_ids),
      eq(bentoOrderTable.account_id, account_id),
      ne(bentoOrderTable.status, 'deleted'),
    ))
  if (bentoOrders.length !== body.bento_order_ids.length) {
    throw new HTTPException(404, { message: '部分便當訂單不存在或無存取權限' })
  }

  // 2. 查出品項
  const items = await db.select().from(bentoOrderItemTable)
    .where(inArray(bentoOrderItemTable.bento_order_id, body.bento_order_ids))

  // 3. 收集不重複地點 ID
  const locationIdSet = new Set<string>()
  for (const bo of bentoOrders) {
    locationIdSet.add(bo.pickup_location_id)
    locationIdSet.add(bo.delivery_location_id)
  }
  const locationIds = Array.from(locationIdSet)

  // 4. 查出地點
  const destinations = await db.select().from(destinationTable)
    .where(and(
      inArray(destinationTable.id, locationIds),
      eq(destinationTable.account_id, account_id),
      ne(destinationTable.status, 'deleted'),
    ))
  if (destinations.length !== locationIds.length) {
    throw new HTTPException(404, { message: '部分地點不存在或無存取權限' })
  }

  // 5. 查出車輛（帶 capacity）
  const vehicles = await db.select({
    id: vehicleTable.id,
    capacity: vehicleTypeTable.capacity,
    data: vehicleTable.data,
  })
    .from(vehicleTable)
    .innerJoin(vehicleTypeTable, eq(vehicleTable.vehicle_type, vehicleTypeTable.id))
    .where(and(
      inArray(vehicleTable.id, body.vehicle_ids),
      eq(vehicleTable.account_id, account_id),
      ne(vehicleTable.status, 'deleted'),
    ))
  if (vehicles.length !== body.vehicle_ids.length) {
    throw new HTTPException(404, { message: '部分車輛不存在或無存取權限' })
  }

  // 6. 補齊兩點距離快取（Google Routes API）
  const existing = await db
    .select({ a_point: infoBetweenTable.a_point, b_point: infoBetweenTable.b_point })
    .from(infoBetweenTable)
    .where(and(
      inArray(infoBetweenTable.a_point, locationIds),
      inArray(infoBetweenTable.b_point, locationIds),
    ))

  const existingSet = new Set(existing.map(r => `${r.a_point}-${r.b_point}`))
  const missingPairs = new Set<string>()
  for (const a of destinations) {
    for (const b of destinations) {
      if (a.id !== b.id && !existingSet.has(`${a.id}-${b.id}`)) {
        missingPairs.add(`${a.id}-${b.id}`)
      }
    }
  }

  if (missingPairs.size > 0) {
    const waypoints = destinations.map(d => ({
      waypoint: { location: { latLng: { latitude: parseFloat(d.lat), longitude: parseFloat(d.lng) } } },
    }))

    // Google Routes API 上限 625 elements（origins × destinations）
    const chunkSize = Math.max(1, Math.floor(625 / waypoints.length))
    const newRows: Array<{ a_point: string; b_point: string; distance_from_a_to_b: string; time_from_a_to_b: string }> = []

    for (let start = 0; start < waypoints.length; start += chunkSize) {
      const originBatch = waypoints.slice(start, start + chunkSize)

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
            origins: originBatch,
            destinations: waypoints,
            travelMode: 'DRIVE',
            routingPreference: 'TRAFFIC_UNAWARE',
          }),
        }
      )

      if (!response.ok) {
        throw new HTTPException(502, { message: '第三方服務錯誤' })
      }

      const entries = (await response.json()) as Array<{
        originIndex: number; destinationIndex: number
        distanceMeters: number; duration: string; condition: string
      }>

      for (const entry of entries) {
        const actualOriginIdx = start + entry.originIndex
        if (actualOriginIdx === entry.destinationIndex) continue
        const key = `${destinations[actualOriginIdx].id}-${destinations[entry.destinationIndex].id}`
        if (!missingPairs.has(key)) continue
        if (entry.condition !== 'ROUTE_EXISTS') {
          throw new HTTPException(422, { message: `無法計算地點之間的路線（${destinations[actualOriginIdx].id} → ${destinations[entry.destinationIndex].id}）` })
        }
        const durationSeconds = parseInt(entry.duration.replace('s', ''), 10)
        newRows.push({
          a_point: destinations[actualOriginIdx].id,
          b_point: destinations[entry.destinationIndex].id,
          distance_from_a_to_b: String(entry.distanceMeters),
          time_from_a_to_b: String(Math.round(durationSeconds / 60)),
        })
      }
    }

    if (newRows.length > 0) await db.insert(infoBetweenTable).values(newRows)
  }

  // 7. 建立快照
  const location_snapshot = destinations.map((d, idx) => ({
    idx,
    db_id: d.id,
    name: d.name,
    lat: parseFloat(d.lat),
    lng: parseFloat(d.lng),
    time_window_start: (d.data as any)?.time_window_start ?? 0,
    time_window_end: (d.data as any)?.time_window_end ?? 1440,
    service_time: (d.data as any)?.service_time ?? 0,
    late_penalty: (d.data as any)?.late_penalty ?? null,
  }))
  const locIdxMap: Record<string, number> = Object.fromEntries(destinations.map((d, i) => [d.id, i]))

  const itemsByOrder = new Map<string, Array<{ sku: string; quantity: number }>>()
  for (const item of items) {
    if (!itemsByOrder.has(item.bento_order_id)) itemsByOrder.set(item.bento_order_id, [])
    itemsByOrder.get(item.bento_order_id)!.push({ sku: item.sku, quantity: item.quantity })
  }
  const bento_order_snapshot = bentoOrders.map(bo => ({
    order_id: bo.id,
    pickup_location_id: locIdxMap[bo.pickup_location_id],
    delivery_location_id: locIdxMap[bo.delivery_location_id],
    items: itemsByOrder.get(bo.id) ?? [],
    unserved_penalty: bo.unserved_penalty ?? null,
  }))

  const vehicle_snapshot = vehicles.map((v, idx) => ({
    idx,
    db_id: v.id,
    capacity: v.capacity,
    fixed_cost: (v.data as any)?.fixed_cost ?? 0,
  }))

  const [created] = await db.insert(orderTable).values({
    account_id,
    location_snapshot,
    bento_order_snapshot,
    vehicle_snapshot,
    data: body.data,
    comment_for_account: body.comment_for_account,
  }).returning()

  return c.json(created, 201)
})

orderRoutes.openapi(deleteOrderRoute, async (c) => {
  const db = createDb(c.env.DATABASE_URL)
  const account_id = c.get('account_id')
  const { id } = c.req.valid('param')
  const now = Math.floor(Date.now() / 1000)
  const [deleted] = await db.update(orderTable)
    .set({ status: 'deleted', updated_at: now })
    .where(and(
      eq(orderTable.id, id),
      eq(orderTable.account_id, account_id),
      ne(orderTable.status, 'deleted'),
    ))
    .returning()
  if (!deleted) throw new HTTPException(404, { message: '找不到資源' })
  return c.json({ ok: true as const }, 200)
})

orderRoutes.openapi(triggerComputeRoute, async (c) => {
  const db = createDb(c.env.DATABASE_URL)
  const account_id = c.get('account_id')
  const { id: order_id } = c.req.valid('param')
  const rawBody = await c.req.json().catch(() => ({}))
  const bodyResult = TriggerComputeBody.safeParse(rawBody)
  if (!bodyResult.success) throw new HTTPException(400, { message: '請求資料格式錯誤' })
  const body = bodyResult.data
  const now = Math.floor(Date.now() / 1000)

  const [order] = await db.select().from(orderTable)
    .where(and(
      eq(orderTable.id, order_id),
      eq(orderTable.account_id, account_id),
      ne(orderTable.status, 'deleted'),
    ))
    .limit(1)
  if (!order) throw new HTTPException(404, { message: '找不到訂單' })

  const [click] = await db.insert(computeOneClickTable).values({
    account_id,
    order_id,
    start_time: now,
    data: body.data,
    comment_for_account: body.comment_for_account,
  }).returning()

  const [compute] = await db.insert(computeTable).values({
    compute_one_click_id: click.id,
    compute_status: 'pending',
    start_time: now,
    algo_parameter: {
      endpoint: '/vrp/bento/v1/solve',
      ...(body.time_limit_seconds != null && { time_limit_seconds: body.time_limit_seconds }),
    },
  }).returning()

  const markFailed = (reason: string) =>
    db.update(computeTable)
      .set({ compute_status: 'failed', fail_reason: reason, updated_at: Math.floor(Date.now() / 1000) })
      .where(eq(computeTable.id, compute.id))

  const locationSnapshot = order.location_snapshot as Array<{
    idx: number; db_id: string; lat: number; lng: number
    time_window_start: number; time_window_end: number; service_time: number; late_penalty: number | null; name: string
  }>
  const bentoOrderSnapshot = order.bento_order_snapshot as Array<{
    order_id: string; pickup_location_id: number; delivery_location_id: number
    items: Array<{ sku: string; quantity: number }>; unserved_penalty: number | null
  }>
  const vehicleSnapshot = order.vehicle_snapshot as Array<{
    idx: number; db_id: string; capacity: number; fixed_cost: number
  }>

  const locationDbIds = locationSnapshot.map(l => l.db_id)
  const n = locationDbIds.length

  // 查距離矩陣
  const pairs = await db.select().from(infoBetweenTable)
    .where(and(
      inArray(infoBetweenTable.a_point, locationDbIds),
      inArray(infoBetweenTable.b_point, locationDbIds),
    ))

  if (pairs.length < n * (n - 1)) {
    await markFailed(`距離矩陣不完整，需要 ${n * (n - 1)} 筆，實際 ${pairs.length} 筆`)
    return c.json(compute, 202)
  }

  // 組 N×N 矩陣（使用 snapshot 的 idx 作為索引）
  const idxMap: Record<string, number> = Object.fromEntries(locationSnapshot.map(l => [l.db_id, l.idx]))
  const distMatrix = Array.from({ length: n }, () => Array<number>(n).fill(0))
  const timeMatrix = Array.from({ length: n }, () => Array<number>(n).fill(0))
  for (const p of pairs) {
    distMatrix[idxMap[p.a_point]][idxMap[p.b_point]] = Number(p.distance_from_a_to_b)
    timeMatrix[idxMap[p.a_point]][idxMap[p.b_point]] = Number(p.time_from_a_to_b)
  }

  // depot：找 is_depot 或用 idx=0
  const depotLocationId = locationSnapshot.find(l => (l as any).is_depot)?.idx ?? 0

  const vrpPayload = {
    compute_id: compute.id,
    depot_location_id: depotLocationId,
    locations: locationSnapshot.map(l => ({
      location_id: l.idx,
      name: l.name,
      lat: l.lat,
      lng: l.lng,
      time_window_start: l.time_window_start,
      time_window_end: l.time_window_end,
      service_time: l.service_time,
      ...(l.late_penalty != null && { late_penalty: l.late_penalty }),
    })),
    vehicles: vehicleSnapshot.map(v => ({
      vehicle_id: v.idx,
      capacity: v.capacity,
      fixed_cost: v.fixed_cost,
    })),
    orders: bentoOrderSnapshot.map(bo => ({
      order_id: bo.order_id,
      pickup_location_id: bo.pickup_location_id,
      delivery_location_id: bo.delivery_location_id,
      items: bo.items,
      ...(bo.unserved_penalty != null && { unserved_penalty: bo.unserved_penalty }),
    })),
    distance_matrix: distMatrix,
    time_matrix: timeMatrix,
    ...(body.time_limit_seconds != null && { time_limit_seconds: body.time_limit_seconds }),
  }

  const vrpUrl = `${c.env.vrp_api_python}/vrp/bento/v1/solve`
  const qstashPublishUrl = `${c.env.QSTASH_URL}/v2/publish/${vrpUrl}`

  try {
    const res = await fetch(qstashPublishUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${c.env.QSTASH_TOKEN}`,
        'Content-Type': 'application/json',
        'Upstash-Callback': `${c.env.API_BASE_URL}/internal/vrp-callback`,
        'Upstash-Retries': '0',
      },
      body: JSON.stringify(vrpPayload),
    })
    if (!res.ok) {
      const errText = await res.text().catch(() => `HTTP ${res.status}`)
      await markFailed(`QStash 排隊失敗: ${errText}`)
    }
  } catch (e: any) {
    await markFailed(`無法連線到 QStash: ${e.message}`)
  }

  return c.json(compute, 202)
})

orderRoutes.openapi(listOrderComputesRoute, async (c) => {
  const db = createDb(c.env.DATABASE_URL)
  const account_id = c.get('account_id')
  const { id: order_id } = c.req.valid('param')

  const [order] = await db.select({ id: orderTable.id }).from(orderTable)
    .where(and(eq(orderTable.id, order_id), eq(orderTable.account_id, account_id)))
    .limit(1)
  if (!order) throw new HTTPException(404, { message: '找不到資源' })

  const items = await db.select().from(computeTable)
    .innerJoin(computeOneClickTable, eq(computeTable.compute_one_click_id, computeOneClickTable.id))
    .where(and(
      eq(computeOneClickTable.order_id, order_id),
      eq(computeOneClickTable.account_id, account_id),
    ))
  return c.json(items.map(r => r.compute), 200)
})
