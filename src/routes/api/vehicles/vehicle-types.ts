import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { HTTPException } from 'hono/http-exception'
import { and, eq, ne } from 'drizzle-orm'
import { createDb } from '#/db/connect'
import { custom_vehicle_type as vehicleTypeTable } from '../../../db/schema'
import type { ApiVariables } from '../middleware'
import { ErrorSchema, OkSchema, IdParam, StatusEnum, validationHook } from '../schemas'

type Bindings = { DATABASE_URL: string }
type Env = { Bindings: Bindings; Variables: ApiVariables }

// Schemas  ────────────────

export const VehicleTypeSchema = z.object({
  id: z.string().uuid(),
  account_id: z.string().uuid(),
  status: StatusEnum,
  name: z.string(),
  capacity: z.number().int(),
  data: z.any(),
  comment_for_account: z.string().nullable(),
  created_at: z.number().nullable(),
  updated_at: z.number().nullable(),
}).openapi('VehicleType')

export const CreateVehicleTypeBody = z.object({
  name: z.string().openapi({ example: '小型貨車' }),
  capacity: z.number().int().default(0),
  data: z.any().optional(),
  comment_for_account: z.string().optional(),
}).openapi('CreateVehicleTypeBody')

export const UpdateVehicleTypeBody = z.object({
  name: z.string().optional(),
  capacity: z.number().int().optional(),
  data: z.any().optional(),
  comment_for_account: z.string().optional(),
}).openapi('UpdateVehicleTypeBody')

// Router  ────────────────

export const vehicleTypeRoutes = new OpenAPIHono<Env>({ defaultHook: validationHook })

const tags = ['車輛類型']
const security = [{ Bearer: [] }]
const auth401 = { content: { 'application/json': { schema: ErrorSchema } }, description: '未授權' }
const notFound404 = { content: { 'application/json': { schema: ErrorSchema } }, description: '找不到資源' }

// Routes  ────────────────

const listVehicleTypesRoute = createRoute({
  method: 'get', path: '/', tags, summary: '取得所有車輛類型', security,
  responses: {
    200: { content: { 'application/json': { schema: z.array(VehicleTypeSchema) } }, description: '車輛類型列表' },
    401: auth401,
  },
})

const getVehicleTypeRoute = createRoute({
  method: 'get', path: '/{id}', tags, summary: '取得單一車輛類型', security,
  request: { params: IdParam },
  responses: {
    200: { content: { 'application/json': { schema: VehicleTypeSchema } }, description: '車輛類型資料' },
    401: auth401,
    404: notFound404,
  },
})

const createVehicleTypeRoute = createRoute({
  method: 'post', path: '/', tags, summary: '建立車輛類型', security,
  request: { body: { content: { 'application/json': { schema: CreateVehicleTypeBody } }, required: true } },
  responses: {
    201: { content: { 'application/json': { schema: VehicleTypeSchema } }, description: '建立成功' },
    400: { content: { 'application/json': { schema: ErrorSchema } }, description: '請求資料錯誤' },
    401: auth401,
  },
})

const updateVehicleTypeRoute = createRoute({
  method: 'put', path: '/{id}', tags, summary: '更新車輛類型', security,
  request: {
    params: IdParam,
    body: { content: { 'application/json': { schema: UpdateVehicleTypeBody } }, required: true },
  },
  responses: {
    200: { content: { 'application/json': { schema: VehicleTypeSchema } }, description: '更新後的車輛類型資料' },
    401: auth401,
    404: notFound404,
  },
})

const deleteVehicleTypeRoute = createRoute({
  method: 'delete', path: '/{id}', tags, summary: '刪除車輛類型', security,
  request: { params: IdParam },
  responses: {
    200: { content: { 'application/json': { schema: OkSchema } }, description: '刪除成功' },
    401: auth401,
    404: notFound404,
  },
})

// Handlers  ──────────────

vehicleTypeRoutes.openapi(listVehicleTypesRoute, async (c) => {
  const db = createDb(c.env.DATABASE_URL)
  const account_id = c.get('account_id')
  const items = await db.select().from(vehicleTypeTable)
    .where(and(eq(vehicleTypeTable.account_id, account_id), ne(vehicleTypeTable.status, 'deleted')))
  return c.json(items, 200)
})

vehicleTypeRoutes.openapi(getVehicleTypeRoute, async (c) => {
  const db = createDb(c.env.DATABASE_URL)
  const account_id = c.get('account_id')
  const { id } = c.req.valid('param')
  const [item] = await db.select().from(vehicleTypeTable)
    .where(and(
      eq(vehicleTypeTable.id, id),
      eq(vehicleTypeTable.account_id, account_id),
      ne(vehicleTypeTable.status, 'deleted'),
    ))
    .limit(1)
  if (!item) throw new HTTPException(404, { message: '找不到資源' })
  return c.json(item, 200)
})

vehicleTypeRoutes.openapi(createVehicleTypeRoute, async (c) => {
  const db = createDb(c.env.DATABASE_URL)
  const account_id = c.get('account_id')
  const body = c.req.valid('json')
  const [created] = await db.insert(vehicleTypeTable).values({
    account_id,
    name: body.name,
    capacity: body.capacity ?? 0,
    data: body.data,
    comment_for_account: body.comment_for_account,
  }).returning()
  return c.json(created, 201)
})

vehicleTypeRoutes.openapi(updateVehicleTypeRoute, async (c) => {
  const db = createDb(c.env.DATABASE_URL)
  const account_id = c.get('account_id')
  const { id } = c.req.valid('param')
  const body = c.req.valid('json')
  const now = Math.floor(Date.now() / 1000)
  const [updated] = await db.update(vehicleTypeTable)
    .set({
      ...(body.name !== undefined && { name: body.name }),
      ...(body.capacity !== undefined && { capacity: body.capacity }),
      ...(body.data !== undefined && { data: body.data }),
      ...(body.comment_for_account !== undefined && { comment_for_account: body.comment_for_account }),
      updated_at: now,
    })
    .where(and(
      eq(vehicleTypeTable.id, id),
      eq(vehicleTypeTable.account_id, account_id),
      ne(vehicleTypeTable.status, 'deleted'),
    ))
    .returning()
  if (!updated) throw new HTTPException(404, { message: '找不到資源' })
  return c.json(updated, 200)
})

vehicleTypeRoutes.openapi(deleteVehicleTypeRoute, async (c) => {
  const db = createDb(c.env.DATABASE_URL)
  const account_id = c.get('account_id')
  const { id } = c.req.valid('param')
  const now = Math.floor(Date.now() / 1000)
  const [deleted] = await db.update(vehicleTypeTable)
    .set({ status: 'deleted', updated_at: now })
    .where(and(
      eq(vehicleTypeTable.id, id),
      eq(vehicleTypeTable.account_id, account_id),
      ne(vehicleTypeTable.status, 'deleted'),
    ))
    .returning()
  if (!deleted) throw new HTTPException(404, { message: '找不到資源' })
  return c.json({ ok: true as const }, 200)
})
