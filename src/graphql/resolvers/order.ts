import { and, eq, inArray } from 'drizzle-orm'
import { order as orderTable, compute as computeTable, info_between_two_point as infoBetweenTable } from '../../db/schema'
import { requireAuth, type Context } from '../context'

export const orderTypeDefs = /* GraphQL */ `
  type Order {
    id:                   ID!
    account_id:           Int!
    status:               Status!
    data:                 JSON
    created_at:           Float
    updated_at:           Float
    destination_snapshot: JSON!
    vehicle_snapshot:     JSON!
    comment_for_account:  String
    computes:             [Compute!]!
  }

  extend type Query {
    orders(status: Status): [Order!]!
    order(id: ID!): Order
  }

  extend type Mutation {
    createOrder(destination_snapshot: JSON!, vehicle_snapshot: JSON!, data: JSON, comment_for_account: String): Order!
    deleteOrder(id: ID!): Order!
  }
`

export const orderResolvers = {
  Query: {
    orders: async (_: any, args: { status?: string }, { db, user }: Context) => {
      requireAuth(user)
      const conditions: any[] = [eq(orderTable.account_id, user!.account_id)]
      if (args.status) conditions.push(eq(orderTable.status, args.status as any))
      return db.select().from(orderTable).where(and(...conditions))
    },
    order: async (_: any, args: { id: string }, { db, user }: Context) => {
      requireAuth(user)
      const [found] = await db
        .select()
        .from(orderTable)
        .where(and(
          eq(orderTable.id, parseInt(args.id)),
          eq(orderTable.account_id, user!.account_id)
        ))
        .limit(1)
      return found ?? null
    }
  },
  Mutation: {
    createOrder: async (
      _: any,
      args: { destination_snapshot: any; vehicle_snapshot: any; data?: any; comment_for_account?: string },
      { db, user, env }: Context
    ) => {
      requireAuth(user, 'normal')

      const destinations = args.destination_snapshot as Array<{ id: number; lat: string; lng: string }>
      const destIds = destinations.map((d) => d.id)

      if (destIds.length >= 2) {
        // Query existing cached pairs
        const existing = await db
          .select({ a_point: infoBetweenTable.a_point, b_point: infoBetweenTable.b_point })
          .from(infoBetweenTable)
          .where(and(inArray(infoBetweenTable.a_point, destIds), inArray(infoBetweenTable.b_point, destIds)))

        const existingSet = new Set(existing.map((r) => `${r.a_point}-${r.b_point}`))

        // Build list of missing (A, B) pairs
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
            waypoint: {
              location: {
                latLng: { latitude: parseFloat(d.lat), longitude: parseFloat(d.lng) },
              },
            },
          }))

          const response = await fetch(
            'https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix',
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'X-Goog-Api-Key': env.GOOGLE_ROUTES_API_KEY,
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
            throw new Error(`Google Routes API error: ${response.status} ${response.statusText}`)
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
              throw new Error(
                `No route found between destination ${destIds[entry.originIndex]} and ${destIds[entry.destinationIndex]}`
              )
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
        account_id: user!.account_id,
        destination_snapshot: args.destination_snapshot,
        vehicle_snapshot: args.vehicle_snapshot,
        data: args.data,
        comment_for_account: args.comment_for_account,
      }).returning()
      return created
    },
    deleteOrder: async (_: any, args: { id: string }, { db, user }: Context) => {
      requireAuth(user, 'normal')
      const [deleted] = await db
        .update(orderTable)
        .set({ status: 'deleted', updated_at: Math.floor(Date.now() / 1000) })
        .where(and(
          eq(orderTable.id, parseInt(args.id)),
          eq(orderTable.account_id, user!.account_id)
        ))
        .returning()
      if (!deleted) throw new Error('Order not found')
      return deleted
    }
  },
  Order: {
    computes: (parent: { id: number }, _: any, { db }: Context) =>
      db.select().from(computeTable).where(eq(computeTable.order_id, parent.id))
  }
}
