import { and, asc, eq, inArray } from 'drizzle-orm'
import {
  compute as computeTable,
  route as routeTable,
  route_stop as routeStopTable,
  vehicle as vehicleTable,
  destination as destinationTable,
  order as orderTable,
  info_between_two_point as infoBetweenTable,
} from '../../db/schema'
import { requireAuth, type Context } from '../context'

export const computeTypeDefs = /* GraphQL */ `
  type Compute {
    id:                  ID!
    account_id:          Int!
    order_id:            Int!
    status:              Status!
    compute_status:      ComputeStatus!
    start_time:          Float
    end_time:            Float
    fail_reason:         String
    data:                JSON
    created_at:          Float
    updated_at:          Float
    comment_for_account: String
    routes:              [Route!]!
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

  extend type Mutation {
    createCompute(order_id: ID!, data: JSON, comment_for_account: String): Compute!
    cancelCompute(id: ID!): Compute!
  }
`

export const computeResolvers = {
  Query: {
    computes: async (_: any, args: { orderId?: string; status?: string }, { db, user }: Context) => {
      requireAuth(user)
      const conditions: any[] = [eq(computeTable.account_id, user!.account_id)]
      if (args.orderId) conditions.push(eq(computeTable.order_id, parseInt(args.orderId)))
      if (args.status) conditions.push(eq(computeTable.compute_status, args.status as any))
      return db.select().from(computeTable).where(and(...conditions))
    },
    compute: async (_: any, args: { id: string }, { db, user }: Context) => {
      requireAuth(user)
      const [found] = await db
        .select()
        .from(computeTable)
        .where(and(
          eq(computeTable.id, parseInt(args.id)),
          eq(computeTable.account_id, user!.account_id)
        ))
        .limit(1)
      return found ?? null
    }
  },
  Mutation: {
    createCompute: async (
      _: any,
      args: { order_id: string; data?: any; comment_for_account?: string },
      { db, user, env }: Context
    ) => {
      requireAuth(user, 'normal')
      const now = Math.floor(Date.now() / 1000)

      // 1. 建立 compute 記錄，初始狀態為 pending
      const [compute] = await db.insert(computeTable).values({
        account_id: user!.account_id,
        order_id: parseInt(args.order_id),
        data: args.data,
        comment_for_account: args.comment_for_account,
        compute_status: 'pending',
        start_time: now,
      }).returning()

      // 以下為非同步操作，helper 用來標記失敗
      const markFailed = (reason: string) =>
        db.update(computeTable)
          .set({ compute_status: 'failed', fail_reason: reason, updated_at: Math.floor(Date.now() / 1000) })
          .where(eq(computeTable.id, compute.id))

      // 2. 取得 order snapshot
      const [order] = await db.select()
        .from(orderTable)
        .where(and(
          eq(orderTable.id, parseInt(args.order_id)),
          eq(orderTable.account_id, user!.account_id)
        ))
        .limit(1)

      if (!order) {
        await markFailed('Order not found')
        return compute
      }

      const destinations = order.destination_snapshot as any[]
      const vehicles = order.vehicle_snapshot as any[]

      // 3. 從 info_between_two_point 建立 N x N 距離/時間矩陣
      const destIds = destinations.map((d: any) => d.id as number)
      const n = destIds.length

      const pairs = await db.select()
        .from(infoBetweenTable)
        .where(and(
          inArray(infoBetweenTable.a_point, destIds),
          inArray(infoBetweenTable.b_point, destIds)
        ))

      if (pairs.length < n * (n - 1)) {
        await markFailed(`距離矩陣資料不完整，需要 ${n * (n - 1)} 筆，實際只有 ${pairs.length} 筆`)
        return compute
      }

      const idxMap: Record<number, number> = Object.fromEntries(destIds.map((id, i) => [id, i]))
      const distMatrix = Array.from({ length: n }, () => Array<number>(n).fill(0))
      const timeMatrix = Array.from({ length: n }, () => Array<number>(n).fill(0))
      for (const p of pairs) {
        distMatrix[idxMap[p.a_point]][idxMap[p.b_point]] = p.distance_from_a_to_b
        timeMatrix[idxMap[p.a_point]][idxMap[p.b_point]] = p.time_from_a_to_b
      }

      // 4. 組裝 VRPRequest
      // destination_snapshot 預期格式：
      //   { id, name, lat, lng, is_depot?, pickup?, delivery?,
      //     service_time?, time_window_start?, time_window_end? }
      // vehicle_snapshot 預期格式：
      //   { id, capacity, fixed_cost? }
      const vrpPayload = {
        compute_id: compute.id,
        webhook_url: `${env.API_BASE_URL}/internal/vrp-callback`,
        depot_index: Math.max(0, destinations.findIndex((d: any) => d.is_depot)),
        locations: destinations.map((d: any) => ({
          id: d.id,
          name: d.name ?? '',
          lat: parseFloat(d.lat),
          lng: parseFloat(d.lng),
          pickup: d.pickup ?? 0,
          delivery: d.delivery ?? 0,
          service_time: d.service_time ?? 0,
          time_window_start: d.time_window_start ?? 0,
          time_window_end: d.time_window_end ?? 1440,
        })),
        vehicles: vehicles.map((v: any) => ({
          id: v.id,
          capacity: v.capacity ?? 0,
          fixed_cost: v.fixed_cost ?? 0,
        })),
        distance_matrix: distMatrix,
        time_matrix: timeMatrix,
        time_limit_seconds: (args.data as any)?.time_limit_seconds ?? 30,
      }

      // 5. 呼叫 OR-Tools（await 取得 202 確認即可，實際計算透過 webhook 回呼）
      try {
        const res = await fetch(`${env.ORTOOLS_URL}/vrp/solve`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(vrpPayload),
        })
        if (!res.ok) {
          const errText = await res.text().catch(() => `HTTP ${res.status}`)
          await markFailed(`OR-Tools 回傳錯誤: ${errText}`)
        }
      } catch (e: any) {
        await markFailed(`無法連線到演算法服務: ${e.message}`)
      }

      return compute
    },
    cancelCompute: async (_: any, args: { id: string }, { db, user }: Context) => {
      requireAuth(user, 'normal')
      const [updated] = await db
        .update(computeTable)
        .set({ compute_status: 'cancelled', updated_at: Math.floor(Date.now() / 1000) })
        .where(and(
          eq(computeTable.id, parseInt(args.id)),
          eq(computeTable.account_id, user!.account_id)
        ))
        .returning()
      if (!updated) throw new Error('Compute not found')
      return updated
    }
  },
  Compute: {
    routes: (parent: { id: number }, _: any, { db }: Context) =>
      db.select().from(routeTable).where(eq(routeTable.compute_id, parent.id))
  },
  Route: {
    vehicle: (parent: { vehicle_id: number }, _: any, { db }: Context) =>
      db.select().from(vehicleTable).where(eq(vehicleTable.id, parent.vehicle_id)).limit(1)
        .then(r => r[0] ?? null),
    stops: (parent: { id: number }, _: any, { db }: Context) =>
      db.select().from(routeStopTable)
        .where(eq(routeStopTable.route_id, parent.id))
        .orderBy(asc(routeStopTable.sequence))
  },
  RouteStop: {
    destination: (parent: { destination_id: number }, _: any, { db }: Context) =>
      db.select().from(destinationTable).where(eq(destinationTable.id, parent.destination_id)).limit(1)
        .then(r => r[0] ?? null)
  }
}
