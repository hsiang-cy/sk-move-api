import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { HTTPException } from 'hono/http-exception'
import { and, eq, inArray, ne } from 'drizzle-orm'
import { createDb } from '../../../db/connect'
import {
  bento_order as bentoOrderTable,
  bento_order_item as bentoOrderItemTable,
  destination as destinationTable,
} from '../../../db/schema'
import type { ApiVariables } from '../middleware'
import { ErrorSchema, OkSchema, IdParam, StatusEnum, validationHook } from '../schemas'

type Bindings = { DATABASE_URL: string }
type Env = { Bindings: Bindings; Variables: ApiVariables }

// ── Schemas ────────────────────────────────────────────────────────────────────

const BentoOrderItemSchema = z.object({
  id: z.number().int(),
  bento_order_id: z.string().uuid(),
  sku: z.string(),
  quantity: z.number().int(),
}).openapi('BentoOrderItem')

export const BentoOrderSchema = z.object({
  id: z.string().uuid(),
  account_id: z.string().uuid(),
  status: StatusEnum,
  pickup_location_id: z.string().uuid(),
  delivery_location_id: z.string().uuid(),
  unserved_penalty: z.number().int().nullable(),
  comment_for_account: z.string().nullable(),
  data: z.any(),
  created_at: z.number().nullable(),
  updated_at: z.number().nullable(),
  items: z.array(BentoOrderItemSchema),
}).openapi('BentoOrder')

const CreateBentoOrderItemBody = z.object({
  sku: z.string().openapi({ example: '排骨便當' }),
  quantity: z.number().int().min(1).openapi({ example: 3 }),
})

export const CreateBentoOrderBody = z.object({
  pickup_location_id: z.string().uuid().openapi({ description: '取貨地點（餐廳）UUID' }),
  delivery_location_id: z.string().uuid().openapi({ description: '送貨地點（大樓）UUID' }),
  items: z.array(CreateBentoOrderItemBody).min(1, '至少需要 1 個品項').openapi({
    description: '訂單品項（SKU + 數量）',
  }),
  unserved_penalty: z.number().int().positive().nullable().optional().openapi({
    description: 'null = 必送；正整數 = 可選（跳過懲罰，公尺等效，實際成本 × 2）',
    example: null,
  }),
  comment_for_account: z.string().optional(),
  data: z.any().optional(),
}).openapi('CreateBentoOrderBody')

// ── Router ────────────────────────────────────────────────────────────────────

export const bentoOrderRoutes = new OpenAPIHono<Env>({ defaultHook: validationHook })

const tags = ['便當訂單']
const security = [{ Bearer: [] }]
const auth401 = { content: { 'application/json': { schema: ErrorSchema } }, description: '未授權' }
const notFound404 = { content: { 'application/json': { schema: ErrorSchema } }, description: '找不到資源' }

// ── Routes ────────────────────────────────────────────────────────────────────

const listBentoOrdersRoute = createRoute({
  method: 'get', path: '/', tags, summary: '取得所有便當訂單', security,
  responses: {
    200: { content: { 'application/json': { schema: z.array(BentoOrderSchema) } }, description: '便當訂單列表' },
    401: auth401,
  },
})

const getBentoOrderRoute = createRoute({
  method: 'get', path: '/{id}', tags, summary: '取得單一便當訂單', security,
  request: { params: IdParam },
  responses: {
    200: { content: { 'application/json': { schema: BentoOrderSchema } }, description: '便當訂單資料' },
    401: auth401,
    404: notFound404,
  },
})

const createBentoOrderRoute = createRoute({
  method: 'post', path: '/', tags, summary: '建立便當訂單', security,
  request: { body: { content: { 'application/json': { schema: CreateBentoOrderBody } }, required: true } },
  responses: {
    201: { content: { 'application/json': { schema: BentoOrderSchema } }, description: '建立成功' },
    400: { content: { 'application/json': { schema: ErrorSchema } }, description: '請求資料錯誤' },
    401: auth401,
    404: notFound404,
  },
})

const deleteBentoOrderRoute = createRoute({
  method: 'delete', path: '/{id}', tags, summary: '刪除便當訂單', security,
  request: { params: IdParam },
  responses: {
    200: { content: { 'application/json': { schema: OkSchema } }, description: '刪除成功' },
    401: auth401,
    404: notFound404,
  },
})

