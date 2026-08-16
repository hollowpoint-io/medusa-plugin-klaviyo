import { KLAVIYO_MODULE } from "../modules/klaviyo"
import type KlaviyoModuleService from "../modules/klaviyo/service"

export function resolveKlaviyo(
  container: { resolve: (name: string) => unknown }
): KlaviyoModuleService | null {
  try {
    const service = container.resolve(KLAVIYO_MODULE) as KlaviyoModuleService
    if (!service?.isConfigured?.()) return null
    return service
  } catch {
    return null
  }
}
