import type {
  KlaviyoEventInput,
  KlaviyoUrlConfig,
} from "../modules/klaviyo/service"

type Metadata = Record<string, unknown>

export type KlaviyoLineItem = {
  id?: string | null
  product_id?: string | null
  variant_id?: string | null
  title?: string | null
  subtitle?: string | null
  thumbnail?: string | null
  quantity?: unknown
  unit_price?: unknown
  total?: unknown
  variant?: { sku?: string | null } | null
  product?: {
    handle?: string | null
    categories?: Array<{ name?: string | null } | null> | null
  } | null
}

type KlaviyoCustomer = {
  id?: string | null
  email?: string | null
  first_name?: string | null
  last_name?: string | null
  metadata?: Metadata | null
} | null

export type KlaviyoCart = {
  id: string
  email?: string | null
  currency_code?: string | null
  total?: unknown
  metadata?: Metadata | null
  customer?: KlaviyoCustomer
  items?: Array<KlaviyoLineItem | null> | null
}

export type KlaviyoOrder = KlaviyoCart & {
  display_id?: unknown
  created_at?: string | Date | null
  subtotal?: unknown
  discount_total?: unknown
  shipping_total?: unknown
  tax_total?: unknown
}

export type MarketingConsentChange = {
  revision: string
  subscribed: boolean
}

export const DEFAULT_URL_CONFIG: KlaviyoUrlConfig = {
  storefrontUrl: "",
  productPath: "/products/{handle}",
  checkoutPath: "/checkout",
  orderPath: "/account/orders/{order_id}",
}

export function metadataRecord(value: unknown): Metadata {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Metadata)
    : {}
}

function consentState(value: unknown): boolean | null {
  if (typeof value !== "string") {
    return null
  }

  switch (value.trim().toUpperCase()) {
    case "SUBSCRIBED":
      return true
    case "UNSUBSCRIBED":
    case "NOT_SUBSCRIBED":
    case "NEVER_SUBSCRIBED":
      return false
    default:
      return null
  }
}

export function resolveEmailMarketingConsent(
  entityMetadata: unknown,
  customerMetadata: unknown
): boolean {
  const entity = metadataRecord(entityMetadata)

  if (entity.marketing_consent_touched === true) {
    return entity.marketing_opt_in === true
  }

  const customer = metadataRecord(customerMetadata)
  const medusaState = consentState(customer.klaviyo_email_marketing_state)

  if (medusaState !== null) {
    return medusaState
  }

  return consentState(customer.shopify_email_marketing_state) === true
}

export function pendingMarketingConsentChange(
  entityMetadata: unknown
): MarketingConsentChange | null {
  const metadata = metadataRecord(entityMetadata)
  const revision = metadata.marketing_consent_updated_at

  if (
    metadata.marketing_consent_touched !== true ||
    typeof revision !== "string" ||
    !revision ||
    metadata.klaviyo_consent_synced_revision === revision
  ) {
    return null
  }

  return {
    revision,
    subscribed: metadata.marketing_opt_in === true,
  }
}

export function hasKlaviyoEventStamp(
  entityMetadata: unknown,
  key: "klaviyo_started_checkout_sent_at" | "klaviyo_placed_order_sent_at"
): boolean {
  return typeof metadataRecord(entityMetadata)[key] === "string"
}

