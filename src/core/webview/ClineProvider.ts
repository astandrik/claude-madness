import { Anthropic } from "@anthropic-ai/sdk"
import fs from "fs/promises"
import pWaitFor from "p-wait-for"
import * as path from "path"
import * as vscode from "vscode"
import { buildApiHandler } from "../../api"
import { downloadTask } from "../../integrations/misc/export-markdown"
import { openFile, openImage } from "../../integrations/misc/open-file"
import { selectImages } from "../../integrations/misc/process-images"
import { getTheme } from "../../integrations/theme/getTheme"
import WorkspaceTracker from "../../integrations/workspace/WorkspaceTracker"
import { ModelInfo } from "../../shared/api"
import { findLast } from "../../shared/array"
import { ExtensionMessage } from "../../shared/ExtensionMessage"
import { HistoryItem } from "../../shared/HistoryItem"
import { WebviewMessage } from "../../shared/WebviewMessage"
import { fileExistsAtPath } from "../../utils/fs"
import { Cline } from "../Cline"
import { openMention } from "../mentions"
import { getNonce } from "./getNonce"
import { getUri } from "./getUri"

type SecretKey = "apiKey"
type GlobalStateKey =
	| "apiModelId"
	| "lastShownAnnouncementId"
	| "customInstructions"
	| "alwaysAllowReadOnly"
	| "taskHistory"
	| "anthropicBaseUrl"

export const GlobalFileNames = {
	apiConversationHistory: "api_conversation_history.json",
	uiMessages: "ui_messages.json",
}

export class ClineProvider implements vscode.WebviewViewProvider {
	public static readonly sideBarId = "claude-dev.SidebarProvider"
	public static readonly tabPanelId = "claude-dev.TabPanelProvider"
	private static activeInstances: Set<ClineProvider> = new Set()
	private disposables: vscode.Disposable[] = []
	private view?: vscode.WebviewView | vscode.WebviewPanel
	private cline?: Cline
	private workspaceTracker?: WorkspaceTracker
	private latestAnnouncementId = "oct-28-2024"

	constructor(readonly context: vscode.ExtensionContext, private readonly outputChannel: vscode.OutputChannel) {
		this.outputChannel.appendLine("ClineProvider instantiated")
		ClineProvider.activeInstances.add(this)
		this.workspaceTracker = new WorkspaceTracker(this)
	}

	async dispose() {
		this.outputChannel.appendLine("Disposing ClineProvider...")
		await this.clearTask()
		this.outputChannel.appendLine("Cleared task")
		if (this.view && "dispose" in this.view) {
			this.view.dispose()
			this.outputChannel.appendLine("Disposed webview")
		}
		while (this.disposables.length) {
			const x = this.disposables.pop()
			if (x) {
				x.dispose()
			}
		}
		this.workspaceTracker?.dispose()
		this.workspaceTracker = undefined
		this.outputChannel.appendLine("Disposed all disposables")
		ClineProvider.activeInstances.delete(this)
	}

	public static getVisibleInstance(): ClineProvider | undefined {
		return findLast(Array.from(this.activeInstances), (instance) => instance.view?.visible === true)
	}

	resolveWebviewView(webviewView: vscode.WebviewView | vscode.WebviewPanel): void | Thenable<void> {
		this.outputChannel.appendLine("Resolving webview view")
		this.view = webviewView

		webviewView.webview.options = {
			enableScripts: true,
			localResourceRoots: [this.context.extensionUri],
		}
		webviewView.webview.html = this.getHtmlContent(webviewView.webview)

		this.setWebviewMessageListener(webviewView.webview)

		if ("onDidChangeViewState" in webviewView) {
			webviewView.onDidChangeViewState(
				() => {
					if (this.view?.visible) {
						this.postMessageToWebview({ type: "action", action: "didBecomeVisible" })
					}
				},
				null,
				this.disposables
			)
		} else if ("onDidChangeVisibility" in webviewView) {
			webviewView.onDidChangeVisibility(
				() => {
					if (this.view?.visible) {
						this.postMessageToWebview({ type: "action", action: "didBecomeVisible" })
					}
				},
				null,
				this.disposables
			)
		}

		webviewView.onDidDispose(
			async () => {
				await this.dispose()
			},
			null,
			this.disposables
		)

		vscode.workspace.onDidChangeConfiguration(
			async (e) => {
				if (e && e.affectsConfiguration("workbench.colorTheme")) {
					await this.postMessageToWebview({ type: "theme", text: JSON.stringify(await getTheme()) })
				}
			},
			null,
			this.disposables
		)

		this.clearTask()

		this.outputChannel.appendLine("Webview view resolved")
	}

