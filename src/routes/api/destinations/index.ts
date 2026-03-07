import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { HTTPException } from 'hono/http-exception'
import { and, eq, ne } from 'drizzle-orm'
import { createDb } from '../../../db/connect'
import { destination as destinationTable } from '../../../db/schema'
import type { ApiVariables } from '../middleware'
import { ErrorSchema, OkSchema, IdParam, StatusEnum, validationHook } from '../schemas'

type Bindings = { DATABASE_URL: string }
type Env = { Bindings: Bindings; Variables: ApiVariables }

// ── Schemas ────────────────────────────────────────────────────────────────────

export const DestinationSchema = z.object({
  id: z.string().uuid(),
  account_id: z.string().uuid(),
  status: StatusEnum,
  name: z.string(),
  address: z.string(),
  lat: z.string(),
  lng: z.string(),
  data: z.any(),
  comment_for_account: z.string().nullable(),
  created_at: z.number().nullable(),
  updated_at: z.number().nullable(),
}).openapi('Destination')

export const CreateDestinationBody = z.object({
  name: z.string().openapi({ example: '台北車站' }),
  address: z.string().openapi({ example: '台北市中正區北平西路3號' }),
  lat: z.string().openapi({ example: '25.0478' }),
  lng: z.string().openapi({ example: '121.5169' }),
  data: z.any().optional(),
  comment_for_account: z.string().optional(),
}).openapi('CreateDestinationBody')

export const UpdateDestinationBody = z.object({
  name: z.string().optional(),
  address: z.string().optional(),
  lat: z.string().optional(),
  lng: z.string().optional(),
  data: z.any().optional(),
  comment_for_account: z.string().optional(),
}).openapi('UpdateDestinationBody')

// ── Router ────────────────────────────────────────────────────────────────────

export const destinationRoutes = new OpenAPIHono<Env>({ defaultHook: validationHook })

const tags = ['地點']
const security = [{ Bearer: [] }]
const auth401 = { content: { 'application/json': { schema: ErrorSchema } }, description: '未授權' }
const notFound404 = { content: { 'application/json': { schema: ErrorSchema } }, description: '找不到資源' }

// ── Routes ────────────────────────────────────────────────────────────────────

const listDestinationsRoute = createRoute({
  method: 'get', path: '/', tags, summary: '取得所有地點', security,
  responses: {
    200: { content: { 'application/json': { schema: z.array(DestinationSchema) } }, description: '地點列表' },
    401: auth401,
  },
})

const getDestinationRoute = createRoute({
  method: 'get', path: '/{id}', tags, summary: '取得單一地點', security,
  request: { params: IdParam },
  responses: {
    200: { content: { 'application/json': { schema: DestinationSchema } }, description: '地點資料' },
    401: auth401,
    404: notFound404,
  },
})

const createDestinationRoute = createRoute({
  method: 'post', path: '/', tags, summary: '建立地點', security,
  request: { body: { content: { 'application/json': { schema: CreateDestinationBody } }, required: true } },
  responses: {
    201: { content: { 'application/json': { schema: DestinationSchema } }, description: '建立成功' },
    400: { content: { 'application/json': { schema: ErrorSchema } }, description: '請求資料錯誤' },
    401: auth401,
  },
})

const updateDestinationRoute = createRoute({
  method: 'put', path: '/{id}', tags, summary: '更新地點', security,
  request: {
    params: IdParam,
    body: { content: { 'application/json': { schema: UpdateDestinationBody } }, required: true },
  },
  responses: {
    200: { content: { 'application/json': { schema: DestinationSchema } }, description: '更新後的地點資料' },
    401: auth401,
    404: notFound404,
  },
})

const deleteDestinationRoute = createRoute({
  method: 'delete', path: '/{id}', tags, summary: '刪除地點', security,
  request: { params: IdParam },
  responses: {
    200: { content: { 'application/json': { schema: OkSchema } }, description: '刪除成功' },
    401: auth401,
    404: notFound404,
  },
})

// ── Handlers ──────────────────────────────────────────────────────────────────

destinationRoutes.openapi(listDestinationsRoute, async (c) => {
  const db = createDb(c.env.DATABASE_URL)
  const account_id = c.get('account_id')
  const items = await db.select().from(destinationTable)
    .where(and(eq(destinationTable.account_id, account_id), ne(destinationTable.status, 'deleted')))
  return c.json(items, 200)
})

destinationRoutes.openapi(getDestinationRoute, async (c) => {
  const db = createDb(c.env.DATABASE_URL)
  const account_id = c.get('account_id')
  const { id } = c.req.valid('param')
  const [item] = await db.select().from(destinationTable)
    .where(and(
      eq(destinationTable.id, id),
      eq(destinationTable.account_id, account_id),
      ne(destinationTable.status, 'deleted'),
    ))
    .limit(1)
  if (!item) throw new HTTPException(404, { message: '找不到資源' })
  return c.json(item, 200)
})

destinationRoutes.openapi(createDestinationRoute, async (c) => {
  const db = createDb(c.env.DATABASE_URL)
  const account_id = c.get('account_id')
  const body = c.req.valid('json')
  const [created] = await db.insert(destinationTable).values({
    account_id,
    name: body.name,
    address: body.address,
    lat: body.lat,
    lng: body.lng,
    data: body.data,
    comment_for_account: body.comment_for_account,
  }).returning()
  return c.json(created, 201)
})

destinationRoutes.openapi(updateDestinationRoute, async (c) => {
  const db = createDb(c.env.DATABASE_URL)
  const account_id = c.get('account_id')
  const { id } = c.req.valid('param')
  const body = c.req.valid('json')
  const now = Math.floor(Date.now() / 1000)
  const [updated] = await db.update(destinationTable)
    .set({
      ...(body.name !== undefined && { name: body.name }),
      ...(body.address !== undefined && { address: body.address }),
      ...(body.lat !== undefined && { lat: body.lat }),
      ...(body.lng !== undefined && { lng: body.lng }),
      ...(body.data !== undefined && { data: body.data }),
      ...(body.comment_for_account !== undefined && { comment_for_account: body.comment_for_account }),
      updated_at: now,
    })
    .where(and(
      eq(destinationTable.id, id),
      eq(destinationTable.account_id, account_id),
      ne(destinationTable.status, 'deleted'),
    ))
    .returning()
  if (!updated) throw new HTTPException(404, { message: '找不到資源' })
  return c.json(updated, 200)
})

destinationRoutes.openapi(deleteDestinationRoute, async (c) => {
  const db = createDb(c.env.DATABASE_URL)
  const account_id = c.get('account_id')
  const { id } = c.req.valid('param')
  const now = Math.floor(Date.now() / 1000)
  const [deleted] = await db.update(destinationTable)
    .set({ status: 'deleted', updated_at: now })
    .where(and(
      eq(destinationTable.id, id),
      eq(destinationTable.account_id, account_id),
      ne(destinationTable.status, 'deleted'),
    ))
    .returning()
  if (!deleted) throw new HTTPException(404, { message: '找不到資源' })
  return c.json({ ok: true as const }, 200)
})
