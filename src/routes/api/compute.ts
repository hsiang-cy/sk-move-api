import { Hono } from 'hono'
import { and, asc, eq } from 'drizzle-orm'
import { createDb } from '../../db/connect'
import {
  compute as computeTable,
  route as routeTable,
  route_stop as routeStopTable,
  vehicle as vehicleTable,
  destination as destinationTable,
} from '../../db/schema'
import type { ApiVariables } from './middleware'

type Bindings = { DATABASE_URL: string }
type Env = { Bindings: Bindings; Variables: ApiVariables }

export const computeRoutes = new Hono<Env>()

computeRoutes.get('/:id', async (c) => {
  const db = createDb(c.env.DATABASE_URL)
  const account_id = c.get('account_id')
  const compute_id = parseInt(c.req.param('id'))

  const [compute] = await db.select().from(computeTable)
    .where(and(eq(computeTable.id, compute_id), eq(computeTable.account_id, account_id)))
    .limit(1)
  if (!compute) return c.json({ error: 'Not found' }, 404)

  // 路線與站點
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

  return c.json({ ...compute, routes: routesWithDetails })
})
