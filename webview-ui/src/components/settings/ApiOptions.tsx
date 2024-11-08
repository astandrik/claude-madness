import {
	VSCodeCheckbox,
	VSCodeDropdown,
	VSCodeLink,
	VSCodeOption,
	VSCodeTextField,
} from "@vscode/webview-ui-toolkit/react"
import { Fragment, memo, useState } from "react"
import { anthropicModels, type AnthropicModelId, type ApiConfiguration } from "../../../../src/shared/api"
import { useExtensionState } from "../../context/ExtensionStateContext"
import { formatPrice } from "../../utils/format"

interface ApiOptionsProps {
	showModelOptions: boolean
	apiErrorMessage?: string
	modelIdErrorMessage?: string
}

const ApiOptions = ({ showModelOptions, apiErrorMessage, modelIdErrorMessage }: ApiOptionsProps) => {
	const { apiConfiguration, setApiConfiguration } = useExtensionState()
	const [anthropicBaseUrlSelected, setAnthropicBaseUrlSelected] = useState(!!apiConfiguration?.anthropicBaseUrl)

	const handleInputChange = (field: keyof ApiConfiguration) => (event: any) => {
		if (apiConfiguration) {
			setApiConfiguration({ ...apiConfiguration, [field]: event.target.value })
		} else {
			setApiConfiguration({ apiProvider: "anthropic", [field]: event.target.value })
		}
	}

	const selectedModelId = apiConfiguration?.apiModelId as AnthropicModelId | undefined
	const selectedModelInfo = selectedModelId ? anthropicModels[selectedModelId] : undefined

	return (
		<div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
			<div>
				<VSCodeTextField
					value={apiConfiguration?.apiKey || ""}
					style={{ width: "100%" }}
					type="password"
					onInput={handleInputChange("apiKey")}
					placeholder="Enter API Key...">
					<span style={{ fontWeight: 500 }}>Anthropic API Key</span>
				</VSCodeTextField>

				<VSCodeCheckbox
					checked={anthropicBaseUrlSelected}
					onChange={(e: any) => {
						const isChecked = e.target.checked === true
						setAnthropicBaseUrlSelected(isChecked)
						if (!isChecked && apiConfiguration) {
							setApiConfiguration({ ...apiConfiguration, anthropicBaseUrl: "" })
						}
					}}>
					Use custom base URL
				</VSCodeCheckbox>

				{anthropicBaseUrlSelected && (
					<VSCodeTextField
						value={apiConfiguration?.anthropicBaseUrl || ""}
						style={{ width: "100%", marginTop: 3 }}
						type="url"
						onInput={handleInputChange("anthropicBaseUrl")}
						placeholder="Default: https://api.anthropic.com"
					/>
				)}

				<p
					style={{
						fontSize: "12px",
						marginTop: 3,
						color: "var(--vscode-descriptionForeground)",
					}}>
					This key is stored locally and only used to make API requests from this extension.
					{!apiConfiguration?.apiKey && (
						<VSCodeLink
							href="https://console.anthropic.com/settings/keys"
							style={{ display: "inline", fontSize: "inherit" }}>
							You can get an Anthropic API key by signing up here.
						</VSCodeLink>
					)}
				</p>
			</div>

			{showModelOptions && (
				<>
					<div className="dropdown-container">
						<label htmlFor="model-id">
							<span style={{ fontWeight: 500 }}>Model</span>
						</label>
						<VSCodeDropdown
							id="model-id"
							value={selectedModelId}
							onChange={handleInputChange("apiModelId")}
							style={{ width: "100%" }}>
							<VSCodeOption value="">Select a model...</VSCodeOption>
							{(Object.keys(anthropicModels) as AnthropicModelId[]).map((modelId) => (
								<VSCodeOption
									key={modelId}
									value={modelId}
									style={{
										whiteSpace: "normal",
										wordWrap: "break-word",
										maxWidth: "100%",
									}}>
									{modelId}
								</VSCodeOption>
							))}
						</VSCodeDropdown>
					</div>

					{selectedModelInfo && <ModelInfoView modelInfo={selectedModelInfo} />}
				</>
			)}

			{apiErrorMessage && (
				<p
					style={{
						margin: "-10px 0 4px 0",
						fontSize: 12,
						color: "var(--vscode-errorForeground)",
					}}>
					{apiErrorMessage}
				</p>
			)}

			{modelIdErrorMessage && (
				<p
					style={{
						margin: "-10px 0 4px 0",
						fontSize: 12,
						color: "var(--vscode-errorForeground)",
					}}>
					{modelIdErrorMessage}
				</p>
			)}
		</div>
	)
}

