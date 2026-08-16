import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

import { clientKeyFromHeaders } from "../../../../lib/rate-limit"
import { resolveKlaviyo } from "../../../../lib/resolve-klaviyo"
import subscribeNewsletterWorkflow from "../../../../workflows/subscribe-newsletter"
import type { PostKlaviyoSubscribeBody } from "./validators"

export const POST = async (
  req: MedusaRequest<PostKlaviyoSubscribeBody>,
  res: MedusaResponse
) => {
  const body = req.validatedBody

  if (body.company?.trim()) {
    return res.status(202).json({ accepted: true })
  }

  const klaviyo = resolveKlaviyo(req.scope)
  if (!klaviyo) {
    return res.status(503).json({
      message: "Newsletter signup is temporarily unavailable.",
    })
  }

  const allowed = klaviyo.consumeRateLimit(
    `klaviyo:${clientKeyFromHeaders(req.headers as Record<string, unknown>)}`
  )
  if (!allowed) {
    return res.status(429).json({
      message: "Please wait a little before trying that again.",
    })
  }

  try {
    await subscribeNewsletterWorkflow(req.scope).run({
      input: {
        email: body.email.toLowerCase(),
        source: body.source,
      },
    })
  } catch (error) {
    req.scope
      .resolve(ContainerRegistrationKeys.LOGGER)
      .error(
        `[klaviyo] newsletter subscription failed source=${body.source} reason=${
          error instanceof Error ? error.message : "unknown"
        }`
      )

    return res.status(502).json({
      message: "Newsletter signup is temporarily unavailable.",
    })
  }

  return res.status(202).json({ accepted: true })
}
