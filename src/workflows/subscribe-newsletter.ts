import {
  createStep,
  createWorkflow,
  StepResponse,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"

import { KLAVIYO_MODULE } from "../modules/klaviyo"
import type KlaviyoModuleService from "../modules/klaviyo/service"

export type SubscribeNewsletterInput = {
  email: string
  source: "homepage" | "product-unavailable"
}

const subscribeNewsletterStep = createStep(
  "subscribe-newsletter",
  async (input: SubscribeNewsletterInput, { container }) => {
    const klaviyo = container.resolve<KlaviyoModuleService>(KLAVIYO_MODULE)

    await klaviyo.setEmailMarketingConsent({
      email: input.email,
      subscribed: true,
      source: `${klaviyo.sourceName} ${input.source}`,
    })

    return new StepResponse({ accepted: true })
  }
)

export const subscribeNewsletterWorkflow = createWorkflow(
  "subscribe-newsletter",
  function (input: SubscribeNewsletterInput) {
    const result = subscribeNewsletterStep(input)
    return new WorkflowResponse(result)
  }
)

export default subscribeNewsletterWorkflow
