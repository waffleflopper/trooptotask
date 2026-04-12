import { Type } from '@sinclair/typebox';
import { StringEnum } from '@mariozechner/pi-ai';
import type { ExtensionAPI, ExtensionContext } from '@mariozechner/pi-coding-agent';
import { truncateTail } from '@mariozechner/pi-coding-agent';
import type { AutocompleteItem } from '@mariozechner/pi-tui';
import { Text } from '@mariozechner/pi-tui';

type VerifyStepKey = 'format' | 'lint' | 'check' | 'test';

interface VerifyStepDefinition {
	key: VerifyStepKey;
	label: string;
	args: string[];
}

interface VerifyResult {
	key: VerifyStepKey;
	command: string;
	ok: boolean;
	exitCode: number;
	stdout: string;
	stderr: string;
	durationMs: number;
}

interface VerifyState {
	scope: string;
	ok: boolean;
	failFast: boolean;
	completedAt: string;
	results: VerifyResult[];
}

interface ParsedVerifyArgs {
	steps: VerifyStepDefinition[];
	failFast: boolean;
	showHelp: boolean;
	unknownTokens: string[];
}

const VERIFY_STEPS: VerifyStepDefinition[] = [
	{ key: 'format', label: 'Format', args: ['run', 'format'] },
	{ key: 'lint', label: 'Lint', args: ['run', 'lint'] },
	{ key: 'check', label: 'Check', args: ['run', 'check'] },
	{ key: 'test', label: 'Test', args: ['run', 'test'] }
];

const VERIFY_STEP_LOOKUP = new Map<VerifyStepKey, VerifyStepDefinition>(VERIFY_STEPS.map((step) => [step.key, step]));

const VERIFY_HELP_TEXT = [
	'Verify workflow usage',
	'',
	'/verify',
	'  Run the full required workflow: format, lint, check, test.',
	'',
	'/verify format',
	'/verify lint check',
	'/verify all --fail-fast',
	'  Run only the named steps, optionally stopping on first failure.',
	'',
	'Available step names:',
	'- format',
	'- lint',
	'- check',
	'- test',
	'- all',
	'',
	'Flags:',
	'- --fail-fast',
	'- help',
	'',
	'The verify_project tool supports:',
	'- scope: all | format | lint | check | test',
	'- failFast: true | false'
].join('\n');

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function isVerifyStepKey(value: string): value is VerifyStepKey {
	return value === 'format' || value === 'lint' || value === 'check' || value === 'test';
}

function formatCommand(step: VerifyStepDefinition): string {
	return `npm ${step.args.join(' ')}`;
}

function formatDuration(durationMs: number): string {
	if (durationMs < 1_000) {
		return `${durationMs}ms`;
	}

	return `${(durationMs / 1_000).toFixed(1)}s`;
}

function statusGlyph(ok: boolean): string {
	return ok ? '✓' : '✗';
}

function summarizeState(state: VerifyState): string {
	const header = state.ok ? 'Verification passed' : 'Verification failed';
	const lines = state.results.map((result) => {
		const prefix = statusGlyph(result.ok);
		return `${prefix} ${result.key} (${formatDuration(result.durationMs)})`;
	});
	return [header, ...lines].join('\n');
}

function buildToolOutput(state: VerifyState): string {
	const lines = [summarizeState(state), '', `Completed at: ${state.completedAt}`];

	for (const result of state.results) {
		if (result.ok) {
			continue;
		}

		const combinedOutput = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
		if (!combinedOutput) {
			continue;
		}

		const tail = truncateTail(combinedOutput, { maxLines: 80, maxBytes: 12_000 });
		lines.push('', `Failure output for ${result.key}:`, tail.content);
	}

	return lines.join('\n');
}

