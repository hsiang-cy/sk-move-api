import { z } from '@hono/zod-openapi'

// ── Common ─────────────────────────────────────────────────────────────────────

export const ErrorSchema = z.object({
  error: z.string().openapi({ example: '找不到資源' }),
}).openapi('Error')

export const OkSchema = z.object({
  ok: z.literal(true),
}).openapi('Ok')

export const IdParam = z.object({
  id: z.string().uuid().openapi({ description: '資源 UUID', example: '018f3a2b-1234-7abc-8def-000000000001' }),
})

export const StatusEnum = z.enum(['inactive', 'active', 'deleted'])
export const ComputeStatusEnum = z.enum(['initial', 'pending', 'computing', 'completed', 'failed', 'cancelled'])

export const validationHook = (result: any, c: any): any => {
  if (!result.success) {
    const message: string = result.error?.errors?.[0]?.message
    return c.json({ error: message ?? '請求資料格式錯誤' }, 400)
  }
}
