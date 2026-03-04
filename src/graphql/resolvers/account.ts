import { eq } from 'drizzle-orm'
import bcrypt from 'bcryptjs'
import { sign } from 'hono/jwt'
import { account as accountTable, point_log } from '../../db/schema'
import { requireAuth, type Context } from '../context'

export const accountTypeDefs = /* GraphQL */ `
  """帳號"""
  type Account {
    account_id:       ID!
    """帳號狀態"""
    status:           Status!
    """帳號角色"""
    account_role:     AccountRole!
    """登入帳號名稱（唯一）"""
    account:          String!
    """電子郵件（唯一）"""
    email:            String!
    """公司名稱"""
    company_name:     String
    """公司產業"""
    company_industry: String
    """聯絡人姓名"""
    people_name:      String!
    """聯絡電話"""
    phone:            String
    """剩餘點數"""
    point:            Int!
    """建立時間（Unix timestamp）"""
    created_at:       Float
    """更新時間（Unix timestamp）"""
    updated_at:       Float
    """自訂擴充資料"""
    data:             JSON
    """點數異動紀錄"""
    point_logs:       [PointLog!]!
  }

  """登入 / 註冊回傳結果"""
  type AuthPayload {
    """JWT Token"""
    token:   String!
    """帳號資料"""
    account: Account!
  }

  """點數異動紀錄"""
  type PointLog {
    id:         ID!
    account_id: Int!
    """點數變動量（正為增加，負為扣除）"""
    change:     Int!
    """異動原因"""
    reason:     String!
    """自訂擴充資料"""
    data:       JSON
    """建立時間（Unix timestamp）"""
    created_at: Float
  }

  extend type Query {
    """取得目前登入的帳號資訊，未登入回傳 null"""
    me: Account
    """取得目前登入帳號的點數異動紀錄"""
    pointLogs: [PointLog!]!
  }

  extend type Mutation {
    """註冊新帳號"""
    register(
      """登入帳號名稱"""
      account: String!
      """電子郵件"""
      email: String!
      """密碼"""
      password: String!
      """聯絡人姓名"""
      people_name: String!
    ): AuthPayload!
    """登入，回傳 JWT Token"""
    login(
      """登入帳號名稱"""
      account: String!
      """密碼"""
      password: String!
    ): AuthPayload!
  }
`

export const accountResolvers = {
  Query: {
    me: async (_: any, __: any, { db, user }: Context) => {
      if (!user) return null
      const [found] = await db
        .select()
        .from(accountTable)
        .where(eq(accountTable.account_id, user.account_id))
        .limit(1)
      return found ?? null
    },
    pointLogs: async (_: any, __: any, { db, user }: Context) => {
      requireAuth(user)
      return db.select().from(point_log).where(eq(point_log.account_id, user!.account_id))
    }
  },
  Mutation: {
    register: async (
      _: any,
      args: { account: string; email: string; password: string; people_name: string },
      { db, env }: Context
    ) => {
      const hashed = await bcrypt.hash(args.password, 10)
      const [newAcc] = await db.insert(accountTable).values({
        account: args.account,
        email: args.email,
        password: hashed,
        people_name: args.people_name,
      }).returning()
      if (!newAcc) throw new Error('Failed to create account')
      const token = await sign(
        { account_id: newAcc.account_id, account_role: newAcc.account_role },
        env.JWT_SECRET
      )
      return { token, account: newAcc }
    },
    login: async (
      _: any,
      args: { account: string; password: string },
      { db, env }: Context
    ) => {
      const [found] = await db
        .select()
        .from(accountTable)
        .where(eq(accountTable.account, args.account))
        .limit(1)
      if (!found) throw new Error('Account not found')
      const valid = await bcrypt.compare(args.password, found.password)
      if (!valid) throw new Error('Invalid password')
      const token = await sign(
        { account_id: found.account_id, account_role: found.account_role },
        env.JWT_SECRET
      )
      return { token, account: found }
    }
  },
  Account: {
    point_logs: (parent: { account_id: number }, _: any, { db }: Context) =>
      db.select().from(point_log).where(eq(point_log.account_id, parent.account_id))
  }
}