function parseVerifyState(value: unknown): VerifyState | undefined {
	if (!isRecord(value)) {
		return undefined;
	}

	const { scope, ok, failFast, completedAt, results } = value;
	if (
		typeof scope !== 'string' ||
		typeof ok !== 'boolean' ||
		typeof failFast !== 'boolean' ||
		typeof completedAt !== 'string' ||
		!Array.isArray(results)
	) {
		return undefined;
	}

	const parsedResults: VerifyResult[] = [];
	for (const result of results) {
		if (!isRecord(result)) {
			return undefined;
		}

		const { key, command, stdout, stderr, durationMs, exitCode } = result;
		if (
			typeof key !== 'string' ||
			!isVerifyStepKey(key) ||
			typeof command !== 'string' ||
			typeof stdout !== 'string' ||
			typeof stderr !== 'string' ||
			typeof durationMs !== 'number' ||
			typeof exitCode !== 'number'
		) {
			return undefined;
		}

		parsedResults.push({
			key,
			command,
			ok: exitCode === 0,
			exitCode,
			stdout,
			stderr,
			durationMs
		});
	}

	return {
		scope,
		ok,
		failFast,
		completedAt,
		results: parsedResults
	};
}

function parseVerifyArgs(args: string | undefined): ParsedVerifyArgs {
	if (!args?.trim()) {
		return { steps: VERIFY_STEPS, failFast: false, showHelp: false, unknownTokens: [] };
	}

	const tokens = args
		.split(/\s+/)
		.map((token) => token.trim().toLowerCase())
		.filter(Boolean);

	const selectedSteps = new Set<VerifyStepKey>();
	const unknownTokens: string[] = [];
	let failFast = false;
	let showHelp = false;

	for (const token of tokens) {
		if (token === '--fail-fast' || token === 'fail-fast') {
			failFast = true;
			continue;
		}

		if (token === 'help' || token === '--help') {
			showHelp = true;
			continue;
		}

		if (token === 'all') {
			for (const step of VERIFY_STEPS) {
				selectedSteps.add(step.key);
			}
			continue;
		}

		if (isVerifyStepKey(token)) {
			selectedSteps.add(token);
			continue;
		}

		unknownTokens.push(token);
	}

	if (selectedSteps.size === 0) {
		return { steps: VERIFY_STEPS, failFast, showHelp, unknownTokens };
	}

	return {
		steps: VERIFY_STEPS.filter((step) => selectedSteps.has(step.key)),
		failFast,
		showHelp,
		unknownTokens
	};
}

function buildVerifyCompletionItems(prefix: string): AutocompleteItem[] | null {
	const options: AutocompleteItem[] = [
		{ value: 'all', label: 'all', description: 'Run format, lint, check, and test' },
		{ value: 'format', label: 'format', description: 'Run npm run format' },
		{ value: 'lint', label: 'lint', description: 'Run npm run lint' },
		{ value: 'check', label: 'check', description: 'Run npm run check' },
		{ value: 'test', label: 'test', description: 'Run npm run test' },
		{ value: '--fail-fast', label: '--fail-fast', description: 'Stop on first failing verify step' },
		{ value: 'help', label: 'help', description: 'Show verify usage help' }
	];

	const filtered = options.filter((item) => item.value.startsWith(prefix.toLowerCase()));
	return filtered.length > 0 ? filtered : null;
}

function buildStatusSegments(state: VerifyState): string[] {
	return VERIFY_STEPS.map((step) => {
		const result = state.results.find((entry) => entry.key === step.key);
		if (!result) {
			return `· ${step.key}`;
		}

		return `${statusGlyph(result.ok)} ${step.key}`;
	});
}

