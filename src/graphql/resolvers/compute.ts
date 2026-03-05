import { and, asc, eq, getTableColumns } from 'drizzle-orm'
import {
  compute as computeTable,
  compute_one_click as computeOneClickTable,
  route as routeTable,
  route_stop as routeStopTable,
  vehicle as vehicleTable,
  destination as destinationTable,
} from '../../db/schema'
import { requireAuth, type Context } from '../context'

export const computeTypeDefs = /* GraphQL */ `
  type Compute {
    id:                    ID!
    compute_one_click_id:  Int!
    status:                Status!
    compute_status:        ComputeStatus!
    start_time:            Float
    end_time:              Float
    fail_reason:           String
    algo_parameter:        JSON
    data:                  JSON
    created_at:            Float
    updated_at:            Float
    comment_for_account:   String
    routes:                [Route!]!
  }

  type Route {
    id:             ID!
    compute_id:     Int!
    vehicle_id:     Int!
    status:         Status!
    total_distance: Int!
    total_time:     Int!
    total_load:     Int!
    created_at:     Float
    vehicle:        Vehicle
    stops:          [RouteStop!]!
  }

  type RouteStop {
    id:             ID!
    route_id:       Int!
    destination_id: Int!
    sequence:       Int!
    arrival_time:   Int!
    demand:         Int!
    created_at:     Float
    destination:    Destination
  }

  extend type Query {
    computes(orderId: ID, status: ComputeStatus): [Compute!]!
    compute(id: ID!): Compute
  }
`

export const computeResolvers = {
  Query: {
    computes: async (_: any, args: { orderId?: string; status?: string }, { db, user }: Context) => {
      requireAuth(user)
      const conditions: any[] = [eq(computeOneClickTable.account_id, user!.account_id)]
      if (args.orderId) conditions.push(eq(computeOneClickTable.order_id, parseInt(args.orderId)))
      if (args.status) conditions.push(eq(computeTable.compute_status, args.status as any))
      return db.select(getTableColumns(computeTable))
        .from(computeTable)
        .innerJoin(computeOneClickTable, eq(computeTable.compute_one_click_id, computeOneClickTable.id))
        .where(and(...conditions))
    },
    compute: async (_: any, args: { id: string }, { db, user }: Context) => {
      requireAuth(user)
      const [found] = await db.select(getTableColumns(computeTable))
        .from(computeTable)
        .innerJoin(computeOneClickTable, eq(computeTable.compute_one_click_id, computeOneClickTable.id))
        .where(and(
          eq(computeTable.id, parseInt(args.id)),
          eq(computeOneClickTable.account_id, user!.account_id),
        ))
        .limit(1)
      return found ?? null
    },
  },
  Compute: {
    routes: (parent: { id: number }, _: any, { db }: Context) =>
      db.select().from(routeTable).where(eq(routeTable.compute_id, parent.id)),
  },
  Route: {
    vehicle: (parent: { vehicle_id: number }, _: any, { db }: Context) =>
      db.select().from(vehicleTable).where(eq(vehicleTable.id, parent.vehicle_id)).limit(1)
        .then(r => r[0] ?? null),
    stops: (parent: { id: number }, _: any, { db }: Context) =>
      db.select().from(routeStopTable)
        .where(eq(routeStopTable.route_id, parent.id))
        .orderBy(asc(routeStopTable.sequence)),
  },
  RouteStop: {
    destination: (parent: { destination_id: number }, _: any, { db }: Context) =>
      db.select().from(destinationTable).where(eq(destinationTable.id, parent.destination_id)).limit(1)
        .then(r => r[0] ?? null),
  },
}