	async initClineWithTask(task?: string, images?: string[]) {
		await this.clearTask()
		const { apiConfiguration, customInstructions, alwaysAllowReadOnly } = await this.getState()
		this.cline = new Cline(this, apiConfiguration, customInstructions, alwaysAllowReadOnly, task, images)
	}

	async initClineWithHistoryItem(historyItem: HistoryItem) {
		await this.clearTask()
		const { apiConfiguration, customInstructions, alwaysAllowReadOnly } = await this.getState()
		this.cline = new Cline(
			this,
			apiConfiguration,
			customInstructions,
			alwaysAllowReadOnly,
			undefined,
			undefined,
			historyItem
		)
	}

	async postMessageToWebview(message: ExtensionMessage) {
		await this.view?.webview.postMessage(message)
	}

	private getHtmlContent(webview: vscode.Webview): string {
		const stylesUri = getUri(webview, this.context.extensionUri, [
			"webview-ui",
			"build",
			"static",
			"css",
			"main.css",
		])
		const scriptUri = getUri(webview, this.context.extensionUri, ["webview-ui", "build", "static", "js", "main.js"])
		const codiconsUri = getUri(webview, this.context.extensionUri, [
			"node_modules",
			"@vscode",
			"codicons",
			"dist",
			"codicon.css",
		])

		const nonce = getNonce()

		return /*html*/ `
        <!DOCTYPE html>
        <html lang="en">
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width,initial-scale=1,shrink-to-fit=no">
            <meta name="theme-color" content="#000000">
            <meta http-equiv="Content-Security-Policy" content="default-src 'none'; font-src ${webview.cspSource}; style-src ${webview.cspSource} 'unsafe-inline'; img-src ${webview.cspSource} data:; script-src 'nonce-${nonce}';">
            <link rel="stylesheet" type="text/css" href="${stylesUri}">
			<link href="${codiconsUri}" rel="stylesheet" />
            <title>Cline</title>
          </head>
          <body>
            <noscript>You need to enable JavaScript to run this app.</noscript>
            <div id="root"></div>
            <script nonce="${nonce}" src="${scriptUri}"></script>
          </body>
        </html>
      `
	}

