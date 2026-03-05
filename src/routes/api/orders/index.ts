import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { HTTPException } from 'hono/http-exception'
import { and, eq, getTableColumns, inArray, ne } from 'drizzle-orm'
import { createDb } from '../../../db/connect'
import {
  order as orderTable,
  compute as computeTable,
  compute_one_click as computeOneClickTable,
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
  vrp_api_rust: string
  API_BASE_URL: string
  GOOGLE_ROUTES_API_KEY: string
  QSTASH_URL: string
  QSTASH_TOKEN: string
}
type Env = { Bindings: Bindings; Variables: ApiVariables }

// ── Schemas ────────────────────────────────────────────────────────────────────

export const OrderSchema = z.object({
  id: z.number().int(),
  account_id: z.number().int(),
  status: StatusEnum,
  data: z.any(),
  destination_snapshot: z.any(),
  vehicle_snapshot: z.any(),
  comment_for_account: z.string().nullable(),
  created_at: z.number().nullable(),
  updated_at: z.number().nullable(),
}).openapi('Order')

export const CreateOrderBody = z.object({
  destination_ids: z.array(z.number().int()).min(2, '至少需要 2 個地點').openapi({
    description: '地點 ID 陣列（至少 2 個）',
    example: [1, 2, 3],
  }),
  vehicle_ids: z.array(z.number().int()).min(1, '至少需要 1 輛車輛').openapi({
    description: '車輛 ID 陣列（至少 1 輛）',
    example: [1],
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
  method: 'post', path: '/', tags, summary: '建立訂單', security,
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

  const destination_ids: number[] = body.destination_ids
  const vehicle_ids: number[] = body.vehicle_ids

  // 查出地點（驗證所有權）
  const destinations = await db.select().from(destinationTable)
    .where(and(
      inArray(destinationTable.id, destination_ids),
      eq(destinationTable.account_id, account_id),
      ne(destinationTable.status, 'deleted'),
    ))
  if (destinations.length !== destination_ids.length) {
    throw new HTTPException(404, { message: '部分地點不存在或無存取權限' })
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
    throw new HTTPException(404, { message: '部分車輛不存在或無存取權限' })
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

  // 補齊缺少的兩點距離快取
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
        throw new HTTPException(502, { message: `Google Routes API 發生錯誤：${response.status}` })
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
          throw new HTTPException(422, { message: `無法計算地點之間的路線（${destIds[entry.originIndex]} → ${destIds[entry.destinationIndex]}）` })
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
      endpoint: '/vrp/solve',
      ...(body.time_limit_seconds != null && { time_limit_seconds: body.time_limit_seconds }),
    },
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

  const depotIndex = Math.max(0, destinations.findIndex((d: any) => d.is_depot))

  const vrpPayload = {
    compute_id: compute.id,
    locations: destinations.map((d: any) => ({
      id: d.id,
      name: d.name ?? '',
      lat: parseFloat(d.lat),
      lng: parseFloat(d.lng),
      pickup: d.pickup ?? 0,
      delivery: d.delivery ?? 0,
      service_time: d.service_time ?? 0,
      tw_start: d.time_window_start ?? 0,
      tw_end: d.time_window_end ?? 1440,
      ...(d.unserved_penalty != null && { unserved_penalty: d.unserved_penalty }),
      ...(d.late_penalty != null && { late_penalty: d.late_penalty }),
      ...(d.allowed_vehicle_ids?.length && { allowed_vehicle_ids: d.allowed_vehicle_ids }),
    })),
    vehicles: vehicles.map((v: any) => ({
      id: v.id,
      capacity: v.capacity ?? 0,
      fixed_cost: v.fixed_cost ?? 0,
      start_location_index: v.start_location_index ?? depotIndex,
      ...(v.max_duration_minutes != null && { max_duration_minutes: v.max_duration_minutes }),
    })),
    distance_matrix: distMatrix,
    time_matrix: timeMatrix,
    ...(body.time_limit_seconds != null && { time_limit_seconds: body.time_limit_seconds }),
  }

  // 發佈到 QStash，由 QStash 呼叫 Rust VRP API 並回呼 /internal/vrp-callback
  const rustApiUrl = `${c.env.vrp_api_python}/vrp/solve`
  const qstashPublishUrl = `${c.env.QSTASH_URL}/v2/publish/${rustApiUrl}`

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

  const items = await db.select(getTableColumns(computeTable))
    .from(computeTable)
    .innerJoin(computeOneClickTable, eq(computeTable.compute_one_click_id, computeOneClickTable.id))
    .where(and(
      eq(computeOneClickTable.order_id, order_id),
      eq(computeOneClickTable.account_id, account_id),
    ))
  return c.json(items, 200)
})
