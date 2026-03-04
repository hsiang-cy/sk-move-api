import { and, eq } from 'drizzle-orm'
import {
  custom_vehicle_type as cvtTable,
  vehicle as vehicleTable,
  destination as destinationTable
} from '../../db/schema'
import { requireAuth, type Context } from '../context'

export const vehicleTypeDefs = /* GraphQL */ `
  type CustomVehicleType {
    id:                  ID!
    account_id:          Int!
    status:              Status!
    name:                String!
    capacity:            Int!
    data:                JSON
    created_at:          Float
    updated_at:          Float
    comment_for_account: String
  }

  type Vehicle {
    id:                  ID!
    account_id:          Int!
    status:              Status!
    vehicle_number:      String!
    vehicle_type:        Int!
    depot_id:            Int
    data:                JSON
    created_at:          Float
    updated_at:          Float
    comment_for_account: String
    vehicleTypeInfo:     CustomVehicleType
    depot:               Destination
  }

  extend type Query {
    customVehicleTypes(status: Status): [CustomVehicleType!]!
    customVehicleType(id: ID!): CustomVehicleType
    vehicles(status: Status): [Vehicle!]!
    vehicle(id: ID!): Vehicle
  }

  extend type Mutation {
    createCustomVehicleType(name: String!, capacity: Int!, data: JSON, comment_for_account: String): CustomVehicleType!
    updateCustomVehicleType(id: ID!, name: String, capacity: Int, data: JSON, comment_for_account: String): CustomVehicleType!
    deleteCustomVehicleType(id: ID!): CustomVehicleType!
    createVehicle(vehicle_number: String!, vehicle_type: ID!, depot_id: ID, data: JSON, comment_for_account: String): Vehicle!
    updateVehicle(id: ID!, vehicle_number: String, vehicle_type: ID, depot_id: ID, data: JSON, comment_for_account: String): Vehicle!
    deleteVehicle(id: ID!): Vehicle!
  }
`

