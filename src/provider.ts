import * as vscode from 'vscode';
import { AuthManager } from './auth';
import {
	getConfiguredBaseUrl,
	getMaxTokens,
	getToolLimit,
	updateConfiguredBaseUrl,
} from './config';
import { normalizeBaseUrl } from './configCore';
import { CONFIG_SECTION, PROVIDER_VENDOR, USAGE_DATA_PART_MIME } from './constants';
import { ApertureClient } from './client';
import { logger } from './logger';
import { ModelService } from './modelService';
import { convertMessages, convertTools } from './openaiConvert';
import type { ApertureModel, ChatCompletionRequest, ThinkingEffort, ToolCall, Usage } from './types';
import { createUserAgent } from './userAgent';

type ModelConfigurationOptions = vscode.ProvideLanguageModelChatResponseOptions & {
	readonly modelConfiguration?: Record<string, unknown>;
	readonly configuration?: Record<string, unknown>;
};

export class ApertureChatProvider implements vscode.LanguageModelChatProvider {
	private readonly auth: AuthManager;
	private readonly models: ModelService;
	private readonly userAgent: string;
	private readonly onDidChangeLanguageModelChatInformationEmitter = new vscode.EventEmitter<void>();
	private active = true;

	readonly onDidChangeLanguageModelChatInformation =
		this.onDidChangeLanguageModelChatInformationEmitter.event;

	constructor(private readonly context: vscode.ExtensionContext) {
		this.auth = new AuthManager(context);
		this.userAgent = createUserAgent(context);
		this.models = new ModelService(this.userAgent);

		context.subscriptions.push(
			this.onDidChangeLanguageModelChatInformationEmitter,
			vscode.workspace.onDidChangeConfiguration((event) => {
				if (event.affectsConfiguration(CONFIG_SECTION)) {
					this.refreshModels();
				}
			}),
			context.secrets.onDidChange(() => this.refreshModels()),
		);
	}

	register(): void {
		this.context.subscriptions.push(
			vscode.commands.registerCommand('aperture-copilot.setBaseUrl', () =>
				this.configureBaseUrl(),
			),
			vscode.commands.registerCommand('aperture-copilot.refreshModels', () => {
				this.refreshModels();
				vscode.window.showInformationMessage('Aperture models refreshed.');
			}),
			vscode.commands.registerCommand('aperture-copilot.setApiKey', () =>
				this.configureApiKey(),
			),
			vscode.commands.registerCommand('aperture-copilot.clearApiKey', () =>
				this.clearApiKey(),
			),
			vscode.commands.registerCommand('aperture-copilot.openSettings', () =>
				vscode.commands.executeCommand('workbench.action.openSettings', `@ext:local.aperture-for-copilot`),
			),
			vscode.commands.registerCommand('aperture-copilot.showLogs', () => logger.show()),
			vscode.lm.registerLanguageModelChatProvider(PROVIDER_VENDOR, this),
		);
	}

	refreshModels(): void {
		this.models.clear();
		this.onDidChangeLanguageModelChatInformationEmitter.fire();
	}

	async prepareForDeactivate(): Promise<void> {
		this.active = false;
		this.refreshModels();
		try {
			await vscode.lm.selectChatModels({ vendor: PROVIDER_VENDOR });
		} catch (error) {
			logger.debug('Unable to force Aperture model picker refresh during deactivate', error);
		}
	}

	async configureBaseUrl(): Promise<void> {
		const current = getConfiguredBaseUrl() ?? '';
		const value = await vscode.window.showInputBox({
			title: 'Aperture Base URL',
			prompt: 'Enter an OpenAI-compatible base URL. Bare origins are normalized to /v1.',
			value: current,
			ignoreFocusOut: true,
			validateInput: (input) => validateBaseUrlInput(input),
		});

		if (value === undefined) {
			return;
		}

		const normalized = normalizeBaseUrl(value);
		await updateConfiguredBaseUrl(normalized);
		vscode.window.showInformationMessage(
			normalized ? `Aperture base URL set to ${normalized}` : 'Aperture base URL cleared.',
		);
	}

	async configureApiKey(): Promise<void> {
		if (await this.auth.promptForApiKey()) {
			this.refreshModels();
			vscode.window.showInformationMessage('Aperture API key updated.');
		}
	}

	async clearApiKey(): Promise<void> {
		await this.auth.deleteApiKey();
		this.refreshModels();
		vscode.window.showInformationMessage('Aperture API key cleared.');
	}

	async provideLanguageModelChatInformation(
		_options: vscode.PrepareLanguageModelChatModelOptions,
		_token: vscode.CancellationToken,
	): Promise<vscode.LanguageModelChatInformation[]> {
		if (!this.active) {
			return [];
		}

		const apiKey = await this.auth.getApiKey();
		const models = await this.models.getModels(apiKey);
		return models.map((model) => toChatInformation(model));
	}

	async provideLanguageModelChatResponse(
		modelInfo: vscode.LanguageModelChatInformation,
		messages: readonly vscode.LanguageModelChatRequestMessage[],
		options: vscode.ProvideLanguageModelChatResponseOptions,
		progress: vscode.Progress<vscode.LanguageModelResponsePart>,
		token: vscode.CancellationToken,
	): Promise<void> {
		const baseUrl = getConfiguredBaseUrl();
		if (!baseUrl) {
			throw new Error('Aperture base URL is not configured. Run "Aperture: Set Base URL".');
		}

		const apiKey = await this.auth.getApiKey();
		const model = await this.models.resolveModel(modelInfo.id, apiKey);
		if (!model) {
			throw new Error(`Aperture model "${modelInfo.id}" is no longer available.`);
		}

		const request = buildRequest(model, messages, options);
		const client = new ApertureClient(baseUrl, apiKey, this.userAgent);

		await client.streamChatCompletion(
			request,
			{
				onContent: (content) => progress.report(new vscode.LanguageModelTextPart(content)),
				onReasoning: (content) => progress.report(createThinkingPart(content)),
				onToolCall: (toolCall) => progress.report(createToolCallPart(toolCall)),
				onUsage: (usage) => reportUsage(progress, usage),
				onDone: () => undefined,
				onError: (error) => {
					throw error;
				},
			},
			token,
		);
	}

