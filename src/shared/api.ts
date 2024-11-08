export type ApiProvider = "anthropic"

export interface ApiHandlerOptions {
	apiModelId?: string
	apiKey?: string
	anthropicBaseUrl?: string
}

export type ApiConfiguration = ApiHandlerOptions & {
	apiProvider?: ApiProvider
}

// Models

export interface ModelInfo {
	maxTokens?: number
	contextWindow?: number
	supportsImages?: boolean
	supportsComputerUse?: boolean
	supportsPromptCache: boolean
	inputPrice?: number
	outputPrice?: number
	cacheWritesPrice?: number
	cacheReadsPrice?: number
	description?: string
}

// Anthropic
// https://docs.anthropic.com/en/docs/about-claude/models
export type AnthropicModelId = keyof typeof anthropicModels
export const anthropicDefaultModelId: AnthropicModelId = "claude-3-5-sonnet-20241022"
export const anthropicModels = {
	"claude-3-5-sonnet-20241022": {
		maxTokens: 8192,
		contextWindow: 200_000,
		supportsImages: true,
		supportsComputerUse: true,
		supportsPromptCache: true,
		inputPrice: 0.864, // 0,864 ₽ per 1K input tokens
		outputPrice: 4.32, // 4,32 ₽ per 1K output tokens
		cacheWritesPrice: 1.08, // 1,08 ₽ per 1K tokens
		cacheReadsPrice: 0.0864, // 0,0864 ₽ per 1K tokens
	},
	"claude-3-5-haiku-20241022": {
		maxTokens: 8192,
		contextWindow: 200_000,
		supportsImages: false,
		supportsPromptCache: true,
		inputPrice: 0.288,
		outputPrice: 1.44,
		cacheWritesPrice: 0.36,
		cacheReadsPrice: 0.0288,
	},
	"claude-3-opus-20240229": {
		maxTokens: 4096,
		contextWindow: 200_000,
		supportsImages: true,
		supportsPromptCache: true,
		inputPrice: 4.32,
		outputPrice: 21.60,
		cacheWritesPrice: 5.40,
		cacheReadsPrice: 0.432,
	},
	"claude-3-haiku-20240307": {
		maxTokens: 4096,
		contextWindow: 200_000,
		supportsImages: true,
		supportsPromptCache: true,
		inputPrice: 0.072,
		outputPrice: 0.36,
		cacheWritesPrice: 0.09,
		cacheReadsPrice: 0.0072,
	},
} as const satisfies Record<string, ModelInfo>
