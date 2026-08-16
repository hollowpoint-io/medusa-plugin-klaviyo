import {
  applyPathTemplate,
  buildPlacedOrderEvent,
  buildStartedCheckoutEvent,
  pendingMarketingConsentChange,
  resolveEmailMarketingConsent,
} from "../events"

const item = {
  product_id: "prod_1",
  variant_id: "variant_1",
  title: "Blue Raspberry 50ml",
  subtitle: "6mg",
  quantity: 2,
  unit_price: 9.99,
  total: 19.98,
  variant: { sku: "BLUE-6" },
  product: {
    handle: "blue-raspberry-50ml",
    categories: [{ name: "E-liquid" }],
  },
}

describe("Klaviyo commerce event mapping", () => {
  it("uses imported Shopify consent unless checkout explicitly overrides it", () => {
    const customer = { shopify_email_marketing_state: "SUBSCRIBED" }

    expect(resolveEmailMarketingConsent({}, customer)).toBe(true)
    expect(
      resolveEmailMarketingConsent(
        { marketing_consent_touched: true, marketing_opt_in: false },
        customer
      )
    ).toBe(false)
  })

  it("only returns a consent change until its revision is stamped as synced", () => {
    const metadata = {
      marketing_consent_touched: true,
      marketing_opt_in: true,
      marketing_consent_updated_at: "2026-08-09T10:00:00.000Z",
    }

    expect(pendingMarketingConsentChange(metadata)).toEqual({
      revision: "2026-08-09T10:00:00.000Z",
      subscribed: true,
    })
    expect(
      pendingMarketingConsentChange({
        ...metadata,
        klaviyo_consent_synced_revision: "2026-08-09T10:00:00.000Z",
      })
    ).toBeNull()
  })

  it("keeps Medusa prices in major units and generates a stable checkout id", () => {
    const event = buildStartedCheckoutEvent(
      {
        id: "cart_1",
        email: "customer@example.com",
        currency_code: "gbp",
        total: 49.99,
        metadata: { checkout_started_at: "2026-08-09T11:00:00.000Z" },
        customer: { id: "cus_1" },
        items: [item],
      },
      "https://shop.example.com"
    )

    expect(event).toMatchObject({
      metric: "Started Checkout",
      unique_id: "medusa:cart:cart_1:started-checkout",
      time: "2026-08-09T11:00:00.000Z",
      value: 49.99,
      value_currency: "gbp",
      profile: {
        email: "customer@example.com",
        properties: { medusa_customer_id: "cus_1" },
      },
      properties: {
        CheckoutURL: "https://shop.example.com/checkout",
      },
    })
    expect((event?.properties.Items as Array<{ ItemPrice: number; ProductURL: string }>)[0]).toMatchObject({
      ItemPrice: 9.99,
      ProductURL: "https://shop.example.com/products/blue-raspberry-50ml",
    })
  })

  it("does not call an add-to-cart update a started checkout", () => {
    expect(
      buildStartedCheckoutEvent(
        {
          id: "cart_1",
          email: "customer@example.com",
          total: 9.99,
          items: [item],
        },
        "https://shop.example.com"
      )
    ).toBeNull()
  })

  it("generates a stable placed-order id and account link", () => {
    const event = buildPlacedOrderEvent(
      {
        id: "order_1",
        display_id: 1234,
        email: "customer@example.com",
        currency_code: "gbp",
        total: 49.99,
        created_at: new Date("2026-08-09T12:00:00.000Z"),
        items: [item],
      },
      "https://shop.example.com"
    )

    expect(event).toMatchObject({
      metric: "Placed Order",
      unique_id: "medusa:order:order_1:placed",
      time: "2026-08-09T12:00:00.000Z",
      value: 49.99,
      properties: {
        OrderID: "order_1",
        OrderNumber: 1234,
        OrderURL: "https://shop.example.com/account/orders/order_1",
      },
    })
  })

  it("honours custom path templates", () => {
    expect(
      applyPathTemplate("https://shop.example.com", "/gb/products/{handle}", {
        handle: "widget",
      })
    ).toBe("https://shop.example.com/gb/products/widget")
  })
})
