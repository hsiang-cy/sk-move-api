import { Hono } from 'hono'
import { and, eq, ne } from 'drizzle-orm'
import { createDb } from '../../db/connect'
import { custom_vehicle_type as vehicleTypeTable, vehicle as vehicleTable } from '../../db/schema'
import type { ApiVariables } from './middleware'

type Bindings = { DATABASE_URL: string }
type Env = { Bindings: Bindings; Variables: ApiVariables }

// ── Vehicle Types ──────────────────────────────────────────────────────────────

export const vehicleTypeRoutes = new Hono<Env>()

vehicleTypeRoutes
  .get('/', async (c) => {
    const db = createDb(c.env.DATABASE_URL)
    const account_id = c.get('account_id')
    const items = await db.select().from(vehicleTypeTable)
      .where(and(eq(vehicleTypeTable.account_id, account_id), ne(vehicleTypeTable.status, 'deleted')))
    return c.json(items)
  })

  .get('/:id', async (c) => {
    const db = createDb(c.env.DATABASE_URL)
    const account_id = c.get('account_id')
    const [item] = await db.select().from(vehicleTypeTable)
      .where(and(
        eq(vehicleTypeTable.id, parseInt(c.req.param('id'))),
        eq(vehicleTypeTable.account_id, account_id),
        ne(vehicleTypeTable.status, 'deleted'),
      ))
      .limit(1)
    if (!item) return c.json({ error: 'Not found' }, 404)
    return c.json(item)
  })

  .post('/', async (c) => {
    const db = createDb(c.env.DATABASE_URL)
    const account_id = c.get('account_id')
    const body: any = await c.req.json()
    const [created] = await db.insert(vehicleTypeTable).values({
      account_id,
      name: body.name,
      capacity: body.capacity ?? 0,
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
    const [updated] = await db.update(vehicleTypeTable)
      .set({
        ...(body.name !== undefined && { name: body.name }),
        ...(body.capacity !== undefined && { capacity: body.capacity }),
        ...(body.data !== undefined && { data: body.data }),
        ...(body.comment_for_account !== undefined && { comment_for_account: body.comment_for_account }),
        updated_at: now,
      })
      .where(and(
        eq(vehicleTypeTable.id, parseInt(c.req.param('id'))),
        eq(vehicleTypeTable.account_id, account_id),
        ne(vehicleTypeTable.status, 'deleted'),
      ))
      .returning()
    if (!updated) return c.json({ error: 'Not found' }, 404)
    return c.json(updated)
  })

  .delete('/:id', async (c) => {
    const db = createDb(c.env.DATABASE_URL)
    const account_id = c.get('account_id')
    const now = Math.floor(Date.now() / 1000)
    const [deleted] = await db.update(vehicleTypeTable)
      .set({ status: 'deleted', updated_at: now })
      .where(and(
        eq(vehicleTypeTable.id, parseInt(c.req.param('id'))),
        eq(vehicleTypeTable.account_id, account_id),
        ne(vehicleTypeTable.status, 'deleted'),
      ))
      .returning()
    if (!deleted) return c.json({ error: 'Not found' }, 404)
    return c.json({ ok: true })
  })

// ── Vehicles ───────────────────────────────────────────────────────────────────

export const vehicleRoutes = new Hono<Env>()

vehicleRoutes
  .get('/', async (c) => {
    const db = createDb(c.env.DATABASE_URL)
    const account_id = c.get('account_id')
    const items = await db.select().from(vehicleTable)
      .where(and(eq(vehicleTable.account_id, account_id), ne(vehicleTable.status, 'deleted')))
    return c.json(items)
  })

  .get('/:id', async (c) => {
    const db = createDb(c.env.DATABASE_URL)
    const account_id = c.get('account_id')
    const [item] = await db.select().from(vehicleTable)
      .where(and(
        eq(vehicleTable.id, parseInt(c.req.param('id'))),
        eq(vehicleTable.account_id, account_id),
        ne(vehicleTable.status, 'deleted'),
      ))
      .limit(1)
    if (!item) return c.json({ error: 'Not found' }, 404)
    return c.json(item)
  })

  .post('/', async (c) => {
    const db = createDb(c.env.DATABASE_URL)
    const account_id = c.get('account_id')
    const body: any = await c.req.json()
    const [created] = await db.insert(vehicleTable).values({
      account_id,
      vehicle_number: body.vehicle_number,
      vehicle_type: body.vehicle_type,
      depot_id: body.depot_id,
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
    const [updated] = await db.update(vehicleTable)
      .set({
        ...(body.vehicle_number !== undefined && { vehicle_number: body.vehicle_number }),
        ...(body.vehicle_type !== undefined && { vehicle_type: body.vehicle_type }),
        ...(body.depot_id !== undefined && { depot_id: body.depot_id }),
        ...(body.data !== undefined && { data: body.data }),
        ...(body.comment_for_account !== undefined && { comment_for_account: body.comment_for_account }),
        updated_at: now,
      })
      .where(and(
        eq(vehicleTable.id, parseInt(c.req.param('id'))),
        eq(vehicleTable.account_id, account_id),
        ne(vehicleTable.status, 'deleted'),
      ))
      .returning()
    if (!updated) return c.json({ error: 'Not found' }, 404)
    return c.json(updated)
  })

  .delete('/:id', async (c) => {
    const db = createDb(c.env.DATABASE_URL)
    const account_id = c.get('account_id')
    const now = Math.floor(Date.now() / 1000)
    const [deleted] = await db.update(vehicleTable)
      .set({ status: 'deleted', updated_at: now })
      .where(and(
        eq(vehicleTable.id, parseInt(c.req.param('id'))),
        eq(vehicleTable.account_id, account_id),
        ne(vehicleTable.status, 'deleted'),
      ))
      .returning()
    if (!deleted) return c.json({ error: 'Not found' }, 404)
    return c.json({ ok: true })
  })
