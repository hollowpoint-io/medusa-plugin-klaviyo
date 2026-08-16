import { MedusaError } from "@medusajs/framework/utils"

import KlaviyoModuleService from "../service"

const logger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}

const fetchMock = jest.fn()

function buildService(overrides: Record<string, unknown> = {}) {
  return new KlaviyoModuleService(
    { logger: logger as any },
    {
      api_key: "private_test_key",
      list_id: "list_123",
      revision: "2026-07-15",
      storefront_url: "https://shop.example.com/",
      source_name: "Medusa",
      ...overrides,
    }
  )
}

describe("KlaviyoModuleService", () => {
  beforeEach(() => {
    fetchMock.mockReset()
    logger.error.mockReset()
    global.fetch = fetchMock
    fetchMock.mockResolvedValue({ status: 202 })
  })

  afterAll(() => {
    jest.restoreAllMocks()
  })

  it("posts events with the pinned revision and major-unit value", async () => {
    await buildService().trackEvent({
      metric: "Placed Order",
      profile: { email: "customer@example.com" },
      properties: { OrderID: "order_1" },
      unique_id: "medusa:order:order_1:placed",
      value: 49.99,
      value_currency: "gbp",
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    const body = JSON.parse(init.body)

    expect(url).toBe("https://a.klaviyo.com/api/events")
    expect(init.headers).toMatchObject({
      Authorization: "Klaviyo-API-Key private_test_key",
      revision: "2026-07-15",
    })
    expect(body.data.attributes).toMatchObject({
      unique_id: "medusa:order:order_1:placed",
      value: 49.99,
      value_currency: "GBP",
    })
  })

  it("subscribes a profile to the configured list", async () => {
    await buildService().setEmailMarketingConsent({
      email: "customer@example.com",
      subscribed: true,
      source: "Medusa checkout",
    })

    const [url, init] = fetchMock.mock.calls[0]
    const body = JSON.parse(init.body)

    expect(url).toContain("profile-subscription-bulk-create-jobs")
    expect(body.data.attributes).toMatchObject({
      custom_source: "Medusa checkout",
      profiles: {
        data: [
          {
            attributes: {
              subscriptions: {
                email: { marketing: { consent: "SUBSCRIBED" } },
              },
            },
          },
        ],
      },
    })
    expect(body.data.relationships.list.data.id).toBe("list_123")
  })

  it("uses the unsubscribe job for an explicit opt-out", async () => {
    await buildService().setEmailMarketingConsent({
      email: "customer@example.com",
      subscribed: false,
    })

    const [url, init] = fetchMock.mock.calls[0]
    const body = JSON.parse(init.body)

    expect(url).toContain("profile-subscription-bulk-delete-jobs")
    expect(body.data.attributes.profiles.data[0].attributes.subscriptions.email.marketing)
      .toEqual({ consent: "UNSUBSCRIBED" })
  })

  it("sanitizes rejected responses instead of logging profile data", async () => {
    fetchMock.mockResolvedValue({
      status: 400,
      json: jest.fn().mockResolvedValue({
        errors: [
          {
            code: "invalid",
            detail: "customer@example.com and private_test_key are invalid",
          },
        ],
      }),
    })

    await expect(
      buildService().trackEvent({
        metric: "Placed Order",
        profile: { email: "customer@example.com" },
        properties: {},
        unique_id: "order_1",
      })
    ).rejects.toThrow(MedusaError)

    const logged = logger.error.mock.calls.flat().join(" ")
    expect(logged).toContain("status=400 code=invalid")
    expect(logged).not.toContain("customer@example.com")
    expect(logged).not.toContain("private_test_key")
  })

  it("is unconfigured until the required options are present", () => {
    const empty = new KlaviyoModuleService({ logger: logger as any }, {})
    expect(empty.isConfigured()).toBe(false)
    expect(buildService().isConfigured()).toBe(true)
  })

  it("rejects a malformed revision", () => {
    expect(() =>
      KlaviyoModuleService.validateOptions({ revision: "not-a-date" })
    ).toThrow(MedusaError)
  })
})
