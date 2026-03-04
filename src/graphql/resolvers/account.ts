import { eq } from 'drizzle-orm'
import bcrypt from 'bcryptjs'
import { sign } from 'hono/jwt'
import { account as accountTable, point_log } from '../../db/schema'
import { requireAuth, type Context } from '../context'

export const accountTypeDefs = /* GraphQL */ `
  type Account {
    account_id:       ID!
    status:           Status!
    account_role:     AccountRole!
    account:          String!
    email:            String!
    company_name:     String
    company_industry: String
    people_name:      String!
    phone:            String
    point:            Int!
    created_at:       Float
    updated_at:       Float
    data:             JSON
    point_logs:       [PointLog!]!
  }

  type AuthPayload {
    token:   String!
    account: Account!
  }

  type PointLog {
    id:         ID!
    account_id: Int!
    change:     Int!
    reason:     String!
    data:       JSON
    created_at: Float
  }

  extend type Query {
    me: Account
    pointLogs: [PointLog!]!
  }

  extend type Mutation {
    register(account: String!, email: String!, password: String!, people_name: String!): AuthPayload!
    login(account: String!, password: String!): AuthPayload!
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
