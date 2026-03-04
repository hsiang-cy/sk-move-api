import { and, eq } from 'drizzle-orm'
import { destination as destinationTable } from '../../db/schema'
import { requireAuth, type Context } from '../context'

export const destinationTypeDefs = /* GraphQL */ `
  """地點（停靠站 / 倉庫）"""
  type Destination {
    id:                  ID!
    account_id:          Int!
    """地點狀態"""
    status:              Status!
    """地點名稱"""
    name:                String!
    """地址"""
    address:             String!
    """緯度"""
    lat:                 String!
    """經度"""
    lng:                 String!
    """自訂擴充資料"""
    data:                JSON
    """建立時間（Unix timestamp）"""
    created_at:          Float
    """更新時間（Unix timestamp）"""
    updated_at:          Float
    """備註"""
    comment_for_account: String
  }

  extend type Query {
    """取得所有地點，可依狀態篩選"""
    destinations(
      """篩選狀態，不傳則回傳全部"""
      status: Status
    ): [Destination!]!
    """取得單一地點"""
    destination(id: ID!): Destination
  }

  extend type Mutation {
    """新增地點"""
    createDestination(
      """地點名稱"""
      name: String!
      """地址"""
      address: String!
      """緯度"""
      lat: String!
      """經度"""
      lng: String!
      """自訂擴充資料"""
      data: JSON
      """備註"""
      comment_for_account: String
    ): Destination!
    """更新地點"""
    updateDestination(
      id: ID!
      name: String
      address: String
      lat: String
      lng: String
      data: JSON
      comment_for_account: String
    ): Destination!
    """刪除地點（軟刪除，狀態改為 deleted）"""
    deleteDestination(id: ID!): Destination!
  }
`

export const destinationResolvers = {
  Query: {
    destinations: async (_: any, args: { status?: string }, { db, user }: Context) => {
      requireAuth(user)
      const conditions: any[] = [eq(destinationTable.account_id, user!.account_id)]
      if (args.status) conditions.push(eq(destinationTable.status, args.status as any))
      return db.select().from(destinationTable).where(and(...conditions))
    },
    destination: async (_: any, args: { id: string }, { db, user }: Context) => {
      requireAuth(user)
      const [found] = await db
        .select()
        .from(destinationTable)
        .where(and(
          eq(destinationTable.id, parseInt(args.id)),
          eq(destinationTable.account_id, user!.account_id)
        ))
        .limit(1)
      return found ?? null
    }
  },
  Mutation: {
    createDestination: async (
      _: any,
      args: { name: string; address: string; lat: string; lng: string; data?: any; comment_for_account?: string },
      { db, user }: Context
    ) => {
      requireAuth(user, 'normal')
      const [created] = await db.insert(destinationTable).values({
        account_id: user!.account_id,
        name: args.name,
        address: args.address,
        lat: args.lat,
        lng: args.lng,
        data: args.data,
        comment_for_account: args.comment_for_account,
      }).returning()
      return created
    },
    updateDestination: async (_: any, args: any, { db, user }: Context) => {
      requireAuth(user, 'normal')
      const updates: any = {}
      if (args.name !== undefined) updates.name = args.name
      if (args.address !== undefined) updates.address = args.address
      if (args.lat !== undefined) updates.lat = args.lat
      if (args.lng !== undefined) updates.lng = args.lng
      if (args.data !== undefined) updates.data = args.data
      if (args.comment_for_account !== undefined) updates.comment_for_account = args.comment_for_account
      updates.updated_at = Math.floor(Date.now() / 1000)
      const [updated] = await db
        .update(destinationTable)
        .set(updates)
        .where(and(
          eq(destinationTable.id, parseInt(args.id)),
          eq(destinationTable.account_id, user!.account_id)
        ))
        .returning()
      if (!updated) throw new Error('Destination not found')
      return updated
    },
    deleteDestination: async (_: any, args: { id: string }, { db, user }: Context) => {
      requireAuth(user, 'normal')
      const [deleted] = await db
        .update(destinationTable)
        .set({ status: 'deleted', updated_at: Math.floor(Date.now() / 1000) })
        .where(and(
          eq(destinationTable.id, parseInt(args.id)),
          eq(destinationTable.account_id, user!.account_id)
        ))
        .returning()
      if (!deleted) throw new Error('Destination not found')
      return deleted
    }
  }
}