	async provideTokenCount(
		_modelInfo: vscode.LanguageModelChatInformation,
		text: string | vscode.LanguageModelChatRequestMessage,
		_token: vscode.CancellationToken,
	): Promise<number> {
		if (typeof text === 'string') {
			return estimateTokenCount(text);
		}
		let chars = 0;
		for (const part of text.content) {
			if (part instanceof vscode.LanguageModelTextPart) {
				chars += part.value.length;
			}
		}
		return estimateTokenCount('x'.repeat(chars));
	}
}

function buildRequest(
	model: ApertureModel,
	messages: readonly vscode.LanguageModelChatRequestMessage[],
	options: vscode.ProvideLanguageModelChatResponseOptions,
): ChatCompletionRequest {
	const tools = model.toolCalling ? convertTools(options.tools) : undefined;
	const toolLimit = typeof model.toolCalling === 'number' ? model.toolCalling : getToolLimit();
	if ((tools?.length ?? 0) > toolLimit) {
		throw new Error(`Aperture model "${model.id}" supports at most ${toolLimit} tools.`);
	}

	const thinkingEffort = getConfiguredThinkingEffort(options as ModelConfigurationOptions);
	return {
		model: model.apiModelId,
		messages: convertMessages(messages, model.thinking),
		stream: true,
		tools,
		tool_choice: tools && tools.length > 0 ? 'auto' : undefined,
		max_tokens: getMaxTokens(),
		...(model.thinking
			? {
					thinking: {
						type: thinkingEffort === 'none' ? 'disabled' : 'enabled',
					},
					...(thinkingEffort === 'none' ? {} : { reasoning_effort: thinkingEffort }),
				}
			: {}),
	};
}

function toChatInformation(model: ApertureModel): vscode.LanguageModelChatInformation {
	const info = {
		id: model.id,
		name: model.name,
		family: model.family,
		version: model.version,
		detail: model.detail,
		tooltip: model.detail,
		maxInputTokens: model.maxInputTokens,
		maxOutputTokens: model.maxOutputTokens,
		isUserSelectable: true,
		capabilities: {
			toolCalling: model.toolCalling,
			imageInput: false,
		},
		...(model.thinking ? { configurationSchema: buildThinkingEffortSchema() } : {}),
	};
	return info as vscode.LanguageModelChatInformation;
}

function buildThinkingEffortSchema() {
	return {
		properties: {
			reasoningEffort: {
				type: 'string',
				title: 'Thinking',
				enum: ['none', 'high', 'max'],
				enumItemLabels: ['None', 'High', 'Max'],
				enumDescriptions: [
					'Do not send thinking parameters.',
					'Balanced reasoning for most coding tasks.',
					'Maximum reasoning for difficult agent tasks.',
				],
				default: 'high',
				group: 'navigation',
			},
		},
	} as const;
}

function getConfiguredThinkingEffort(options: ModelConfigurationOptions): ThinkingEffort {
	const value = options.modelConfiguration?.reasoningEffort ?? options.configuration?.reasoningEffort;
	if (value === 'none' || value === 'max') {
		return value;
	}
	return 'high';
}

function createThinkingPart(content: string): vscode.LanguageModelResponsePart {
	const ctor = (
		vscode as unknown as {
			LanguageModelThinkingPart?: new (value: string) => vscode.LanguageModelResponsePart;
		}
	).LanguageModelThinkingPart;

	return ctor
		? new ctor(content)
		: new vscode.LanguageModelTextPart(content);
}

function createToolCallPart(toolCall: ToolCall): vscode.LanguageModelToolCallPart {
	let input: Record<string, unknown> = {};
	try {
		const parsed = toolCall.function.arguments ? JSON.parse(toolCall.function.arguments) : {};
		input = isRecord(parsed) ? parsed : {};
	} catch {
		input = {};
	}
	return new vscode.LanguageModelToolCallPart(toolCall.id, toolCall.function.name, input);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function reportUsage(
	progress: vscode.Progress<vscode.LanguageModelResponsePart>,
	usage: Usage,
): void {
	const cachedTokens =
		usage.prompt_tokens_details?.cached_tokens ?? usage.prompt_cache_hit_tokens ?? 0;
	const data = {
		prompt_tokens: usage.prompt_tokens ?? 0,
		completion_tokens: usage.completion_tokens ?? 0,
		total_tokens: usage.total_tokens ?? 0,
		prompt_tokens_details: {
			cached_tokens: cachedTokens,
		},
	};

	try {
		progress.report(
			new vscode.LanguageModelDataPart(
				new TextEncoder().encode(JSON.stringify(data)),
				USAGE_DATA_PART_MIME,
			),
		);
	} catch (error) {
		logger.debug('Unable to report usage data to Copilot', error);
	}
}

function estimateTokenCount(text: string): number {
	return Math.max(1, Math.ceil(text.length / 4));
}

function validateBaseUrlInput(input: string): string | undefined {
	if (!input.trim()) {
		return undefined;
	}
	try {
		normalizeBaseUrl(input);
		return undefined;
	} catch (error) {
		return error instanceof Error ? error.message : 'Invalid URL';
	}
}
