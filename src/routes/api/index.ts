import { OpenAPIHono } from '@hono/zod-openapi'
import { apiReference } from '@scalar/hono-api-reference'
import { tokenAuth } from './middleware'
import { destinationRoutes } from './destinations'
import { vehicleTypeRoutes, vehicleRoutes } from './vehicles'
import { orderRoutes } from './orders'
import { computeRoutes } from './computes'

type Bindings = {
  DATABASE_URL: string
  vrp_api_python: string
  vrp_api_rust: string
  API_BASE_URL: string
  GOOGLE_ROUTES_API_KEY: string
}

const api = new OpenAPIHono<{ Bindings: Bindings }>()

// ── 安全機制（Bearer Token）────────────────────────────────────────────────────

api.openAPIRegistry.registerComponent('securitySchemes', 'Bearer', {
  type: 'http',
  scheme: 'bearer',
  description: 'API Token（格式：sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx）',
})

// ── 文件端點（不需 auth）────────────────────────────────────────────────────────

api.doc31('/openapi.json', {
  openapi: '3.1.0',
  info: {
    title: 'SK Move B2B API',
    version: '1.0.0',
    description: '車輛路徑規劃 B2B REST API，使用 Bearer Token 認證。',
  },
})

api.get('/docs', apiReference({
  url: '/api/v1/openapi.json',
}))

// ── 受保護的資源路由 ────────────────────────────────────────────────────────────

api.use('/destinations/*', tokenAuth)
api.use('/vehicle-types/*', tokenAuth)
api.use('/vehicles/*', tokenAuth)
api.use('/orders/*', tokenAuth)
api.use('/computes/*', tokenAuth)

api.route('/destinations', destinationRoutes)
api.route('/vehicle-types', vehicleTypeRoutes)
api.route('/vehicles', vehicleRoutes)
api.route('/orders', orderRoutes)
api.route('/computes', computeRoutes)

export { api as apiRoutes }
