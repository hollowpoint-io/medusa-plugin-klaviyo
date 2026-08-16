import { z } from "@medusajs/framework/zod"

export const PostKlaviyoSubscribeSchema = z.object({
  email: z.string().trim().email().max(254),
  source: z.enum(["homepage", "product-unavailable"]),
  company: z.string().max(200).optional(),
})

export type PostKlaviyoSubscribeBody = z.infer<
  typeof PostKlaviyoSubscribeSchema
>