const ModelInfoView = ({
	modelInfo,
}: {
	modelInfo: typeof anthropicModels[keyof typeof anthropicModels]
}) => {
	const formatTokenPrice = (price: number) => {
		return `${price.toFixed(3).replace('.', ',')} ₽ за 1K токенов`
	}

	const infoItems = [
		<ModelInfoSupportsItem
			key="supportsImages"
			isSupported={modelInfo.supportsImages ?? false}
			supportsLabel="Supports images"
			doesNotSupportLabel="Does not support images"
		/>,
		'supportsComputerUse' in modelInfo && (
			<ModelInfoSupportsItem
				key="supportsComputerUse"
				isSupported={modelInfo.supportsComputerUse ?? false}
				supportsLabel="Supports computer use"
				doesNotSupportLabel="Does not support computer use"
			/>
		),
		<ModelInfoSupportsItem
			key="supportsPromptCache"
			isSupported={modelInfo.supportsPromptCache}
			supportsLabel="Supports prompt caching"
			doesNotSupportLabel="Does not support prompt caching"
		/>,
		modelInfo.maxTokens !== undefined && modelInfo.maxTokens > 0 && (
			<span key="maxTokens">
				<span style={{ fontWeight: 500 }}>Max output:</span> {modelInfo.maxTokens?.toLocaleString()} tokens
			</span>
		),
		modelInfo.inputPrice !== undefined && modelInfo.inputPrice > 0 && (
			<span key="inputPrice">
				<span style={{ fontWeight: 500 }}>Input price:</span> {formatTokenPrice(modelInfo.inputPrice)}
			</span>
		),
		modelInfo.outputPrice !== undefined && modelInfo.outputPrice > 0 && (
			<span key="outputPrice">
				<span style={{ fontWeight: 500 }}>Output price:</span> {formatTokenPrice(modelInfo.outputPrice)}
			</span>
		),
		modelInfo.supportsPromptCache && modelInfo.cacheWritesPrice && (
			<span key="cacheWritesPrice">
				<span style={{ fontWeight: 500 }}>Cache writes price:</span>{" "}
				{formatTokenPrice(modelInfo.cacheWritesPrice)}
			</span>
		),
		modelInfo.supportsPromptCache && modelInfo.cacheReadsPrice && (
			<span key="cacheReadsPrice">
				<span style={{ fontWeight: 500 }}>Cache reads price:</span>{" "}
				{formatTokenPrice(modelInfo.cacheReadsPrice)}
			</span>
		),
	].filter(Boolean)

	return (
		<p style={{ fontSize: "12px", marginTop: "2px", color: "var(--vscode-descriptionForeground)" }}>
			{infoItems.map((item, index) => (
				<Fragment key={index}>
					{item}
					{index < infoItems.length - 1 && <br />}
				</Fragment>
			))}
		</p>
	)
}

const ModelInfoSupportsItem = ({
	isSupported,
	supportsLabel,
	doesNotSupportLabel,
}: {
	isSupported: boolean
	supportsLabel: string
	doesNotSupportLabel: string
}) => (
	<span
		style={{
			fontWeight: 500,
			color: isSupported ? "var(--vscode-charts-green)" : "var(--vscode-errorForeground)",
		}}>
		<i
			className={`codicon codicon-${isSupported ? "check" : "x"}`}
			style={{
				marginRight: 4,
				marginBottom: isSupported ? 1 : -1,
				fontSize: isSupported ? 11 : 13,
				fontWeight: 700,
				display: "inline-block",
				verticalAlign: "bottom",
			}}></i>
		{isSupported ? supportsLabel : doesNotSupportLabel}
	</span>
)

export default memo(ApiOptions)
