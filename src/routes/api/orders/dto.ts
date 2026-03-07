import { createRoute, z } from '@hono/zod-openapi'
import { ErrorSchema, OkSchema, IdParam } from '../schemas'
import { ComputeSchema } from '../computes'
import { OrderSchema, CreateOrderBody, TriggerComputeBody } from './schema'

const tags = ['訂單']
const security = [{ Bearer: [] }]
const auth401 = { content: { 'application/json': { schema: ErrorSchema } }, description: '未授權' }
const notFound404 = { content: { 'application/json': { schema: ErrorSchema } }, description: '找不到資源' }

export const listOrdersRoute = createRoute({
  method: 'get', path: '/', tags, summary: '取得所有訂單', security,
  responses: {
    200: { content: { 'application/json': { schema: z.array(OrderSchema) } }, description: '訂單列表' },
    401: auth401,
  },
})

export const getOrderRoute = createRoute({
  method: 'get', path: '/{id}', tags, summary: '取得單一訂單', security,
  request: { params: IdParam },
  responses: {
    200: { content: { 'application/json': { schema: OrderSchema } }, description: '訂單資料' },
    401: auth401,
    404: notFound404,
  },
})

export const createOrderRoute = createRoute({
  method: 'post', path: '/', tags, summary: '建立訂單（從便當訂單 + 車輛建立 VRP 計算任務組）', security,
  request: { body: { content: { 'application/json': { schema: CreateOrderBody } }, required: true } },
  responses: {
    201: { content: { 'application/json': { schema: OrderSchema } }, description: '建立成功' },
    400: { content: { 'application/json': { schema: ErrorSchema } }, description: '請求資料錯誤' },
    401: auth401,
    404: notFound404,
    422: { content: { 'application/json': { schema: ErrorSchema } }, description: '無法計算兩點間的路線' },
    502: { content: { 'application/json': { schema: ErrorSchema } }, description: 'Google Routes API 發生錯誤' },
  },
})

export const deleteOrderRoute = createRoute({
  method: 'delete', path: '/{id}', tags, summary: '刪除訂單', security,
  request: { params: IdParam },
  responses: {
    200: { content: { 'application/json': { schema: OkSchema } }, description: '刪除成功' },
    401: auth401,
    404: notFound404,
  },
})

export const triggerComputeRoute = createRoute({
  method: 'post', path: '/{id}/compute', tags, summary: '觸發訂單計算', security,
  request: {
    params: IdParam,
    body: { content: { 'application/json': { schema: TriggerComputeBody } }, required: false },
  },
  responses: {
    202: { content: { 'application/json': { schema: ComputeSchema } }, description: '計算任務已建立' },
    401: auth401,
    404: notFound404,
  },
})

export const listOrderComputesRoute = createRoute({
  method: 'get', path: '/{id}/computes', tags, summary: '取得訂單的所有計算任務', security,
  request: { params: IdParam },
  responses: {
    200: { content: { 'application/json': { schema: z.array(ComputeSchema) } }, description: '計算任務列表' },
    401: auth401,
    404: notFound404,
  },
})
