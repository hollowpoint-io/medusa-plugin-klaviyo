import type { Logger } from "@medusajs/framework/types"
import { MedusaError } from "@medusajs/framework/utils"
import {
  createMemoryRateLimiter,
  type MemoryRateLimiter,
} from "../../lib/rate-limit"

type InjectedDependencies = {
  logger: Logger
}

export type KlaviyoModuleOptions = {
  api_key?: string
  list_id?: string
  storefront_url?: string
  revision?: string
  source_name?: string
  product_path?: string
  checkout_path?: string
  order_path?: string
  rate_limit?: { max: number; window_ms: number }
}

export type KlaviyoUrlConfig = {
  storefrontUrl: string
  productPath: string
  checkoutPath: string
  orderPath: string
}

export type KlaviyoProfile = {
  email: string
  first_name?: string | null
  last_name?: string | null
  properties?: Record<string, unknown>
}

export type KlaviyoEventInput = {
  metric: string
  profile: KlaviyoProfile
  properties: Record<string, unknown>
  unique_id: string
  time?: string
  value?: number
  value_currency?: string
}

const KLAVIYO_API_BASE_URL = "https://a.klaviyo.com"
const REQUEST_TIMEOUT_MS = 10_000
export const DEFAULT_KLAVIYO_REVISION = "2026-07-15"
const REVISION_RE = /^\d{4}-\d{2}-\d{2}(?:\.[a-z0-9_-]+)?$/i

class KlaviyoModuleService {
  protected readonly logger_: Logger
  protected readonly options_: KlaviyoModuleOptions
  protected readonly limiter_: MemoryRateLimiter | null

  constructor({ logger }: InjectedDependencies, options: KlaviyoModuleOptions = {}) {
    KlaviyoModuleService.validateOptions(options)
    this.logger_ = logger
    this.options_ = options
    this.limiter_ = options.rate_limit
      ? createMemoryRateLimiter(options.rate_limit.max, options.rate_limit.window_ms)
      : null
  }

  static validateOptions(options: KlaviyoModuleOptions = {}) {
    if (options.revision && !REVISION_RE.test(options.revision.trim())) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Klaviyo module option `revision` must be a Klaviyo date revision (YYYY-MM-DD)"
      )
    }
  }

  isConfigured(): boolean {
    return Boolean(
      this.options_.api_key?.trim() &&
        this.options_.list_id?.trim() &&
        this.options_.storefront_url?.trim()
    )
  }

  get sourceName(): string {
    return this.options_.source_name?.trim() || "Medusa"
  }

  get storefrontUrl(): string {
    return (this.options_.storefront_url ?? "").replace(/\/$/, "")
  }

  get urlConfig(): KlaviyoUrlConfig {
    return {
      storefrontUrl: this.storefrontUrl,
      productPath: this.options_.product_path?.trim() || "/products/{handle}",
      checkoutPath: this.options_.checkout_path?.trim() || "/checkout",
      orderPath: this.options_.order_path?.trim() || "/account/orders/{order_id}",
    }
  }

  consumeRateLimit(key: string): boolean {
    if (!this.limiter_) return true
    return this.limiter_.consume(key)
  }

  async trackEvent(input: KlaviyoEventInput): Promise<void> {
    await this.request("/api/events", {
      data: {
        type: "event",
        attributes: {
          properties: input.properties,
          metric: {
            data: {
              type: "metric",
              attributes: { name: input.metric },
            },
          },
          profile: {
            data: {
              type: "profile",
              attributes: {
                email: input.profile.email,
                ...(input.profile.first_name
                  ? { first_name: input.profile.first_name }
                  : {}),
                ...(input.profile.last_name
                  ? { last_name: input.profile.last_name }
                  : {}),
                ...(input.profile.properties
                  ? { properties: input.profile.properties }
                  : {}),
              },
            },
          },
          unique_id: input.unique_id,
          ...(input.time ? { time: input.time } : {}),
          ...(input.value !== undefined ? { value: input.value } : {}),
          ...(input.value_currency
            ? { value_currency: input.value_currency.toUpperCase() }
            : {}),
        },
      },
    })
  }

  async setEmailMarketingConsent(input: {
    email: string
    subscribed: boolean
    source?: string
  }): Promise<void> {
    const consent = input.subscribed ? "SUBSCRIBED" : "UNSUBSCRIBED"
    const jobType = input.subscribed
      ? "profile-subscription-bulk-create-job"
      : "profile-subscription-bulk-delete-job"
    const path = input.subscribed
      ? "/api/profile-subscription-bulk-create-jobs"
      : "/api/profile-subscription-bulk-delete-jobs"

    await this.request(path, {
      data: {
        type: jobType,
        attributes: {
          ...(input.subscribed
            ? { custom_source: input.source ?? this.sourceName }
            : {}),
          profiles: {
            data: [
              {
                type: "profile",
                attributes: {
                  email: input.email,
                  subscriptions: {
                    email: {
                      marketing: { consent },
                    },
                  },
                },
              },
            ],
          },
        },
        relationships: {
          list: {
            data: {
              type: "list",
              id: this.options_.list_id,
            },
          },
        },
      },
    })
  }

  private async request(path: string, body: Record<string, unknown>): Promise<void> {
    let response: Response

    try {
      response = await fetch(`${KLAVIYO_API_BASE_URL}${path}`, {
        method: "POST",
        headers: {
          Authorization: `Klaviyo-API-Key ${this.options_.api_key}`,
          Accept: "application/vnd.api+json",
          "Content-Type": "application/vnd.api+json",
          revision: this.options_.revision?.trim() || DEFAULT_KLAVIYO_REVISION,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
    } catch (error) {
      const reason = error instanceof Error && error.name === "TimeoutError"
        ? "timed out"
        : "network failure"
      throw new MedusaError(
        MedusaError.Types.UNEXPECTED_STATE,
        `Klaviyo request ${reason}`
      )
    }

    if (response.status === 202) {
      return
    }

    let errorCode = "unknown_error"
    try {
      const payload = (await response.json()) as {
        errors?: Array<{ code?: string }>
      }
      const providerCode = payload.errors?.[0]?.code

      if (
        typeof providerCode === "string" &&
        /^[a-z0-9_.-]{1,64}$/i.test(providerCode)
      ) {
        errorCode = providerCode
      }
    } catch {
      // Klaviyo can return an empty/non-JSON body at the edge. Never include it
      // in logs because it may echo profile identifiers.
    }

    this.logger_.error(
      `[klaviyo] API request rejected status=${response.status} code=${errorCode}`
    )
    throw new MedusaError(
      MedusaError.Types.UNEXPECTED_STATE,
      `Klaviyo request rejected (${response.status}, ${errorCode})`
    )
  }
}

export default KlaviyoModuleService
