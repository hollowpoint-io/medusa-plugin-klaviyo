import {
  createWorkflow,
  transform,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { useQueryGraphStep } from "@medusajs/medusa/core-flows"

import type { KlaviyoCart } from "../lib/events"
import { syncKlaviyoCartStep } from "./steps/sync-commerce-event"

const KLAVIYO_CART_FIELDS = [
  "id",
  "email",
  "currency_code",
  "total",
  "metadata",
  "customer.id",
  "customer.email",
  "customer.first_name",
  "customer.last_name",
  "customer.metadata",
  "items.id",
  "items.product_id",
  "items.variant_id",
  "items.title",
  "items.subtitle",
  "items.thumbnail",
  "items.quantity",
  "items.unit_price",
  "items.total",
  "items.variant.sku",
  "items.product.handle",
  "items.product.categories.name",
]

export const syncCartToKlaviyoWorkflow = createWorkflow(
  "sync-cart-to-klaviyo",
  function (input: { cart_id: string }) {
    const { data: cart } = useQueryGraphStep({
      entity: "cart",
      fields: KLAVIYO_CART_FIELDS,
      filters: { id: input.cart_id },
      options: { isList: false, throwIfKeyNotFound: true },
    })
    const stepInput = transform({ cart }, ({ cart }) => ({
      cart: cart as unknown as KlaviyoCart,
    }))
    const result = syncKlaviyoCartStep(stepInput)

    return new WorkflowResponse(result)
  }
)

export default syncCartToKlaviyoWorkflow