function updateVerifyUi(ctx: ExtensionContext, state: VerifyState | undefined) {
	if (!ctx.hasUI) {
		return;
	}

	if (!state) {
		ctx.ui.setStatus('verify', undefined);
		ctx.ui.setWidget('verify-summary', undefined, { placement: 'belowEditor' });
		return;
	}

	const theme = ctx.ui.theme;
	const statusSegments = buildStatusSegments(state);
	const lastFailed = state.results.find((result) => !result.ok);

	if (lastFailed) {
		ctx.ui.setStatus('verify', theme.fg('error', '✗ verify') + theme.fg('muted', ` ${lastFailed.key}`));
		ctx.ui.setWidget(
			'verify-summary',
			[
				theme.fg('muted', 'VERIFY // ') +
					statusSegments
						.map((segment) =>
							segment.startsWith('✓')
								? theme.fg('success', segment)
								: segment.startsWith('✗')
									? theme.fg('error', segment)
									: theme.fg('dim', segment)
						)
						.join(theme.fg('dim', ' · ')),
				theme.fg('warning', 'Latest verify run failed') + theme.fg('dim', ' · use /verify help for scoped reruns')
			],
			{ placement: 'belowEditor' }
		);
		return;
	}

	ctx.ui.setStatus('verify', theme.fg('success', '✓ verify'));
	ctx.ui.setWidget(
		'verify-summary',
		[
			theme.fg('muted', 'VERIFY // ') +
				statusSegments.map((segment) => theme.fg('success', segment)).join(theme.fg('dim', ' · ')),
			theme.fg('dim', `Completed ${new Date(state.completedAt).toLocaleTimeString()} · /verify help for scoped runs`)
		],
		{ placement: 'belowEditor' }
	);
}

function readLatestVerifyState(ctx: ExtensionContext): VerifyState | undefined {
	const entries = ctx.sessionManager
		.getEntries()
		.filter((entry) => entry.type === 'custom' && entry.customType === 'verify-state');
	const latestEntry = entries.at(-1);
	if (!latestEntry) {
		return undefined;
	}

	return parseVerifyState(latestEntry.data);
}

async function showVerifyHelp(ctx: ExtensionContext, unknownTokens: string[] = []) {
	const prefix = unknownTokens.length > 0 ? `Unknown verify args: ${unknownTokens.join(', ')}\n\n` : '';
	const helpText = `${prefix}${VERIFY_HELP_TEXT}`;

	if (!ctx.hasUI) {
		ctx.ui.notify(helpText, 'info');
		return;
	}

	await ctx.ui.editor('Verify workflow usage', helpText);
}

async function runVerification(
	pi: ExtensionAPI,
	ctx: ExtensionContext,
	steps: VerifyStepDefinition[],
	failFast: boolean,
	signal: AbortSignal | undefined,
	onProgress?: (message: string) => void
): Promise<VerifyState> {
	const results: VerifyResult[] = [];
	const theme = ctx.hasUI ? ctx.ui.theme : undefined;
	if (theme) {
		ctx.ui.setStatus('verify', theme.fg('warning', `… verify ${steps[0]?.key ?? 'idle'}`));
	}

	for (const [index, step] of steps.entries()) {
		const command = formatCommand(step);
		onProgress?.(`Running ${step.label} (${index + 1}/${steps.length}): ${command}`);
		if (theme) {
			ctx.ui.setStatus(
				'verify',
				theme.fg('warning', `… verify ${step.key}`) + theme.fg('dim', ` ${index + 1}/${steps.length}`)
			);
		}

		const startedAt = Date.now();
		const execution = await pi.exec('npm', step.args, { signal });
		const durationMs = Date.now() - startedAt;
		const exitCode = execution.code ?? (execution.killed ? 1 : 0);
		const result: VerifyResult = {
			key: step.key,
			command,
			ok: exitCode === 0,
			exitCode,
			stdout: execution.stdout,
			stderr: execution.stderr,
			durationMs
		};

		results.push(result);

		if (!result.ok && failFast) {
			break;
		}
	}

	const state: VerifyState = {
		scope: steps.map((step) => step.key).join(','),
		ok: results.length > 0 && results.every((result) => result.ok),
		failFast,
		completedAt: new Date().toISOString(),
		results
	};

	pi.appendEntry('verify-state', state);
	return state;
}

