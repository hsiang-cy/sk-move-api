import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { createYoga } from 'graphql-yoga'
import { createDb } from './db/connect'
import { schema, Context } from './graphql/schema'
import { verify } from 'hono/jwt'
import { webhookRoutes } from './routes/webhook'
import { apiRoutes } from './routes/api'

type Bindings = {
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

const app = new Hono<{ Bindings: Bindings }>()

// 啟動檢查旗標，確保該個體(Isolate)只檢查一次環境變數配置
let isStartupChecked = false

function performStartupChecks(env: Bindings) {
  if (isStartupChecked) return

  // 1. 檢查必要的環境變數是否定義 (純記憶體操作，極快)
  const requiredEnvVars = ['DATABASE_URL', 'JWT_SECRET', 'vrp_api_python', 'vrp_api_rust', 'API_BASE_URL', 'GOOGLE_ROUTES_API_KEY', 'QSTASH_URL', 'QSTASH_TOKEN', 'QSTASH_CURRENT_SIGNING_KEY', 'QSTASH_NEXT_SIGNING_KEY'] as const
  for (const key of requiredEnvVars) {
    if (!env[key]) {
      console.error(`[Startup Error] Missing environment variable: ${key}`)
      throw new Error(`Critical environment variable ${key} is missing.`)
    }
  }

  isStartupChecked = true
}

app
  .use('*', async (c, next) => {
    performStartupChecks(c.env)
    await next()
  })

  .get('/version', (c) => {
    return c.text('0.1.0')
  })

// GraphQL Yoga Handler
const yoga = createYoga<{ request: Request; env: Bindings }, Context>({
  schema,
  context: async ({ request, env }) => {
    // 獲取 Database instance (Drizzle)
    const database = createDb(env.DATABASE_URL)

    // 從 Header 嘗試獲取 User
    let currentUser = null
    const authHeader = request.headers.get('Authorization')
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1]
      try {
        currentUser = await verify(token, env.JWT_SECRET, 'HS256')
      } catch (e) {
        // Token invalid, keep currentUser null
      }
    }

    return {
      db: database,
      user: currentUser as { account_id: number; account_role: string } | null,
      env: env
    }
  }
})

app.onError((err, c) => {
  if (err instanceof HTTPException) {
    return c.json({ error: err.message }, err.status)
  }
  console.error(err)
  return c.json({ error: '伺服器內部錯誤' }, 500)
})

// Webhook routes (server-to-server, no JWT auth)
app.route('/', webhookRoutes)

// B2B API routes (token-based auth)
app.route('/api/v1', apiRoutes)

// 將 Yoga 掛載到 /graphql
app.all('/graphql', (c) => yoga.fetch(c.req.raw, { env: c.env }))

export default app
