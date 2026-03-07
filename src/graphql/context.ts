import { NeonHttpDatabase } from 'drizzle-orm/neon-http'
import * as schema_db from '../db/schema'

export type Context = {
  db: NeonHttpDatabase<typeof schema_db>
  user: { account_id: string; account_role: string } | null
  env: {
    DATABASE_URL: string
    JWT_SECRET: string
    vrp_api_python: string
    vrp_api_rust: string
    API_BASE_URL: string
    GOOGLE_ROUTES_API_KEY: string
    QSTASH_URL: string
    QSTASH_TOKEN: string
    QSTASH_CURRENT_SIGNING_KEY: string
    QSTASH_NEXT_SIGNING_KEY: string
  }
}

const ROLE_ORDER = ['just_view', 'guest', 'normal', 'manager', 'admin']

export function requireAuth(user: Context['user'], minRole = 'just_view'): void {
  if (!user) throw new Error('Unauthorized')
  if (ROLE_ORDER.indexOf(user.account_role) < ROLE_ORDER.indexOf(minRole))
    throw new Error('Forbidden')
}
