import { createMiddleware } from 'hono/factory'
import { and, eq } from 'drizzle-orm'
import { createDb } from '../../db/connect'
import { token as tokenTable } from '../../db/schema'

type Bindings = { DATABASE_URL: string }

export type ApiVariables = {
  account_id: number
  token_id: number
}

export const tokenAuth = createMiddleware<{ Bindings: Bindings; Variables: ApiVariables }>(
  async (c, next) => {
    const authHeader = c.req.header('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return c.json({ error: 'Unauthorized' }, 401)
    }

    const tokenValue = authHeader.slice(7)
    const db = createDb(c.env.DATABASE_URL)
    const now = Math.floor(Date.now() / 1000)

    const [record] = await db
      .select()
      .from(tokenTable)
      .where(and(eq(tokenTable.token, tokenValue), eq(tokenTable.status, 'active')))
      .limit(1)

    if (!record) return c.json({ error: 'Unauthorized' }, 401)
    if (record.dead_at && record.dead_at < now) return c.json({ error: 'Token expired' }, 401)

    c.set('account_id', record.account_id)
    c.set('token_id', record.id)
    await next()
  }
)
