import { Hono } from 'hono'
import { tokenAuth } from './middleware'
import { destinationRoutes } from './destinations'
import { vehicleTypeRoutes, vehicleRoutes } from './vehicles'
import { orderRoutes } from './orders'
import { computeRoutes } from './compute'

type Bindings = {
  DATABASE_URL: string
  ORTOOLS_URL: string
  API_BASE_URL: string
  GOOGLE_ROUTES_API_KEY: string
}

const api = new Hono<{ Bindings: Bindings }>()

api.use('*', tokenAuth)

api.route('/destinations', destinationRoutes)
api.route('/vehicle-types', vehicleTypeRoutes)
api.route('/vehicles', vehicleRoutes)
api.route('/orders', orderRoutes)
api.route('/computes', computeRoutes)

export { api as apiRoutes }
