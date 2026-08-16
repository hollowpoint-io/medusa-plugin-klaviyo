import {
  createWorkflow,
  transform,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { useQueryGraphStep } from "@medusajs/medusa/core-flows"

import type { KlaviyoOrder } from "../lib/events"
import { syncKlaviyoOrderStep } from "./steps/sync-commerce-event"

const KLAVIYO_ORDER_FIELDS = [
  "id",
  "display_id",
  "email",
  "created_at",
  "currency_code",
  "subtotal",
  "discount_total",
  "shipping_total",
  "tax_total",
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

export const syncOrderToKlaviyoWorkflow = createWorkflow(
  "sync-order-to-klaviyo",
  function (input: { order_id: string }) {
    const { data: order } = useQueryGraphStep({
      entity: "order",
      fields: KLAVIYO_ORDER_FIELDS,
      filters: { id: input.order_id },
      options: { isList: false, throwIfKeyNotFound: true },
    })
    const stepInput = transform({ order }, ({ order }) => ({
      order: order as unknown as KlaviyoOrder,
    }))
    const result = syncKlaviyoOrderStep(stepInput)

    return new WorkflowResponse(result)
  }
)

export default syncOrderToKlaviyoWorkflow
