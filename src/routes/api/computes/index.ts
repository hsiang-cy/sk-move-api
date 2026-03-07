import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { HTTPException } from 'hono/http-exception'
import { and, asc, eq, getTableColumns } from 'drizzle-orm'
import { createDb } from '#/db/connect'
import {
  compute as computeTable,
  compute_one_click as computeOneClickTable,
  route as routeTable,
  route_stop as routeStopTable,
  vehicle as vehicleTable,
  destination as destinationTable,
} from '../../../db/schema'
import type { ApiVariables } from '../middleware'
import { ErrorSchema, IdParam, StatusEnum, ComputeStatusEnum, validationHook } from '../schemas'

type Bindings = { DATABASE_URL: string }
type Env = { Bindings: Bindings; Variables: ApiVariables }

// Schemas  ────────────────

const _computeFields = {
  id: z.string().uuid(),
  compute_one_click_id: z.string().uuid(),
  status: StatusEnum,
  compute_status: ComputeStatusEnum,
  start_time: z.number().nullable(),
  end_time: z.number().nullable(),
  fail_reason: z.string().nullable(),
  algo_parameter: z.any(),
  data: z.any(),
  comment_for_account: z.string().nullable(),
  created_at: z.number().nullable(),
  updated_at: z.number().nullable(),
}

export const ComputeSchema = z.object(_computeFields).openapi('Compute')

const RouteStopSchema = z.object({
  id: z.number().int(),
  route_id: z.string().uuid(),
  destination_id: z.string().uuid(),
  sequence: z.number().int(),
  arrival_time: z.number().int(),
  action: z.string(),
  bento_order_ids: z.any(),
  created_at: z.number().nullable(),
  destination: z.any().nullable(),
}).openapi('RouteStop')

const RouteWithStopsSchema = z.object({
  id: z.string().uuid(),
  compute_id: z.string().uuid(),
  vehicle_id: z.string().uuid(),
  status: StatusEnum,
  total_distance: z.number().int(),
  total_time: z.number().int(),
  total_load: z.number().int(),
  created_at: z.number().nullable(),
  vehicle: z.any().nullable(),
  stops: z.array(RouteStopSchema),
}).openapi('RouteWithStops')

export const ComputeWithRoutesSchema = z.object({
  ..._computeFields,
  routes: z.array(RouteWithStopsSchema),
}).openapi('ComputeWithRoutes')

// Router  ────────────────

export const computeRoutes = new OpenAPIHono<Env>({ defaultHook: validationHook })

const getComputeRoute = createRoute({
  method: 'get', path: '/{id}',
  tags: ['計算任務'],
  summary: '取得計算任務及路線結果',
  security: [{ Bearer: [] }],
  request: { params: IdParam },
  responses: {
    200: { content: { 'application/json': { schema: ComputeWithRoutesSchema } }, description: '計算任務資料（含路線）' },
    401: { content: { 'application/json': { schema: ErrorSchema } }, description: '未授權' },
    404: { content: { 'application/json': { schema: ErrorSchema } }, description: '找不到資源' },
  },
})

computeRoutes.openapi(getComputeRoute, async (c) => {
  const db = createDb(c.env.DATABASE_URL)
  const account_id = c.get('account_id')
  const { id: compute_id } = c.req.valid('param')

  const [compute] = await db.select(getTableColumns(computeTable))
    .from(computeTable)
    .innerJoin(computeOneClickTable, eq(computeTable.compute_one_click_id, computeOneClickTable.id))
    .where(and(
      eq(computeTable.id, compute_id),
      eq(computeOneClickTable.account_id, account_id),
    ))
    .limit(1)
  if (!compute) throw new HTTPException(404, { message: '找不到資源' })

  const routes = await db.select().from(routeTable).where(eq(routeTable.compute_id, compute_id))

  const routesWithDetails = await Promise.all(
    routes.map(async (route) => {
      const [vehicle] = await db.select().from(vehicleTable)
        .where(eq(vehicleTable.id, route.vehicle_id)).limit(1)

      const stops = await db.select().from(routeStopTable)
        .where(eq(routeStopTable.route_id, route.id))
        .orderBy(asc(routeStopTable.sequence))

      const stopsWithDest = await Promise.all(
        stops.map(async (stop) => {
          const [destination] = await db.select().from(destinationTable)
            .where(eq(destinationTable.id, stop.destination_id)).limit(1)
          return { ...stop, destination: destination ?? null }
        })
      )

      return { ...route, vehicle: vehicle ?? null, stops: stopsWithDest }
    })
  )

  return c.json({ ...compute, routes: routesWithDetails }, 200)
})
