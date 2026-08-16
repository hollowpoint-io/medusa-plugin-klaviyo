import {
  syncKlaviyoCart,
  syncKlaviyoOrder,
} from "../sync-commerce-event"
import { DEFAULT_URL_CONFIG } from "../../../lib/events"

function services() {
  return {
    klaviyo: {
      storefrontUrl: "https://shop.example.com",
      sourceName: "Medusa",
      urlConfig: {
        ...DEFAULT_URL_CONFIG,
        storefrontUrl: "https://shop.example.com",
      },
      setEmailMarketingConsent: jest.fn().mockResolvedValue(undefined),
      trackEvent: jest.fn().mockResolvedValue(undefined),
    },
    customer: {
      updateCustomers: jest.fn().mockResolvedValue(undefined),
    },
    cart: {
      updateCarts: jest.fn().mockResolvedValue(undefined),
    },
    order: {
      updateOrders: jest.fn().mockResolvedValue(undefined),
    },
  }
}

const item = {
  product_id: "prod_1",
  variant_id: "variant_1",
  title: "Test liquid",
  quantity: 1,
  unit_price: 9.99,
  total: 9.99,
}

describe("Klaviyo commerce synchronization", () => {
  it("syncs explicit opt-in, sends checkout, and stamps both records", async () => {
    const deps = services()
    const result = await syncKlaviyoCart(
      {
        id: "cart_1",
        email: "customer@example.com",
        currency_code: "gbp",
        total: 9.99,
        metadata: {
          marketing_consent_touched: true,
          marketing_opt_in: true,
          marketing_consent_updated_at: "revision_1",
          checkout_started_at: "2026-08-09T11:00:00.000Z",
        },
        customer: { id: "cus_1", metadata: {} },
        items: [item],
      },
      deps,
      "2026-08-09T12:00:00.000Z"
    )

    expect(result).toEqual({
      consent_synced: true,
      event_sent: true,
      skipped: false,
    })
    expect(deps.klaviyo.setEmailMarketingConsent).toHaveBeenCalledWith({
      email: "customer@example.com",
      subscribed: true,
      source: "Medusa checkout",
    })
    expect(deps.klaviyo.trackEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        unique_id: "medusa:cart:cart_1:started-checkout",
      })
    )
    expect(deps.customer.updateCustomers).toHaveBeenCalledWith(
      "cus_1",
      expect.objectContaining({
        metadata: expect.objectContaining({
          klaviyo_email_marketing_state: "SUBSCRIBED",
        }),
      })
    )
    expect(deps.cart.updateCarts).toHaveBeenCalledWith(
      "cart_1",
      expect.objectContaining({
        metadata: expect.objectContaining({
          klaviyo_consent_synced_revision: "revision_1",
          klaviyo_started_checkout_sent_at: "2026-08-09T12:00:00.000Z",
        }),
      })
    )
  })

  it("honors explicit opt-out without sending a marketing event", async () => {
    const deps = services()
    const result = await syncKlaviyoCart(
      {
        id: "cart_1",
        email: "customer@example.com",
        metadata: {
          marketing_consent_touched: true,
          marketing_opt_in: false,
          marketing_consent_updated_at: "revision_2",
        },
        customer: {
          id: "cus_1",
          metadata: { shopify_email_marketing_state: "SUBSCRIBED" },
        },
        items: [item],
      },
      deps
    )

    expect(result).toMatchObject({ consent_synced: true, event_sent: false })
    expect(deps.klaviyo.setEmailMarketingConsent).toHaveBeenCalledWith(
      expect.objectContaining({ subscribed: false })
    )
    expect(deps.klaviyo.trackEvent).not.toHaveBeenCalled()
  })

  it("sends once for an imported subscriber without rewriting consent", async () => {
    const deps = services()
    await syncKlaviyoOrder(
      {
        id: "order_1",
        email: "customer@example.com",
        total: 9.99,
        metadata: {},
        customer: {
          id: "cus_1",
          metadata: { shopify_email_marketing_state: "SUBSCRIBED" },
        },
        items: [item],
      },
      deps
    )

    expect(deps.klaviyo.setEmailMarketingConsent).not.toHaveBeenCalled()
    expect(deps.klaviyo.trackEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        unique_id: "medusa:order:order_1:placed",
      })
    )
    expect(deps.order.updateOrders).toHaveBeenCalledTimes(1)
  })

  it("ignores a subscribed shopper's cart updates before checkout", async () => {
    const deps = services()
    const result = await syncKlaviyoCart(
      {
        id: "cart_1",
        email: "customer@example.com",
        metadata: {},
        customer: {
          metadata: { shopify_email_marketing_state: "SUBSCRIBED" },
        },
        items: [item],
      },
      deps
    )

    expect(result).toEqual({
      consent_synced: false,
      event_sent: false,
      skipped: true,
    })
    expect(deps.klaviyo.trackEvent).not.toHaveBeenCalled()
    expect(deps.cart.updateCarts).not.toHaveBeenCalled()
  })

  it("skips a commerce event that is already stamped", async () => {
    const deps = services()
    const result = await syncKlaviyoCart(
      {
        id: "cart_1",
        email: "customer@example.com",
        metadata: {
          klaviyo_started_checkout_sent_at: "2026-08-09T12:00:00.000Z",
        },
        customer: {
          metadata: { shopify_email_marketing_state: "SUBSCRIBED" },
        },
        items: [item],
      },
      deps
    )

    expect(result).toEqual({
      consent_synced: false,
      event_sent: false,
      skipped: true,
    })
    expect(deps.klaviyo.trackEvent).not.toHaveBeenCalled()
    expect(deps.cart.updateCarts).not.toHaveBeenCalled()
  })
})