// ── Helper: 查詢單筆訂單並附帶品項 ────────────────────────────────────────────

async function fetchOrderWithItems(db: ReturnType<typeof createDb>, orderId: string, accountId: string) {
  const [order] = await db.select().from(bentoOrderTable)
    .where(and(
      eq(bentoOrderTable.id, orderId),
      eq(bentoOrderTable.account_id, accountId),
      ne(bentoOrderTable.status, 'deleted'),
    ))
    .limit(1)
  if (!order) return null

  const items = await db.select().from(bentoOrderItemTable)
    .where(eq(bentoOrderItemTable.bento_order_id, orderId))

  return { ...order, items }
}

// ── Handlers ──────────────────────────────────────────────────────────────────

bentoOrderRoutes.openapi(listBentoOrdersRoute, async (c) => {
  const db = createDb(c.env.DATABASE_URL)
  const account_id = c.get('account_id')

  const orders = await db.select().from(bentoOrderTable)
    .where(and(eq(bentoOrderTable.account_id, account_id), ne(bentoOrderTable.status, 'deleted')))

  if (orders.length === 0) return c.json([], 200)

  const orderIds = orders.map(o => o.id)
  const items = await db.select().from(bentoOrderItemTable)
    .where(inArray(bentoOrderItemTable.bento_order_id, orderIds))

  const itemsByOrder = new Map<string, typeof items>()
  for (const item of items) {
    if (!itemsByOrder.has(item.bento_order_id)) itemsByOrder.set(item.bento_order_id, [])
    itemsByOrder.get(item.bento_order_id)!.push(item)
  }

  return c.json(orders.map(o => ({ ...o, items: itemsByOrder.get(o.id) ?? [] })), 200)
})

bentoOrderRoutes.openapi(getBentoOrderRoute, async (c) => {
  const db = createDb(c.env.DATABASE_URL)
  const account_id = c.get('account_id')
  const { id } = c.req.valid('param')

  const result = await fetchOrderWithItems(db, id, account_id)
  if (!result) throw new HTTPException(404, { message: '找不到資源' })
  return c.json(result, 200)
})

bentoOrderRoutes.openapi(createBentoOrderRoute, async (c) => {
  const db = createDb(c.env.DATABASE_URL)
  const account_id = c.get('account_id')
  const body = c.req.valid('json')

  if (body.pickup_location_id === body.delivery_location_id) {
    throw new HTTPException(400, { message: '取貨地點與送貨地點不能相同' })
  }

  // 驗證兩個地點都屬於此帳號
  const locationIds = [body.pickup_location_id, body.delivery_location_id]
  const locs = await db.select({ id: destinationTable.id }).from(destinationTable)
    .where(and(
      inArray(destinationTable.id, locationIds),
      eq(destinationTable.account_id, account_id),
      ne(destinationTable.status, 'deleted'),
    ))
  if (locs.length !== 2) {
    throw new HTTPException(404, { message: '地點不存在或無存取權限' })
  }

  const [created] = await db.insert(bentoOrderTable).values({
    account_id,
    pickup_location_id: body.pickup_location_id,
    delivery_location_id: body.delivery_location_id,
    unserved_penalty: body.unserved_penalty ?? null,
    comment_for_account: body.comment_for_account,
    data: body.data,
  }).returning()

  await db.insert(bentoOrderItemTable).values(
    body.items.map(item => ({
      bento_order_id: created.id,
      sku: item.sku,
      quantity: item.quantity,
    }))
  )

  const result = await fetchOrderWithItems(db, created.id, account_id)
  return c.json(result!, 201)
})

bentoOrderRoutes.openapi(deleteBentoOrderRoute, async (c) => {
  const db = createDb(c.env.DATABASE_URL)
  const account_id = c.get('account_id')
  const { id } = c.req.valid('param')
  const now = Math.floor(Date.now() / 1000)

  const [deleted] = await db.update(bentoOrderTable)
    .set({ status: 'deleted', updated_at: now })
    .where(and(
      eq(bentoOrderTable.id, id),
      eq(bentoOrderTable.account_id, account_id),
      ne(bentoOrderTable.status, 'deleted'),
    ))
    .returning()
  if (!deleted) throw new HTTPException(404, { message: '找不到資源' })
  return c.json({ ok: true as const }, 200)
})
