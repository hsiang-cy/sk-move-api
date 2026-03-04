import { Hono } from 'hono'
import { and, eq, ne } from 'drizzle-orm'
import { createDb } from '../../db/connect'
import { destination as destinationTable } from '../../db/schema'
import type { ApiVariables } from './middleware'

type Bindings = { DATABASE_URL: string }
type Env = { Bindings: Bindings; Variables: ApiVariables }

export const destinationRoutes = new Hono<Env>()

destinationRoutes
  .get('/', async (c) => {
    const db = createDb(c.env.DATABASE_URL)
    const account_id = c.get('account_id')
    const items = await db.select().from(destinationTable)
      .where(and(eq(destinationTable.account_id, account_id), ne(destinationTable.status, 'deleted')))
    return c.json(items)
  })

  .get('/:id', async (c) => {
    const db = createDb(c.env.DATABASE_URL)
    const account_id = c.get('account_id')
    const [item] = await db.select().from(destinationTable)
      .where(and(
        eq(destinationTable.id, parseInt(c.req.param('id'))),
        eq(destinationTable.account_id, account_id),
        ne(destinationTable.status, 'deleted'),
      ))
      .limit(1)
    if (!item) return c.json({ error: 'Not found' }, 404)
    return c.json(item)
  })

  .post('/', async (c) => {
    const db = createDb(c.env.DATABASE_URL)
    const account_id = c.get('account_id')
    const body: any = await c.req.json()
    if (!body.name || !body.address || !body.lat || !body.lng) return c.json({ error: 'name, address, lat, lng are required' }, 400)
    const [created] = await db.insert(destinationTable).values({
      account_id,
      name: body.name,
      address: body.address,
      lat: body.lat,
      lng: body.lng,
      data: body.data,
      comment_for_account: body.comment_for_account,
    }).returning()
    return c.json(created, 201)
  })

  .put('/:id', async (c) => {
    const db = createDb(c.env.DATABASE_URL)
    const account_id = c.get('account_id')
    const body: any = await c.req.json()
    const now = Math.floor(Date.now() / 1000)
    const [updated] = await db.update(destinationTable)
      .set({
        ...(body.name !== undefined && { name: body.name }),
        ...(body.address !== undefined && { address: body.address }),
        ...(body.lat !== undefined && { lat: body.lat }),
        ...(body.lng !== undefined && { lng: body.lng }),
        ...(body.data !== undefined && { data: body.data }),
        ...(body.comment_for_account !== undefined && { comment_for_account: body.comment_for_account }),
        updated_at: now,
      })
      .where(and(
        eq(destinationTable.id, parseInt(c.req.param('id'))),
        eq(destinationTable.account_id, account_id),
        ne(destinationTable.status, 'deleted'),
      ))
      .returning()
    if (!updated) return c.json({ error: 'Not found' }, 404)
    return c.json(updated)
  })

  .delete('/:id', async (c) => {
    const db = createDb(c.env.DATABASE_URL)
    const account_id = c.get('account_id')
    const now = Math.floor(Date.now() / 1000)
    const [deleted] = await db.update(destinationTable)
      .set({ status: 'deleted', updated_at: now })
      .where(and(
        eq(destinationTable.id, parseInt(c.req.param('id'))),
        eq(destinationTable.account_id, account_id),
        ne(destinationTable.status, 'deleted'),
      ))
      .returning()
    if (!deleted) return c.json({ error: 'Not found' }, 404)
    return c.json({ ok: true })
  })