export const vehicleResolvers = {
  Query: {
    customVehicleTypes: async (_: any, args: { status?: string }, { db, user }: Context) => {
      requireAuth(user)
      const conditions: any[] = [eq(cvtTable.account_id, user!.account_id)]
      if (args.status) conditions.push(eq(cvtTable.status, args.status as any))
      return db.select().from(cvtTable).where(and(...conditions))
    },
    customVehicleType: async (_: any, args: { id: string }, { db, user }: Context) => {
      requireAuth(user)
      const [found] = await db
        .select()
        .from(cvtTable)
        .where(and(eq(cvtTable.id, parseInt(args.id)), eq(cvtTable.account_id, user!.account_id)))
        .limit(1)
      return found ?? null
    },
    vehicles: async (_: any, args: { status?: string }, { db, user }: Context) => {
      requireAuth(user)
      const conditions: any[] = [eq(vehicleTable.account_id, user!.account_id)]
      if (args.status) conditions.push(eq(vehicleTable.status, args.status as any))
      return db.select().from(vehicleTable).where(and(...conditions))
    },
    vehicle: async (_: any, args: { id: string }, { db, user }: Context) => {
      requireAuth(user)
      const [found] = await db
        .select()
        .from(vehicleTable)
        .where(and(eq(vehicleTable.id, parseInt(args.id)), eq(vehicleTable.account_id, user!.account_id)))
        .limit(1)
      return found ?? null
    }
  },
  Mutation: {
    createCustomVehicleType: async (
      _: any,
      args: { name: string; capacity: number; data?: any; comment_for_account?: string },
      { db, user }: Context
    ) => {
      requireAuth(user, 'normal')
      const [created] = await db.insert(cvtTable).values({
        account_id: user!.account_id,
        name: args.name,
        capacity: args.capacity,
        data: args.data,
        comment_for_account: args.comment_for_account,
      }).returning()
      return created
    },
    updateCustomVehicleType: async (_: any, args: any, { db, user }: Context) => {
      requireAuth(user, 'normal')
      const updates: any = {}
      if (args.name !== undefined) updates.name = args.name
      if (args.capacity !== undefined) updates.capacity = args.capacity
      if (args.data !== undefined) updates.data = args.data
      if (args.comment_for_account !== undefined) updates.comment_for_account = args.comment_for_account
      updates.updated_at = Math.floor(Date.now() / 1000)
      const [updated] = await db
        .update(cvtTable)
        .set(updates)
        .where(and(eq(cvtTable.id, parseInt(args.id)), eq(cvtTable.account_id, user!.account_id)))
        .returning()
      if (!updated) throw new Error('CustomVehicleType not found')
      return updated
    },
    deleteCustomVehicleType: async (_: any, args: { id: string }, { db, user }: Context) => {
      requireAuth(user, 'normal')
      const [deleted] = await db
        .update(cvtTable)
        .set({ status: 'deleted', updated_at: Math.floor(Date.now() / 1000) })
        .where(and(eq(cvtTable.id, parseInt(args.id)), eq(cvtTable.account_id, user!.account_id)))
        .returning()
      if (!deleted) throw new Error('CustomVehicleType not found')
      return deleted
    },
    createVehicle: async (
      _: any,
      args: { vehicle_number: string; vehicle_type: string; depot_id?: string; data?: any; comment_for_account?: string },
      { db, user }: Context
    ) => {
      requireAuth(user, 'normal')
      const [created] = await db.insert(vehicleTable).values({
        account_id: user!.account_id,
        vehicle_number: args.vehicle_number,
        vehicle_type: parseInt(args.vehicle_type),
        depot_id: args.depot_id ? parseInt(args.depot_id) : undefined,
        data: args.data,
        comment_for_account: args.comment_for_account,
      }).returning()
      return created
    },
    updateVehicle: async (_: any, args: any, { db, user }: Context) => {
      requireAuth(user, 'normal')
      const updates: any = {}
      if (args.vehicle_number !== undefined) updates.vehicle_number = args.vehicle_number
      if (args.vehicle_type !== undefined) updates.vehicle_type = parseInt(args.vehicle_type)
      if (args.depot_id !== undefined) updates.depot_id = args.depot_id ? parseInt(args.depot_id) : null
      if (args.data !== undefined) updates.data = args.data
      if (args.comment_for_account !== undefined) updates.comment_for_account = args.comment_for_account
      updates.updated_at = Math.floor(Date.now() / 1000)
      const [updated] = await db
        .update(vehicleTable)
        .set(updates)
        .where(and(eq(vehicleTable.id, parseInt(args.id)), eq(vehicleTable.account_id, user!.account_id)))
        .returning()
      if (!updated) throw new Error('Vehicle not found')
      return updated
    },
    deleteVehicle: async (_: any, args: { id: string }, { db, user }: Context) => {
      requireAuth(user, 'normal')
      const [deleted] = await db
        .update(vehicleTable)
        .set({ status: 'deleted', updated_at: Math.floor(Date.now() / 1000) })
        .where(and(eq(vehicleTable.id, parseInt(args.id)), eq(vehicleTable.account_id, user!.account_id)))
        .returning()
      if (!deleted) throw new Error('Vehicle not found')
      return deleted
    }
  },
  Vehicle: {
    vehicleTypeInfo: (parent: { vehicle_type: number }, _: any, { db }: Context) =>
      db.select().from(cvtTable).where(eq(cvtTable.id, parent.vehicle_type)).limit(1)
        .then(r => r[0] ?? null),
    depot: (parent: { depot_id: number | null }, _: any, { db }: Context) => {
      if (!parent.depot_id) return null
      return db.select().from(destinationTable).where(eq(destinationTable.id, parent.depot_id)).limit(1)
        .then(r => r[0] ?? null)
    }
  }
}
