import { z } from '@hono/zod-openapi'
import { StatusEnum } from '../schemas'

export const OrderSchema = z.object({
  id: z.uuid(),
  account_id: z.uuid(),
  status: StatusEnum,
  data: z.any(),
  location_snapshot: z.any(),
  bento_order_snapshot: z.any(),
  vehicle_snapshot: z.any(),
  comment_for_account: z.string().nullable(),
  created_at: z.number().nullable(),
  updated_at: z.number().nullable(),
}).openapi('Order')

export const CreateOrderBody = z.object({
  bento_order_ids: z.array(z.uuid()).min(1, '至少需要 1 筆便當訂單').openapi({
    description: '便當訂單 UUID 陣列',
    example: ['018f3a2b-0001-7abc-8def-000000000001'],
  }),
  vehicle_ids: z.array(z.uuid()).min(1, '至少需要 1 輛車輛').openapi({
    description: '車輛 UUID 陣列',
    example: ['018f3a2b-0002-7abc-8def-000000000002'],
  }),
  data: z.any().optional(),
  comment_for_account: z.string().optional(),
}).openapi('CreateOrderBody')

export const TriggerComputeBody = z.object({
  data: z.any().optional(),
  comment_for_account: z.string().optional(),
  time_limit_seconds: z.number().int().positive().optional().openapi({ example: 30 }),
}).openapi('TriggerComputeBody')
