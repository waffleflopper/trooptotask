import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ExtensionAPI, ExtensionContext } from '@mariozechner/pi-coding-agent';

type ThinkingLevel = 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';

interface PresetDefinition {
	description?: string;
	provider?: string;
	model?: string;
	thinkingLevel?: ThinkingLevel;
	tools?: string[];
	instructions?: string;
}

type PresetMap = Record<string, PresetDefinition>;

const DEFAULT_TOOL_ORDER = ['read', 'bash', 'edit', 'write', 'grep', 'find', 'ls', 'verify_project'];

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function isThinkingLevel(value: unknown): value is ThinkingLevel {
	return (
		value === 'off' ||
		value === 'minimal' ||
		value === 'low' ||
		value === 'medium' ||
		value === 'high' ||
		value === 'xhigh'
	);
}

function parsePresetMap(value: unknown): PresetMap {
	if (!isRecord(value)) {
		return {};
	}

	const presets: PresetMap = {};
	for (const [name, rawPreset] of Object.entries(value)) {
		if (!isRecord(rawPreset)) {
			continue;
		}

		const preset: PresetDefinition = {};
		if (typeof rawPreset.description === 'string') {
			preset.description = rawPreset.description;
		}
		if (typeof rawPreset.provider === 'string') {
			preset.provider = rawPreset.provider;
		}
		if (typeof rawPreset.model === 'string') {
			preset.model = rawPreset.model;
		}
		if (isThinkingLevel(rawPreset.thinkingLevel)) {
			preset.thinkingLevel = rawPreset.thinkingLevel;
		}
		if (Array.isArray(rawPreset.tools) && rawPreset.tools.every((tool): tool is string => typeof tool === 'string')) {
			preset.tools = rawPreset.tools;
		}
		if (typeof rawPreset.instructions === 'string') {
			preset.instructions = rawPreset.instructions;
		}

		presets[name] = preset;
	}

	return presets;
}

function loadPresets(cwd: string): PresetMap {
	const presetsPath = join(cwd, '.pi', 'presets.json');
	if (!existsSync(presetsPath)) {
		return {};
	}

	try {
		const content = readFileSync(presetsPath, 'utf8');
		return parsePresetMap(JSON.parse(content));
	} catch {
		return {};
	}
}

function readLatestPresetName(ctx: ExtensionContext): string | undefined {
	const latestEntry = ctx.sessionManager
		.getEntries()
		.filter((entry) => entry.type === 'custom' && entry.customType === 'preset-state')
		.at(-1);

	if (!latestEntry || !isRecord(latestEntry.data) || typeof latestEntry.data.name !== 'string') {
		return undefined;
	}

	return latestEntry.data.name || undefined;
}

function resolvePreferredTools(pi: ExtensionAPI): string[] {
	const available = new Set(pi.getAllTools().map((tool) => tool.name));
	const preferred = DEFAULT_TOOL_ORDER.filter((tool) => available.has(tool));
	return preferred.length > 0 ? preferred : pi.getAllTools().map((tool) => tool.name);
}

