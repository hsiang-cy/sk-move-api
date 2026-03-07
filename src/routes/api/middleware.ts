import { createMiddleware } from 'hono/factory'
import { HTTPException } from 'hono/http-exception'
import { and, eq } from 'drizzle-orm'
import { createDb } from '../../db/connect'
import { token as tokenTable } from '../../db/schema'

type Bindings = { DATABASE_URL: string }

export type ApiVariables = {
  account_id: string
  token_id: number
}

export const tokenAuth = createMiddleware<{ Bindings: Bindings; Variables: ApiVariables }>(
  async (c, next) => {
    const authHeader = c.req.header('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      throw new HTTPException(401, { message: '未授權' })
    }

    const tokenValue = authHeader.slice(7)
    const db = createDb(c.env.DATABASE_URL)
    const now = Math.floor(Date.now() / 1000)

    const [record] = await db
      .select()
      .from(tokenTable)
      .where(and(eq(tokenTable.token, tokenValue), eq(tokenTable.status, 'active')))
      .limit(1)

    if (!record) throw new HTTPException(401, { message: '未授權' })
    if (record.dead_at && record.dead_at < now) throw new HTTPException(401, { message: 'Token 已過期' })

    c.set('account_id', record.account_id)
    c.set('token_id', record.id)
    await next()
  }
)
