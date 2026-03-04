import { z } from '@hono/zod-openapi'

// ── Common ─────────────────────────────────────────────────────────────────────

export const ErrorSchema = z.object({
  error: z.string().openapi({ example: '找不到資源' }),
}).openapi('Error')

export const OkSchema = z.object({
  ok: z.literal(true),
}).openapi('Ok')

export const IdParam = z.object({
  id: z.coerce.number().int().positive().openapi({ description: '資源 ID', example: 1 }),
})

export const StatusEnum = z.enum(['inactive', 'active', 'deleted'])
export const ComputeStatusEnum = z.enum(['initial', 'pending', 'computing', 'completed', 'failed', 'cancelled'])

// 統一的 validation 錯誤 hook，第一則 Zod 訊息做為 error 回傳
export const validationHook = (result: any, c: any): any => {
  if (!result.success) {
    const message: string = result.error?.errors?.[0]?.message
    return c.json({ error: message ?? '請求資料格式錯誤' }, 400)
  }
}
