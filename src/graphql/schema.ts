import { createSchema } from 'graphql-yoga'
import { Kind } from 'graphql'
import { type Context } from './context'
import { accountResolvers, accountTypeDefs } from './resolvers/account'
import { destinationResolvers, destinationTypeDefs } from './resolvers/destination'
import { vehicleResolvers, vehicleTypeDefs } from './resolvers/vehicle'
import { orderResolvers, orderTypeDefs } from './resolvers/order'
import { computeResolvers, computeTypeDefs } from './resolvers/compute'

function parseLiteral(ast: any): any {
  switch (ast.kind) {
    case Kind.STRING: return ast.value
    case Kind.BOOLEAN: return ast.value
    case Kind.INT: return parseInt(ast.value, 10)
    case Kind.FLOAT: return parseFloat(ast.value)
    case Kind.NULL: return null
    case Kind.LIST: return ast.values.map(parseLiteral)
    case Kind.OBJECT: return Object.fromEntries(
      ast.fields.map((f: any) => [f.name.value, parseLiteral(f.value)])
    )
    default: return null
  }
}

const jsonScalarResolver = {
  JSON: { serialize: (v: any) => v, parseValue: (v: any) => v, parseLiteral }
}

export type { Context }

const baseTypeDefs = /* GraphQL */ `
  scalar JSON

  enum Status        { inactive active deleted }
  enum ComputeStatus { initial pending computing completed failed cancelled }
  enum AccountRole   { admin manager normal guest just_view }

  type Query
  type Mutation
`

const typeDefs = [
  baseTypeDefs,
  accountTypeDefs,
  destinationTypeDefs,
  vehicleTypeDefs,
  orderTypeDefs,
  computeTypeDefs,
]

function mergeResolvers(...maps: any[]) {
  const merged: any = {}
  for (const map of maps) {
    for (const [type, resolvers] of Object.entries(map)) {
      merged[type] ??= {}
      Object.assign(merged[type], resolvers)
    }
  }
  return merged
}

export const schema = createSchema<Context>({
  typeDefs,
  resolvers: mergeResolvers(
    jsonScalarResolver,
    accountResolvers,
    destinationResolvers,
    vehicleResolvers,
    orderResolvers,
    computeResolvers
  )
})
