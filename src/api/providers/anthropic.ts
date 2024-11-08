import {
	anthropicDefaultModelId,
	AnthropicModelId,
	anthropicModels,
	ApiHandlerOptions,
	ModelInfo,
} from "../../shared/api"
import { ApiHandler } from "../index"
import { ApiStream } from "../transform/stream"

export class AnthropicHandler implements ApiHandler {
	private options: ApiHandlerOptions

	constructor(options: ApiHandlerOptions) {
		this.options = options
	}

	async *createMessage(systemPrompt: string, messages: any[]): ApiStream {
		const modelId = this.getModel().id
		const apiKey = this.options.apiKey || ""
		const baseUrl = this.options.anthropicBaseUrl || "https://api.anthropic.com/v1/messages"

		const body = {
			model: modelId,
			max_tokens: this.getModel().info.maxTokens || 8192,
			temperature: 0,
			system: systemPrompt,
			messages,
			stream: true,
		}

		const headers = new Headers({
			"Content-Type": "application/json",
			"X-API-Key": apiKey,
			"anthropic-version": "2023-06-01",
		})

		// Add prompt caching headers for specific models
		const promptCachingModels = [
			"claude-3-5-sonnet-20241022",
			"claude-3-5-haiku-20241022",
			"claude-3-opus-20240229",
			"claude-3-haiku-20240307",
		]
		if (promptCachingModels.includes(modelId)) {
			headers.append("anthropic-beta", "prompt-caching-2024-07-31")
		}

		const response = await fetch(baseUrl, {
			method: "POST",
			headers,
			body: JSON.stringify(body),
		})

		if (!response.ok) {
			const errorText = await response.text()
			throw new Error(`Anthropic API Error: ${response.status} - ${errorText}`)
		}

		if (!response.body) {
			throw new Error("No response body")
		}

		const reader = response.body.getReader()
		const decoder = new TextDecoder()
		let buffer = ""

		while (true) {
			const { done, value } = await reader.read()
			if (done) break

			buffer += decoder.decode(value, { stream: true })
			const lines = buffer.split("\n")
			buffer = lines.pop() || ""

			for (const line of lines) {
				if (line.startsWith("data: ")) {
					try {
						const chunk = JSON.parse(line.slice(6))

						switch (chunk.type) {
							case "message_start":
								yield {
									type: "usage",
									inputTokens: chunk.message.usage.input_tokens || 0,
									outputTokens: chunk.message.usage.output_tokens || 0,
									cacheWriteTokens: chunk.message.usage.cache_creation_input_tokens,
									cacheReadTokens: chunk.message.usage.cache_read_input_tokens,
								}
								break
							case "message_delta":
								yield {
									type: "usage",
									inputTokens: 0,
									outputTokens: chunk.usage.output_tokens || 0,
								}
								break
							case "content_block_start":
								if (chunk.content_block.type === "text") {
									yield {
										type: "text",
										text: chunk.content_block.text,
									}
								}
								break
							case "content_block_delta":
								if (chunk.delta.type === "text_delta") {
									yield {
										type: "text",
										text: chunk.delta.text,
									}
								}
								break
						}
					} catch (error) {
						console.error("Error parsing chunk:", error)
					}
				}
			}
		}
	}

	getModel(): { id: AnthropicModelId; info: ModelInfo } {
		const modelId = this.options.apiModelId
		if (modelId && modelId in anthropicModels) {
			const id = modelId as AnthropicModelId
			return { id, info: anthropicModels[id] }
		}
		return { id: anthropicDefaultModelId, info: anthropicModels[anthropicDefaultModelId] }
	}
}