export default function presetModes(pi: ExtensionAPI) {
	let presets: PresetMap = {};
	let activePresetName: string | undefined;
	let activePreset: PresetDefinition | undefined;

	pi.registerFlag('preset', {
		description: 'Preset mode to activate on startup',
		type: 'string'
	});

	function clearPresetUi(ctx: ExtensionContext) {
		if (!ctx.hasUI) {
			return;
		}

		ctx.ui.setStatus('preset', undefined);
		ctx.ui.setWidget('preset-mode', undefined);
	}

	function updatePresetUi(ctx: ExtensionContext) {
		if (!ctx.hasUI) {
			return;
		}

		if (!activePresetName) {
			clearPresetUi(ctx);
			return;
		}

		const theme = ctx.ui.theme;
		const presetName = activePresetName.toUpperCase();
		const color = activePresetName === 'plan' ? 'warning' : activePresetName === 'ship' ? 'success' : 'accent';
		const availableTools = activePreset?.tools?.join(', ') ?? 'default tools';
		const status =
			theme.fg(color, `◆ ${activePresetName}`) +
			theme.fg('dim', activePreset?.thinkingLevel ? ` · ${activePreset.thinkingLevel}` : '');
		ctx.ui.setStatus('preset', status);
		ctx.ui.setWidget('preset-mode', [
			theme.fg('muted', 'MODE // ') +
				theme.fg(color, presetName) +
				(activePreset?.description ? theme.fg('dim', ` — ${activePreset.description}`) : ''),
			theme.fg('dim', `tools: ${availableTools} · /preset clear to reset`)
		]);
	}

	async function clearPreset(ctx: ExtensionContext, persist: boolean) {
		activePresetName = undefined;
		activePreset = undefined;
		pi.setActiveTools(resolvePreferredTools(pi));
		clearPresetUi(ctx);

		if (persist) {
			pi.appendEntry('preset-state', { name: '' });
		}
	}

	async function applyPreset(name: string, ctx: ExtensionContext, persist: boolean): Promise<boolean> {
		const preset = presets[name];
		if (!preset) {
			ctx.ui.notify(`Unknown preset: ${name}`, 'warning');
			return false;
		}

		if (preset.provider && preset.model) {
			const model = ctx.modelRegistry.find(preset.provider, preset.model);
			if (model) {
				const didSetModel = await pi.setModel(model);
				if (!didSetModel) {
					ctx.ui.notify(`No API key available for ${preset.provider}/${preset.model}`, 'warning');
				}
			} else {
				ctx.ui.notify(`Could not find model ${preset.provider}/${preset.model}`, 'warning');
			}
		}

		if (preset.thinkingLevel) {
			pi.setThinkingLevel(preset.thinkingLevel);
		}

		if (preset.tools?.length) {
			const availableToolNames = new Set(pi.getAllTools().map((tool) => tool.name));
			const validTools = preset.tools.filter((tool) => availableToolNames.has(tool));
			const invalidTools = preset.tools.filter((tool) => !availableToolNames.has(tool));
			if (invalidTools.length > 0) {
				ctx.ui.notify(`Preset ignored unknown tools: ${invalidTools.join(', ')}`, 'warning');
			}
			if (validTools.length > 0) {
				pi.setActiveTools(validTools);
			}
		}

		activePresetName = name;
		activePreset = preset;
		updatePresetUi(ctx);

		if (persist) {
			pi.appendEntry('preset-state', { name });
		}

		return true;
	}

	async function applyNamedPreset(name: string, ctx: ExtensionContext, persist: boolean) {
		const didApply = await applyPreset(name, ctx, persist);
		if (didApply) {
			ctx.ui.notify(`Preset activated: ${name}`, 'info');
		}
	}

	async function handlePresetCommand(args: string | undefined, ctx: ExtensionContext) {
		const trimmedArgs = args?.trim();
		if (!trimmedArgs) {
			const names = Object.keys(presets);
			if (names.length === 0) {
				ctx.ui.notify('No project presets found in .pi/presets.json', 'warning');
				return;
			}

			if (!ctx.hasUI) {
				ctx.ui.notify(`Available presets: ${names.join(', ')}`, 'info');
				return;
			}

			const selected = await ctx.ui.select(
				'Select preset',
				names.map((name) => `${name}${presets[name]?.description ? ` — ${presets[name]?.description}` : ''}`)
			);
			if (!selected) {
				return;
			}

			const [selectedName] = selected.split(' — ');
			await applyNamedPreset(selectedName, ctx, true);
			return;
		}

		if (trimmedArgs === 'clear') {
			await clearPreset(ctx, true);
			ctx.ui.notify('Preset cleared', 'info');
			return;
		}

		await applyNamedPreset(trimmedArgs, ctx, true);
	}

	pi.registerCommand('preset', {
		description: 'Activate a project preset from .pi/presets.json',
		handler: async (args, ctx) => {
			await handlePresetCommand(args, ctx);
		}
	});

	for (const commandName of ['plan', 'build', 'ship'] as const) {
		pi.registerCommand(commandName, {
			description: `Activate the ${commandName} preset`,
			handler: async (_args, ctx) => {
				await applyNamedPreset(commandName, ctx, true);
			}
		});
	}

	pi.on('before_agent_start', async (event) => {
		if (!activePreset?.instructions) {
			return undefined;
		}

		return {
			systemPrompt: `${event.systemPrompt}\n\n${activePreset.instructions}`
		};
	});

	pi.on('session_start', async (_event, ctx) => {
		presets = loadPresets(ctx.cwd);

		const presetFlag = pi.getFlag('preset');
		if (typeof presetFlag === 'string' && presetFlag.trim()) {
			await applyPreset(presetFlag.trim(), ctx, false);
			updatePresetUi(ctx);
			return;
		}

		const restoredPresetName = readLatestPresetName(ctx);
		if (restoredPresetName) {
			await applyPreset(restoredPresetName, ctx, false);
			updatePresetUi(ctx);
			return;
		}

		clearPresetUi(ctx);
	});
}
