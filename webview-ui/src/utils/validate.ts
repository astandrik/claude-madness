import { ApiConfiguration } from "../../../src/shared/api"

export function validateApiConfiguration(apiConfiguration?: ApiConfiguration): string | undefined {
    if (apiConfiguration) {
        if (!apiConfiguration.apiKey) {
            return "You must provide a valid API key."
        }
    }
    return undefined
}

export function validateModelId(
    apiConfiguration?: ApiConfiguration
): string | undefined {
    return undefined // No additional validation needed for Anthropic models as they're predefined
}