	private setWebviewMessageListener(webview: vscode.Webview) {
		webview.onDidReceiveMessage(
			async (message: WebviewMessage) => {
				switch (message.type) {
					case "webviewDidLaunch":
						this.postStateToWebview()
						this.workspaceTracker?.initializeFilePaths()
						getTheme().then((theme) =>
							this.postMessageToWebview({ type: "theme", text: JSON.stringify(theme) })
						)
						break
					case "newTask":
						await this.initClineWithTask(message.text, message.images)
						break
					case "apiConfiguration":
						if (message.apiConfiguration) {
							const { apiModelId, apiKey, anthropicBaseUrl } = message.apiConfiguration
							await this.updateGlobalState("apiModelId", apiModelId)
							await this.storeSecret("apiKey", apiKey)
							await this.updateGlobalState("anthropicBaseUrl", anthropicBaseUrl)
							if (this.cline) {
								this.cline.api = buildApiHandler(message.apiConfiguration)
							}
						}
						await this.postStateToWebview()
						break
					case "customInstructions":
						await this.updateCustomInstructions(message.text)
						break
					case "alwaysAllowReadOnly":
						await this.updateGlobalState("alwaysAllowReadOnly", message.bool ?? undefined)
						if (this.cline) {
							this.cline.alwaysAllowReadOnly = message.bool ?? false
						}
						await this.postStateToWebview()
						break
					case "askResponse":
						this.cline?.handleWebviewAskResponse(message.askResponse!, message.text, message.images)
						break
					case "clearTask":
						await this.clearTask()
						await this.postStateToWebview()
						break
					case "didShowAnnouncement":
						await this.updateGlobalState("lastShownAnnouncementId", this.latestAnnouncementId)
						await this.postStateToWebview()
						break
					case "selectImages":
						const images = await selectImages()
						await this.postMessageToWebview({ type: "selectedImages", images })
						break
					case "exportCurrentTask":
						const currentTaskId = this.cline?.taskId
						if (currentTaskId) {
							this.exportTaskWithId(currentTaskId)
						}
						break
					case "showTaskWithId":
						this.showTaskWithId(message.text!)
						break
					case "deleteTaskWithId":
						this.deleteTaskWithId(message.text!)
						break
					case "exportTaskWithId":
						this.exportTaskWithId(message.text!)
						break
					case "resetState":
						await this.resetState()
						break
					case "openImage":
						openImage(message.text!)
						break
					case "openFile":
						openFile(message.text!)
						break
					case "openMention":
						openMention(message.text)
						break
					case "cancelTask":
						if (this.cline) {
							const { historyItem } = await this.getTaskWithId(this.cline.taskId)
							this.cline.abortTask()
							await pWaitFor(() => this.cline === undefined || this.cline.didFinishAborting, {
								timeout: 3_000,
							}).catch(() => {
								console.error("Failed to abort task")
							})
							if (this.cline) {
								this.cline.abandoned = true
							}
							await this.initClineWithHistoryItem(historyItem)
						}
						break
				}
			},
			null,
			this.disposables
		)
	}

	async updateCustomInstructions(instructions?: string) {
		await this.updateGlobalState("customInstructions", instructions || undefined)
		if (this.cline) {
			this.cline.customInstructions = instructions || undefined
		}
		await this.postStateToWebview()
	}

	async getTaskWithId(id: string): Promise<{
		historyItem: HistoryItem
		taskDirPath: string
		apiConversationHistoryFilePath: string
		uiMessagesFilePath: string
		apiConversationHistory: Anthropic.MessageParam[]
	}> {
		const history = ((await this.getGlobalState("taskHistory")) as HistoryItem[] | undefined) || []
		const historyItem = history.find((item) => item.id === id)
		if (historyItem) {
			const taskDirPath = path.join(this.context.globalStorageUri.fsPath, "tasks", id)
			const apiConversationHistoryFilePath = path.join(taskDirPath, GlobalFileNames.apiConversationHistory)
			const uiMessagesFilePath = path.join(taskDirPath, GlobalFileNames.uiMessages)
			const fileExists = await fileExistsAtPath(apiConversationHistoryFilePath)
			if (fileExists) {
				const apiConversationHistory = JSON.parse(await fs.readFile(apiConversationHistoryFilePath, "utf8"))
				return {
					historyItem,
					taskDirPath,
					apiConversationHistoryFilePath,
					uiMessagesFilePath,
					apiConversationHistory,
				}
			}
		}
		await this.deleteTaskFromState(id)
		throw new Error("Task not found")
	}

	async showTaskWithId(id: string) {
		if (id !== this.cline?.taskId) {
			const { historyItem } = await this.getTaskWithId(id)
			await this.initClineWithHistoryItem(historyItem)
		}
		await this.postMessageToWebview({ type: "action", action: "chatButtonClicked" })
	}

	async exportTaskWithId(id: string) {
		const { historyItem, apiConversationHistory } = await this.getTaskWithId(id)
		await downloadTask(historyItem.ts, apiConversationHistory)
	}

	async deleteTaskWithId(id: string) {
		if (id === this.cline?.taskId) {
			await this.clearTask()
		}

		const { taskDirPath, apiConversationHistoryFilePath, uiMessagesFilePath } = await this.getTaskWithId(id)

		await this.deleteTaskFromState(id)

		const apiConversationHistoryFileExists = await fileExistsAtPath(apiConversationHistoryFilePath)
		if (apiConversationHistoryFileExists) {
			await fs.unlink(apiConversationHistoryFilePath)
		}
		const uiMessagesFileExists = await fileExistsAtPath(uiMessagesFilePath)
		if (uiMessagesFileExists) {
			await fs.unlink(uiMessagesFilePath)
		}
		const legacyMessagesFilePath = path.join(taskDirPath, "claude_messages.json")
		if (await fileExistsAtPath(legacyMessagesFilePath)) {
			await fs.unlink(legacyMessagesFilePath)
		}
		await fs.rmdir(taskDirPath)
	}