function numberValue(value: unknown): number {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function cleanItems(items: KlaviyoCart["items"]): KlaviyoLineItem[] {
  return (items ?? []).filter((item): item is KlaviyoLineItem => Boolean(item))
}

function itemCategories(item: KlaviyoLineItem): string[] {
  return (item.product?.categories ?? [])
    .map((category) => category?.name?.trim())
    .filter((name): name is string => Boolean(name))
}

export function applyPathTemplate(
  storefrontUrl: string,
  template: string,
  vars: Record<string, string>
): string {
  const path = template.replace(/\{(\w+)\}/g, (_, key: string) => vars[key] ?? "")
  const base = storefrontUrl.replace(/\/$/, "")
  return `${base}${path.startsWith("/") ? path : `/${path}`}`
}

function productUrl(urls: KlaviyoUrlConfig, item: KlaviyoLineItem) {
  const handle = item.product?.handle?.trim()
  return handle
    ? applyPathTemplate(urls.storefrontUrl, urls.productPath, { handle })
    : undefined
}

function eventItems(urls: KlaviyoUrlConfig, items: KlaviyoCart["items"]) {
  return cleanItems(items).map((item) => ({
    ProductID: item.product_id ?? "",
    VariantID: item.variant_id ?? "",
    SKU: item.variant?.sku ?? "",
    ProductName: item.title ?? "",
    VariantName: item.subtitle ?? "",
    Quantity: numberValue(item.quantity),
    ItemPrice: numberValue(item.unit_price),
    RowTotal: numberValue(item.total),
    ImageURL: item.thumbnail ?? "",
    ProductURL: productUrl(urls, item) ?? "",
    Categories: itemCategories(item),
  }))
}

function categoryNames(items: KlaviyoCart["items"]): string[] {
  return [...new Set(cleanItems(items).flatMap(itemCategories))]
}

function profileFor(entity: KlaviyoCart) {
  const email = entity.email ?? entity.customer?.email ?? ""

  return {
    email,
    first_name: entity.customer?.first_name,
    last_name: entity.customer?.last_name,
    properties: entity.customer?.id
      ? { medusa_customer_id: entity.customer.id }
      : undefined,
  }
}

function resolveUrls(
  storefrontUrlOrConfig: string | KlaviyoUrlConfig
): KlaviyoUrlConfig {
  if (typeof storefrontUrlOrConfig === "string") {
    return { ...DEFAULT_URL_CONFIG, storefrontUrl: storefrontUrlOrConfig.replace(/\/$/, "") }
  }
  return storefrontUrlOrConfig
}

export function buildStartedCheckoutEvent(
  cart: KlaviyoCart,
  storefrontUrlOrConfig: string | KlaviyoUrlConfig
): KlaviyoEventInput | null {
  const urls = resolveUrls(storefrontUrlOrConfig)
  const profile = profileFor(cart)
  const items = cleanItems(cart.items)
  const startedAt = metadataRecord(cart.metadata).checkout_started_at

  if (!profile.email || !items.length || typeof startedAt !== "string") {
    return null
  }

  return {
    metric: "Started Checkout",
    profile,
    unique_id: `medusa:cart:${cart.id}:started-checkout`,
    time: startedAt,
    value: numberValue(cart.total),
    value_currency: cart.currency_code ?? undefined,
    properties: {
      CartID: cart.id,
      CheckoutURL: applyPathTemplate(urls.storefrontUrl, urls.checkoutPath, {}),
      ItemNames: items.map((item) => item.title ?? ""),
      Categories: categoryNames(items),
      Items: eventItems(urls, items),
      Source: "Medusa",
    },
  }
}

export function buildPlacedOrderEvent(
  order: KlaviyoOrder,
  storefrontUrlOrConfig: string | KlaviyoUrlConfig
): KlaviyoEventInput | null {
  const urls = resolveUrls(storefrontUrlOrConfig)
  const profile = profileFor(order)
  const items = cleanItems(order.items)

  if (!profile.email || !items.length) {
    return null
  }

  return {
    metric: "Placed Order",
    profile,
    unique_id: `medusa:order:${order.id}:placed`,
    time:
      order.created_at instanceof Date
        ? order.created_at.toISOString()
        : order.created_at ?? undefined,
    value: numberValue(order.total),
    value_currency: order.currency_code ?? undefined,
    properties: {
      OrderID: order.id,
      OrderNumber: numberValue(order.display_id),
      OrderURL: applyPathTemplate(urls.storefrontUrl, urls.orderPath, {
        order_id: order.id,
      }),
      ItemNames: items.map((item) => item.title ?? ""),
      Categories: categoryNames(items),
      Items: eventItems(urls, items),
      Subtotal: numberValue(order.subtotal),
      DiscountValue: numberValue(order.discount_total),
      ShippingValue: numberValue(order.shipping_total),
      TaxValue: numberValue(order.tax_total),
      Source: "Medusa",
    },
  }
}
