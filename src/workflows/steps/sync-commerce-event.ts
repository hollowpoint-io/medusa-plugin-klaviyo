import type {
  ICartModuleService,
  ICustomerModuleService,
  IOrderModuleService,
} from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"

import {
  buildPlacedOrderEvent,
  buildStartedCheckoutEvent,
  hasKlaviyoEventStamp,
  metadataRecord,
  pendingMarketingConsentChange,
  resolveEmailMarketingConsent,
  type KlaviyoCart,
  type KlaviyoOrder,
} from "../../lib/events"
import { KLAVIYO_MODULE } from "../../modules/klaviyo"
import type KlaviyoModuleService from "../../modules/klaviyo/service"

type CommerceSyncResult = {
  consent_synced: boolean
  event_sent: boolean
  skipped: boolean
}

type KlaviyoServiceLike = Pick<
  KlaviyoModuleService,
  "setEmailMarketingConsent" | "storefrontUrl" | "trackEvent" | "sourceName" | "urlConfig"
>

type CustomerServiceLike = Pick<ICustomerModuleService, "updateCustomers">
type CartServiceLike = Pick<ICartModuleService, "updateCarts">
type OrderServiceLike = Pick<IOrderModuleService, "updateOrders">

async function stampCustomerConsent(
  customer: KlaviyoCart["customer"],
  subscribed: boolean,
  revision: string,
  customerService: CustomerServiceLike
) {
  if (!customer?.id) {
    return
  }

  await customerService.updateCustomers(customer.id, {
    metadata: {
      ...metadataRecord(customer.metadata),
      klaviyo_email_marketing_state: subscribed
        ? "SUBSCRIBED"
        : "UNSUBSCRIBED",
      klaviyo_email_consent_updated_at: revision,
      klaviyo_email_consent_source: "checkout",
    },
  })
}

export async function syncKlaviyoCart(
  cart: KlaviyoCart,
  services: {
    klaviyo: KlaviyoServiceLike
    customer: CustomerServiceLike
    cart: CartServiceLike
  },
  now = new Date().toISOString()
): Promise<CommerceSyncResult> {
  const metadata = metadataRecord(cart.metadata)
  const consentChange = pendingMarketingConsentChange(metadata)
  const consented = resolveEmailMarketingConsent(
    metadata,
    cart.customer?.metadata
  )
  const alreadySent = hasKlaviyoEventStamp(
    metadata,
    "klaviyo_started_checkout_sent_at"
  )
  const event = consented && !alreadySent
    ? buildStartedCheckoutEvent(cart, services.klaviyo.urlConfig)
    : null

  if (!consentChange && !event) {
    return { consent_synced: false, event_sent: false, skipped: true }
  }

  const email = cart.email ?? cart.customer?.email

  if (!email) {
    return { consent_synced: false, event_sent: false, skipped: true }
  }

  if (consentChange) {
    await services.klaviyo.setEmailMarketingConsent({
      email,
      subscribed: consentChange.subscribed,
      source: `${services.klaviyo.sourceName} checkout`,
    })
  }

  if (event) {
    await services.klaviyo.trackEvent(event)
  }

  if (consentChange) {
    await stampCustomerConsent(
      cart.customer,
      consentChange.subscribed,
      consentChange.revision,
      services.customer
    )
  }

  await services.cart.updateCarts(cart.id, {
    metadata: {
      ...metadata,
      ...(consentChange
        ? {
            klaviyo_consent_synced_revision: consentChange.revision,
            klaviyo_consent_synced_at: now,
          }
        : {}),
      ...(event ? { klaviyo_started_checkout_sent_at: now } : {}),
    },
  })

  return {
    consent_synced: Boolean(consentChange),
    event_sent: Boolean(event),
    skipped: false,
  }
}

export async function syncKlaviyoOrder(
  order: KlaviyoOrder,
  services: {
    klaviyo: KlaviyoServiceLike
    customer: CustomerServiceLike
    order: OrderServiceLike
  },
  now = new Date().toISOString()
): Promise<CommerceSyncResult> {
  const metadata = metadataRecord(order.metadata)
  const consentChange = pendingMarketingConsentChange(metadata)
  const consented = resolveEmailMarketingConsent(
    metadata,
    order.customer?.metadata
  )
  const alreadySent = hasKlaviyoEventStamp(
    metadata,
    "klaviyo_placed_order_sent_at"
  )
  const event = consented && !alreadySent
    ? buildPlacedOrderEvent(order, services.klaviyo.urlConfig)
    : null

  if (!consentChange && !event) {
    return { consent_synced: false, event_sent: false, skipped: true }
  }

  const email = order.email ?? order.customer?.email

  if (!email) {
    return { consent_synced: false, event_sent: false, skipped: true }
  }

  if (consentChange) {
    await services.klaviyo.setEmailMarketingConsent({
      email,
      subscribed: consentChange.subscribed,
      source: `${services.klaviyo.sourceName} checkout`,
    })
  }

  if (event) {
    await services.klaviyo.trackEvent(event)
  }

  if (consentChange) {
    await stampCustomerConsent(
      order.customer,
      consentChange.subscribed,
      consentChange.revision,
      services.customer
    )
  }

  await services.order.updateOrders(order.id, {
    metadata: {
      ...metadata,
      ...(consentChange
        ? {
            klaviyo_consent_synced_revision: consentChange.revision,
            klaviyo_consent_synced_at: now,
          }
        : {}),
      ...(event ? { klaviyo_placed_order_sent_at: now } : {}),
    },
  })

  return {
    consent_synced: Boolean(consentChange),
    event_sent: Boolean(event),
    skipped: false,
  }
}

export const syncKlaviyoCartStep = createStep(
  "sync-klaviyo-cart",
  async ({ cart }: { cart: KlaviyoCart }, { container }) => {
    const result = await syncKlaviyoCart(cart, {
      klaviyo: container.resolve<KlaviyoModuleService>(KLAVIYO_MODULE),
      customer: container.resolve<ICustomerModuleService>(Modules.CUSTOMER),
      cart: container.resolve<ICartModuleService>(Modules.CART),
    })

    return new StepResponse(result)
  }
)

export const syncKlaviyoOrderStep = createStep(
  "sync-klaviyo-order",
  async ({ order }: { order: KlaviyoOrder }, { container }) => {
    const result = await syncKlaviyoOrder(order, {
      klaviyo: container.resolve<KlaviyoModuleService>(KLAVIYO_MODULE),
      customer: container.resolve<ICustomerModuleService>(Modules.CUSTOMER),
      order: container.resolve<IOrderModuleService>(Modules.ORDER),
    })

    return new StepResponse(result)
  }
)
