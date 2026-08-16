import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

import { resolveKlaviyo } from "../lib/resolve-klaviyo"
import syncOrderToKlaviyoWorkflow from "../workflows/sync-order"

export default async function klaviyoOrderPlacedHandler({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  if (!resolveKlaviyo(container)) {
    return
  }

  try {
    await syncOrderToKlaviyoWorkflow(container).run({
      input: { order_id: data.id },
    })
  } catch (error) {
    container
      .resolve(ContainerRegistrationKeys.LOGGER)
      .error(
        `[klaviyo] order sync failed order_id=${data.id} reason=${
          error instanceof Error ? error.message : "unknown"
        }`
      )
  }
}

export const config: SubscriberConfig = {
  event: "order.placed",
}
