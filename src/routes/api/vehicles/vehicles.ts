import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { HTTPException } from 'hono/http-exception'
import { and, eq, ne } from 'drizzle-orm'
import { createDb } from '../../../db/connect'
import { vehicle as vehicleTable } from '../../../db/schema'
import type { ApiVariables } from '../middleware'
import { ErrorSchema, OkSchema, IdParam, StatusEnum, validationHook } from '../schemas'

type Bindings = { DATABASE_URL: string }
type Env = { Bindings: Bindings; Variables: ApiVariables }

// Schemas  ────────────────

export const VehicleSchema = z.object({
  id: z.string().uuid(),
  account_id: z.string().uuid(),
  status: StatusEnum,
  vehicle_number: z.string(),
  vehicle_type: z.string().uuid(),
  depot_id: z.string().uuid().nullable(),
  data: z.any(),
  comment_for_account: z.string().nullable(),
  created_at: z.number().nullable(),
  updated_at: z.number().nullable(),
}).openapi('Vehicle')

export const CreateVehicleBody = z.object({
  vehicle_number: z.string().openapi({ example: 'ABC-1234' }),
  vehicle_type: z.string().uuid().openapi({ description: '車輛類型 UUID' }),
  depot_id: z.string().uuid().optional().openapi({ description: '預設出發地點 UUID' }),
  data: z.any().optional(),
  comment_for_account: z.string().optional(),
}).openapi('CreateVehicleBody')

export const UpdateVehicleBody = z.object({
  vehicle_number: z.string().optional(),
  vehicle_type: z.string().uuid().optional(),
  depot_id: z.string().uuid().nullable().optional(),
  data: z.any().optional(),
  comment_for_account: z.string().optional(),
}).openapi('UpdateVehicleBody')

// Router  ────────────────

export const vehicleRoutes = new OpenAPIHono<Env>({ defaultHook: validationHook })

const tags = ['車輛']
const security = [{ Bearer: [] }]
const auth401 = { content: { 'application/json': { schema: ErrorSchema } }, description: '未授權' }
const notFound404 = { content: { 'application/json': { schema: ErrorSchema } }, description: '找不到資源' }

// Routes  ────────────────

const listVehiclesRoute = createRoute({
  method: 'get', path: '/', tags, summary: '取得所有車輛', security,
  responses: {
    200: { content: { 'application/json': { schema: z.array(VehicleSchema) } }, description: '車輛列表' },
    401: auth401,
  },
})

const getVehicleRoute = createRoute({
  method: 'get', path: '/{id}', tags, summary: '取得單一車輛', security,
  request: { params: IdParam },
  responses: {
    200: { content: { 'application/json': { schema: VehicleSchema } }, description: '車輛資料' },
    401: auth401,
    404: notFound404,
  },
})

const createVehicleRoute = createRoute({
  method: 'post', path: '/', tags, summary: '建立車輛', security,
  request: { body: { content: { 'application/json': { schema: CreateVehicleBody } }, required: true } },
  responses: {
    201: { content: { 'application/json': { schema: VehicleSchema } }, description: '建立成功' },
    400: { content: { 'application/json': { schema: ErrorSchema } }, description: '請求資料錯誤' },
    401: auth401,
  },
})

const updateVehicleRoute = createRoute({
  method: 'put', path: '/{id}', tags, summary: '更新車輛', security,
  request: {
    params: IdParam,
    body: { content: { 'application/json': { schema: UpdateVehicleBody } }, required: true },
  },
  responses: {
    200: { content: { 'application/json': { schema: VehicleSchema } }, description: '更新後的車輛資料' },
    401: auth401,
    404: notFound404,
  },
})

const deleteVehicleRoute = createRoute({
  method: 'delete', path: '/{id}', tags, summary: '刪除車輛', security,
  request: { params: IdParam },
  responses: {
    200: { content: { 'application/json': { schema: OkSchema } }, description: '刪除成功' },
    401: auth401,
    404: notFound404,
  },
})

// Handlers  ──────────────

vehicleRoutes.openapi(listVehiclesRoute, async (c) => {
  const db = createDb(c.env.DATABASE_URL)
  const account_id = c.get('account_id')
  const items = await db.select().from(vehicleTable)
    .where(and(eq(vehicleTable.account_id, account_id), ne(vehicleTable.status, 'deleted')))
  return c.json(items, 200)
})

vehicleRoutes.openapi(getVehicleRoute, async (c) => {
  const db = createDb(c.env.DATABASE_URL)
  const account_id = c.get('account_id')
  const { id } = c.req.valid('param')
  const [item] = await db.select().from(vehicleTable)
    .where(and(
      eq(vehicleTable.id, id),
      eq(vehicleTable.account_id, account_id),
      ne(vehicleTable.status, 'deleted'),
    ))
    .limit(1)
  if (!item) throw new HTTPException(404, { message: '找不到資源' })
  return c.json(item, 200)
})

vehicleRoutes.openapi(createVehicleRoute, async (c) => {
  const db = createDb(c.env.DATABASE_URL)
  const account_id = c.get('account_id')
  const body = c.req.valid('json')
  const [created] = await db.insert(vehicleTable).values({
    account_id,
    vehicle_number: body.vehicle_number,
    vehicle_type: body.vehicle_type,
    depot_id: body.depot_id,
    data: body.data,
    comment_for_account: body.comment_for_account,
  }).returning()
  return c.json(created, 201)
})

vehicleRoutes.openapi(updateVehicleRoute, async (c) => {
  const db = createDb(c.env.DATABASE_URL)
  const account_id = c.get('account_id')
  const { id } = c.req.valid('param')
  const body = c.req.valid('json')
  const now = Math.floor(Date.now() / 1000)
  const [updated] = await db.update(vehicleTable)
    .set({
      ...(body.vehicle_number !== undefined && { vehicle_number: body.vehicle_number }),
      ...(body.vehicle_type !== undefined && { vehicle_type: body.vehicle_type }),
      ...(body.depot_id !== undefined && { depot_id: body.depot_id }),
      ...(body.data !== undefined && { data: body.data }),
      ...(body.comment_for_account !== undefined && { comment_for_account: body.comment_for_account }),
      updated_at: now,
    })
    .where(and(
      eq(vehicleTable.id, id),
      eq(vehicleTable.account_id, account_id),
      ne(vehicleTable.status, 'deleted'),
    ))
    .returning()
  if (!updated) throw new HTTPException(404, { message: '找不到資源' })
  return c.json(updated, 200)
})

vehicleRoutes.openapi(deleteVehicleRoute, async (c) => {
  const db = createDb(c.env.DATABASE_URL)
  const account_id = c.get('account_id')
  const { id } = c.req.valid('param')
  const now = Math.floor(Date.now() / 1000)
  const [deleted] = await db.update(vehicleTable)
    .set({ status: 'deleted', updated_at: now })
    .where(and(
      eq(vehicleTable.id, id),
      eq(vehicleTable.account_id, account_id),
      ne(vehicleTable.status, 'deleted'),
    ))
    .returning()
  if (!deleted) throw new HTTPException(404, { message: '找不到資源' })
  return c.json({ ok: true as const }, 200)
})