	async deleteTaskFromState(id: string) {
		const taskHistory = ((await this.getGlobalState("taskHistory")) as HistoryItem[] | undefined) || []
		const updatedTaskHistory = taskHistory.filter((task) => task.id !== id)
		await this.updateGlobalState("taskHistory", updatedTaskHistory)
		await this.postStateToWebview()
	}

	async postStateToWebview() {
		const state = await this.getStateToPostToWebview()
		this.postMessageToWebview({ type: "state", state })
	}

	async getStateToPostToWebview() {
		const { apiConfiguration, lastShownAnnouncementId, customInstructions, alwaysAllowReadOnly, taskHistory } =
			await this.getState()
		return {
			version: this.context.extension?.packageJSON?.version ?? "",
			apiConfiguration,
			customInstructions,
			alwaysAllowReadOnly,
			uriScheme: vscode.env.uriScheme,
			clineMessages: this.cline?.clineMessages || [],
			taskHistory: (taskHistory || []).filter((item) => item.ts && item.task).sort((a, b) => b.ts - a.ts),
			shouldShowAnnouncement: lastShownAnnouncementId !== this.latestAnnouncementId,
		}
	}

	async clearTask() {
		this.cline?.abortTask()
		this.cline = undefined
	}

	async getState() {
		const [
			apiModelId,
			apiKey,
			anthropicBaseUrl,
			lastShownAnnouncementId,
			customInstructions,
			alwaysAllowReadOnly,
			taskHistory,
		] = await Promise.all([
			this.getGlobalState("apiModelId") as Promise<string | undefined>,
			this.getSecret("apiKey") as Promise<string | undefined>,
			this.getGlobalState("anthropicBaseUrl") as Promise<string | undefined>,
			this.getGlobalState("lastShownAnnouncementId") as Promise<string | undefined>,
			this.getGlobalState("customInstructions") as Promise<string | undefined>,
			this.getGlobalState("alwaysAllowReadOnly") as Promise<boolean | undefined>,
			this.getGlobalState("taskHistory") as Promise<HistoryItem[] | undefined>,
		])

		return {
			apiConfiguration: {
				apiProvider: "anthropic" as const,
				apiModelId,
				apiKey,
				anthropicBaseUrl,
			},
			lastShownAnnouncementId,
			customInstructions,
			alwaysAllowReadOnly: alwaysAllowReadOnly ?? false,
			taskHistory,
		}
	}

	async updateTaskHistory(item: HistoryItem): Promise<HistoryItem[]> {
		const history = ((await this.getGlobalState("taskHistory")) as HistoryItem[]) || []
		const existingItemIndex = history.findIndex((h) => h.id === item.id)
		if (existingItemIndex !== -1) {
			history[existingItemIndex] = item
		} else {
			history.push(item)
		}
		await this.updateGlobalState("taskHistory", history)
		return history
	}

	async updateGlobalState(key: GlobalStateKey, value: any) {
		await this.context.globalState.update(key, value)
	}

	async getGlobalState(key: GlobalStateKey) {
		return await this.context.globalState.get(key)
	}

	private async storeSecret(key: SecretKey, value?: string) {
		if (value) {
			await this.context.secrets.store(key, value)
		} else {
			await this.context.secrets.delete(key)
		}
	}

	private async getSecret(key: SecretKey) {
		return await this.context.secrets.get(key)
	}

	async resetState() {
		vscode.window.showInformationMessage("Resetting state...")
		for (const key of this.context.globalState.keys()) {
			await this.context.globalState.update(key, undefined)
		}
		await this.storeSecret("apiKey", undefined)
		if (this.cline) {
			this.cline.abortTask()
			this.cline = undefined
		}
		vscode.window.showInformationMessage("State reset")
		await this.postStateToWebview()
		await this.postMessageToWebview({ type: "action", action: "chatButtonClicked" })
	}
}
