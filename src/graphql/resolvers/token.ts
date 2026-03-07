import { and, eq, ne } from 'drizzle-orm'
import { token as tokenTable, token_action_log } from '../../db/schema'
import { requireAuth, type Context } from '../context'

export const tokenTypeDefs = /* GraphQL */ `
  type ApiToken {
    id:         ID!
    account_id: ID!
    status:     Status!
    token:      String!
    created_at: Float
    dead_at:    Float
    updated_at: Float
    data:       JSON
  }

  extend type Query {
    apiTokens: [ApiToken!]!
    apiToken(id: ID!): ApiToken
  }

  extend type Mutation {
    createApiToken(dead_at: Float, data: JSON): ApiToken!
    createApiTokenForAccount(account_id: ID!, dead_at: Float, data: JSON): ApiToken!
    revokeApiToken(id: ID!): ApiToken!
    deleteApiToken(id: ID!): ApiToken!
  }
`

export const tokenResolvers = {
  Query: {
    apiTokens: async (_: any, __: any, { db, user }: Context) => {
      requireAuth(user)
      return db.select().from(tokenTable).where(
        and(eq(tokenTable.account_id, user!.account_id), ne(tokenTable.status, 'deleted'))
      )
    },
    apiToken: async (_: any, args: { id: string }, { db, user }: Context) => {
      requireAuth(user)
      const [found] = await db.select().from(tokenTable)
        .where(and(
          eq(tokenTable.id, parseInt(args.id)),
          eq(tokenTable.account_id, user!.account_id),
          ne(tokenTable.status, 'deleted'),
        ))
        .limit(1)
      return found ?? null
    },
  },
  Mutation: {
    createApiToken: async (
      _: any,
      args: { dead_at?: number; data?: any },
      { db, user }: Context
    ) => {
      requireAuth(user, 'normal')
      const tokenValue = 'sk-' + crypto.randomUUID().replace(/-/g, '')
      const [created] = await db.insert(tokenTable).values({
        account_id: user!.account_id,
        token: tokenValue,
        dead_at: args.dead_at,
        data: args.data,
      }).returning()

      await db.insert(token_action_log).values({
        token_id: created.id,
        data: { action: 'created' },
      })

      return created
    },

    createApiTokenForAccount: async (
      _: any,
      args: { account_id: string; dead_at?: number; data?: any },
      { db, user }: Context
    ) => {
      requireAuth(user, 'manager')
      const tokenValue = 'sk-' + crypto.randomUUID().replace(/-/g, '')
      const [created] = await db.insert(tokenTable).values({
        account_id: args.account_id,
        token: tokenValue,
        dead_at: args.dead_at,
        data: args.data,
      }).returning()

      await db.insert(token_action_log).values({
        token_id: created.id,
        data: { action: 'created', by_account_id: user!.account_id },
      })

      return created
    },

    revokeApiToken: async (_: any, args: { id: string }, { db, user }: Context) => {
      requireAuth(user, 'normal')
      const now = Math.floor(Date.now() / 1000)
      const [updated] = await db.update(tokenTable)
        .set({ status: 'inactive', updated_at: now })
        .where(and(
          eq(tokenTable.id, parseInt(args.id)),
          eq(tokenTable.account_id, user!.account_id),
        ))
        .returning()
      if (!updated) throw new Error('Token not found')

      await db.insert(token_action_log).values({
        token_id: updated.id,
        data: { action: 'revoked' },
      })

      return updated
    },

    deleteApiToken: async (_: any, args: { id: string }, { db, user }: Context) => {
      requireAuth(user, 'normal')
      const now = Math.floor(Date.now() / 1000)
      const [updated] = await db.update(tokenTable)
        .set({ status: 'deleted', updated_at: now })
        .where(and(
          eq(tokenTable.id, parseInt(args.id)),
          eq(tokenTable.account_id, user!.account_id),
        ))
        .returning()
      if (!updated) throw new Error('Token not found')

      await db.insert(token_action_log).values({
        token_id: updated.id,
        data: { action: 'deleted' },
      })

      return updated
    },
  },
}
