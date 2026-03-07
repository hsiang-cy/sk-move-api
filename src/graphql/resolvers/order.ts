import { and, eq, getTableColumns, inArray, ne } from 'drizzle-orm'
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
} from '../../db/schema'
import { requireAuth, type Context } from '../context'

export const orderTypeDefs = /* GraphQL */ `
  type Order {
    id:                    ID!
    account_id:            ID!
    status:                Status!
    data:                  JSON
    created_at:            Float
    updated_at:            Float
    location_snapshot:     JSON!
    bento_order_snapshot:  JSON!
    vehicle_snapshot:      JSON!
    comment_for_account:   String
    computes:              [Compute!]!
  }

  extend type Query {
    orders(status: Status): [Order!]!
    order(id: ID!): Order
  }

  extend type Mutation {
    createOrder(bento_order_ids: [ID!]!, vehicle_ids: [ID!]!, data: JSON, comment_for_account: String): Order!
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
          eq(orderTable.id, args.id),
          eq(orderTable.account_id, user!.account_id)
        ))
        .limit(1)
      return found ?? null
    }
  },
  Mutation: {
    createOrder: async (
      _: any,
      args: { bento_order_ids: string[]; vehicle_ids: string[]; data?: any; comment_for_account?: string },
      { db, user, env }: Context
    ) => {
      requireAuth(user, 'normal')

      // 查出便當訂單（含取送地點）
      const bentoOrders = await db.select().from(bentoOrderTable)
        .where(and(
          inArray(bentoOrderTable.id, args.bento_order_ids),
          eq(bentoOrderTable.account_id, user!.account_id),
          ne(bentoOrderTable.status, 'deleted'),
        ))
      if (bentoOrders.length !== args.bento_order_ids.length) {
        throw new Error('部分便當訂單不存在或無存取權限')
      }

      // 查出各訂單品項
      const items = await db.select().from(bentoOrderItemTable)
        .where(inArray(bentoOrderItemTable.bento_order_id, args.bento_order_ids))

      // 收集所有不重複地點 ID
      const locationIdSet = new Set<string>()
      for (const bo of bentoOrders) {
        locationIdSet.add(bo.pickup_location_id)
        locationIdSet.add(bo.delivery_location_id)
      }
      const locationIds = Array.from(locationIdSet)

      // 查出地點資料
      const destinations = await db.select().from(destinationTable)
        .where(and(
          inArray(destinationTable.id, locationIds),
          eq(destinationTable.account_id, user!.account_id),
          ne(destinationTable.status, 'deleted'),
        ))
      if (destinations.length !== locationIds.length) {
        throw new Error('部分地點不存在或無存取權限')
      }

      // 查出車輛（帶 capacity）
      const vehicles = await db.select({
        id: vehicleTable.id,
        vehicle_number: vehicleTable.vehicle_number,
        capacity: vehicleTypeTable.capacity,
        data: vehicleTable.data,
      })
        .from(vehicleTable)
        .innerJoin(vehicleTypeTable, eq(vehicleTable.vehicle_type, vehicleTypeTable.id))
        .where(and(
          inArray(vehicleTable.id, args.vehicle_ids),
          eq(vehicleTable.account_id, user!.account_id),
          ne(vehicleTable.status, 'deleted'),
        ))
      if (vehicles.length !== args.vehicle_ids.length) {
        throw new Error('部分車輛不存在或無存取權限')
      }

      // 補齊兩點距離快取（Google Routes API）
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
          throw new Error(`Google Routes API error: ${response.status}`)
        }

        const entries = (await response.json()) as Array<{
          originIndex: number; destinationIndex: number
          distanceMeters: number; duration: string; condition: string
        }>

        const newRows: Array<{ a_point: string; b_point: string; distance_from_a_to_b: string; time_from_a_to_b: string }> = []
        for (const entry of entries) {
          if (entry.originIndex === entry.destinationIndex) continue
          const key = `${locationIds[entry.originIndex]}-${locationIds[entry.destinationIndex]}`
          if (!missingPairs.has(key)) continue
          if (entry.condition !== 'ROUTE_EXISTS') {
            throw new Error(`No route found between ${locationIds[entry.originIndex]} and ${locationIds[entry.destinationIndex]}`)
          }
          const durationSeconds = parseInt(entry.duration.replace('s', ''), 10)
          newRows.push({
            a_point: locationIds[entry.originIndex],
            b_point: locationIds[entry.destinationIndex],
            distance_from_a_to_b: String(entry.distanceMeters),
            time_from_a_to_b: String(Math.round(durationSeconds / 60)),
          })
        }
        if (newRows.length > 0) await db.insert(infoBetweenTable).values(newRows)
      }

      // 建立 location_snapshot（0-based index 映射）
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

      // 建立 bento_order_snapshot
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

      // 建立 vehicle_snapshot
      const vehicle_snapshot = vehicles.map((v, idx) => ({
        idx,
        db_id: v.id,
        capacity: v.capacity,
        fixed_cost: (v.data as any)?.fixed_cost ?? 0,
      }))

      const [created] = await db.insert(orderTable).values({
        account_id: user!.account_id,
        location_snapshot,
        bento_order_snapshot,
        vehicle_snapshot,
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
          eq(orderTable.id, args.id),
          eq(orderTable.account_id, user!.account_id)
        ))
        .returning()
      if (!deleted) throw new Error('Order not found')
      return deleted
    }
  },
  Order: {
    computes: (parent: { id: string }, _: any, { db }: Context) =>
      db.select(getTableColumns(computeTable))
        .from(computeTable)
        .innerJoin(computeOneClickTable, eq(computeTable.compute_one_click_id, computeOneClickTable.id))
        .where(eq(computeOneClickTable.order_id, parent.id)),
  }
}
