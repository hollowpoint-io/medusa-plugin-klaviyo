import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

import { resolveKlaviyo } from "../lib/resolve-klaviyo"
import syncCartToKlaviyoWorkflow from "../workflows/sync-cart"

export default async function klaviyoCartUpdatedHandler({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  if (!resolveKlaviyo(container)) {
    return
  }

  try {
    await syncCartToKlaviyoWorkflow(container).run({
      input: { cart_id: data.id },
    })
  } catch (error) {
    container
      .resolve(ContainerRegistrationKeys.LOGGER)
      .error(
        `[klaviyo] cart sync failed cart_id=${data.id} reason=${
          error instanceof Error ? error.message : "unknown"
        }`
      )
  }
}

export const config: SubscriberConfig = {
  event: "cart.updated",
}