export default function verifyWorkflow(pi: ExtensionAPI) {
	pi.registerCommand('verify', {
		description: 'Run repo verification commands (use /verify help for args)',
		getArgumentCompletions: buildVerifyCompletionItems,
		handler: async (args, ctx) => {
			const parsed = parseVerifyArgs(args);
			if (parsed.showHelp || parsed.unknownTokens.length > 0) {
				await showVerifyHelp(ctx, parsed.unknownTokens);
				return;
			}

			const state = await runVerification(pi, ctx, parsed.steps, parsed.failFast, ctx.signal);
			updateVerifyUi(ctx, state);
			ctx.ui.notify(state.ok ? summarizeState(state) : buildToolOutput(state), state.ok ? 'info' : 'warning');
		}
	});

	pi.registerTool({
		name: 'verify_project',
		label: 'Verify Project',
		description:
			'Run the repository verification workflow using npm run format, npm run lint, npm run check, and npm run test.',
		promptSnippet: 'Run the repository verification workflow and summarize the result.',
		promptGuidelines: [
			'Use this tool when you need to validate that the current changes pass the required project verification commands.',
			'Prefer running this tool before calling work complete.'
		],
		parameters: Type.Object({
			scope: Type.Optional(StringEnum(['all', 'format', 'lint', 'check', 'test'] as const)),
			failFast: Type.Optional(Type.Boolean())
		}),
		async execute(_toolCallId, params, signal, onUpdate, ctx) {
			const scope = params.scope ?? 'all';
			const selectedSteps =
				scope === 'all'
					? VERIFY_STEPS
					: [VERIFY_STEP_LOOKUP.get(scope)].filter((step): step is VerifyStepDefinition => step !== undefined);
			const state = await runVerification(pi, ctx, selectedSteps, params.failFast ?? false, signal, (message) => {
				onUpdate?.({
					content: [{ type: 'text', text: message }],
					details: { step: message }
				});
			});
			updateVerifyUi(ctx, state);
			return {
				content: [{ type: 'text', text: buildToolOutput(state) }],
				details: state
			};
		},
		renderCall(args, theme) {
			const scope = args.scope ?? 'all';
			const failFast = args.failFast ? theme.fg('warning', ' --fail-fast') : '';
			return new Text(
				theme.fg('toolTitle', theme.bold('verify_project ')) + theme.fg('accent', scope) + failFast,
				0,
				0
			);
		},
		renderResult(result, { expanded, isPartial }, theme) {
			const partialStep =
				isRecord(result.details) && typeof result.details.step === 'string' ? result.details.step : undefined;
			if (isPartial) {
				return new Text(theme.fg('warning', partialStep ?? 'Running verification...'), 0, 0);
			}

			const state = parseVerifyState(result.details);
			if (!state) {
				const text = result.content[0];
				return new Text(text?.type === 'text' ? text.text : 'Verification complete', 0, 0);
			}

			let output = state.ok ? theme.fg('success', '✓ verify passed') : theme.fg('error', '✗ verify failed');
			output += theme.fg('dim', ` (${state.scope})`);
			for (const step of VERIFY_STEPS) {
				const stepResult = state.results.find((entry) => entry.key === step.key);
				if (!stepResult) {
					continue;
				}
				output += '\n';
				output += stepResult.ok ? theme.fg('success', `✓ ${step.key}`) : theme.fg('error', `✗ ${step.key}`);
				output += theme.fg('dim', ` (${formatDuration(stepResult.durationMs)})`);
			}

			if (!expanded) {
				return new Text(output, 0, 0);
			}

			for (const stepResult of state.results) {
				if (stepResult.ok) {
					continue;
				}

				const combinedOutput = [stepResult.stdout, stepResult.stderr].filter(Boolean).join('\n').trim();
				if (!combinedOutput) {
					continue;
				}

				const tail = truncateTail(combinedOutput, { maxLines: 24, maxBytes: 4_000 });
				output += `\n\n${theme.fg('warning', `Failure output for ${stepResult.key}:`)}`;
				for (const line of tail.content.split('\n')) {
					output += `\n${theme.fg('dim', line)}`;
				}
			}

			return new Text(output, 0, 0);
		}
	});

	pi.on('session_start', async (_event, ctx) => {
		updateVerifyUi(ctx, readLatestVerifyState(ctx));
	});
}
