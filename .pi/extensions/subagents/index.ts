import { randomUUID } from 'node:crypto';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { AgentToolResult } from '@mariozechner/pi-agent-core';
import type { Message } from '@mariozechner/pi-ai';
import { StringEnum } from '@mariozechner/pi-ai';
import { type ExtensionAPI, type ExtensionContext, withFileMutationQueue } from '@mariozechner/pi-coding-agent';
import { Text } from '@mariozechner/pi-tui';
import { Type } from '@sinclair/typebox';
import { type AgentConfig, type AgentScope, discoverAgents, findAgentByName } from './agents.js';

const MAX_PARALLEL_TASKS = 8;
const MAX_CONCURRENCY = 4;
const COLLAPSED_ITEM_COUNT = 10;
const MAX_WIDGET_RUNS = 4;
const MAX_WIDGET_TASKS = 3;

interface TaskDefinition {
	agent: string;
	task: string;
	cwd?: string;
	model?: string;
}

interface UsageStats {
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
	cost: number;
	contextTokens: number;
	turns: number;
}

interface SingleResult {
	agent: string;
	agentSource: 'user' | 'project' | 'unknown';
	task: string;
	exitCode: number;
	messages: Message[];
	stderr: string;
	usage: UsageStats;
	model?: string;
	stopReason?: string;
	errorMessage?: string;
	step?: number;
}

interface SubagentDetails {
	mode: 'single' | 'parallel' | 'chain';
	agentScope: AgentScope;
	projectAgentDirs: string[];
	results: SingleResult[];
}

type DisplayItem = { type: 'text'; text: string } | { type: 'toolCall'; name: string; args: Record<string, unknown> };

type WidgetTaskStatus = 'queued' | 'running' | 'success' | 'error';

interface WidgetTaskState {
	label: string;
	status: WidgetTaskStatus;
	preview?: string;
}

interface WidgetRunState {
	id: string;
	toolName: string;
	title: string;
	mode: 'single' | 'parallel' | 'chain';
	startedAt: number;
	tasks: WidgetTaskState[];
}

interface SingleResultOptions {
	modelOverride?: string;
	toolRestriction?: string[];
}

interface ClaudeCompatParams {
	subagent_type?: string;
	description?: string;
	prompt: string;
	model?: string;
	run_in_background?: boolean;
	agentScope?: AgentScope;
}

interface BackgroundJob {
	id: string;
	toolCallId: string;
	toolName: 'Agent' | 'Task';
	agentName: string;
	task: string;
	startedAt: number;
	child: ChildProcessWithoutNullStreams;
	result: SingleResult;
	agentScope: AgentScope;
	projectAgentDirs: string[];
	tempDir?: string;
}

const activeRuns = new Map<string, WidgetRunState>();
const backgroundJobs = new Map<string, BackgroundJob>();

function formatTokens(count: number): string {
	if (count < 1_000) return `${count}`;
	if (count < 10_000) return `${(count / 1_000).toFixed(1)}k`;
	if (count < 1_000_000) return `${Math.round(count / 1_000)}k`;
	return `${(count / 1_000_000).toFixed(1)}M`;
}

function formatUsageStats(
	usage: {
		input: number;
		output: number;
		cacheRead: number;
		cacheWrite: number;
		cost: number;
		contextTokens?: number;
		turns?: number;
	},
	model?: string
): string {
	const parts: string[] = [];
	if (usage.turns) parts.push(`${usage.turns} turn${usage.turns > 1 ? 's' : ''}`);
	if (usage.input) parts.push(`↑${formatTokens(usage.input)}`);
	if (usage.output) parts.push(`↓${formatTokens(usage.output)}`);
	if (usage.cacheRead) parts.push(`R${formatTokens(usage.cacheRead)}`);
	if (usage.cacheWrite) parts.push(`W${formatTokens(usage.cacheWrite)}`);
	if (usage.cost) parts.push(`$${usage.cost.toFixed(4)}`);
	if (usage.contextTokens && usage.contextTokens > 0) parts.push(`ctx:${formatTokens(usage.contextTokens)}`);
	if (model) parts.push(model);
	return parts.join(' ');
}

function compactText(text: string, maxLength = 80): string {
	const singleLine = text.replace(/\s+/g, ' ').trim();
	if (!singleLine) {
		return '';
	}
	return singleLine.length <= maxLength ? singleLine : `${singleLine.slice(0, maxLength - 1).trimEnd()}…`;
}

function shortenPath(path: string): string {
	return path.startsWith(homedir()) ? `~${path.slice(homedir().length)}` : path;
}

function getPiInvocation(args: string[]): { command: string; args: string[] } {
	const currentScript = process.argv[1];
	if (currentScript && existsSync(currentScript)) {
		return { command: process.execPath, args: [currentScript, ...args] };
	}

	return { command: 'pi', args };
}

function getFinalOutput(messages: Message[]): string {
	for (let index = messages.length - 1; index >= 0; index--) {
		const message = messages[index];
		if (message.role !== 'assistant') {
			continue;
		}

		for (const part of message.content) {
			if (part.type === 'text') {
				return part.text;
			}
		}
	}

	return '';
}

function getDisplayItems(messages: Message[]): DisplayItem[] {
	const items: DisplayItem[] = [];
	for (const message of messages) {
		if (message.role !== 'assistant') {
			continue;
		}

		for (const part of message.content) {
			if (part.type === 'text') {
				items.push({ type: 'text', text: part.text });
			} else if (part.type === 'toolCall') {
				items.push({ type: 'toolCall', name: part.name, args: part.arguments });
			}
		}
	}
	return items;
}

function formatToolCall(
	toolName: string,
	args: Record<string, unknown>,
	themeFg: (color: string, text: string) => string
): string {
	switch (toolName) {
		case 'bash': {
			const command = typeof args.command === 'string' ? args.command : '...';
			const preview = compactText(command, 60);
			return themeFg('muted', '$ ') + themeFg('toolOutput', preview);
		}
		case 'read': {
			const rawPath =
				typeof args.path === 'string' ? args.path : typeof args.file_path === 'string' ? args.file_path : '...';
			const offset = typeof args.offset === 'number' ? args.offset : undefined;
			const limit = typeof args.limit === 'number' ? args.limit : undefined;
			let text = themeFg('muted', 'read ') + themeFg('accent', shortenPath(rawPath));
			if (offset !== undefined || limit !== undefined) {
				const startLine = offset ?? 1;
				const endLine = limit ? startLine + limit - 1 : undefined;
				text += themeFg('warning', `:${startLine}${endLine ? `-${endLine}` : ''}`);
			}
			return text;
		}
		case 'write': {
			const rawPath =
				typeof args.path === 'string' ? args.path : typeof args.file_path === 'string' ? args.file_path : '...';
			return themeFg('muted', 'write ') + themeFg('accent', shortenPath(rawPath));
		}
		case 'edit': {
			const rawPath =
				typeof args.path === 'string' ? args.path : typeof args.file_path === 'string' ? args.file_path : '...';
			return themeFg('muted', 'edit ') + themeFg('accent', shortenPath(rawPath));
		}
		case 'find': {
			const pattern = typeof args.pattern === 'string' ? args.pattern : '*';
			const rawPath = typeof args.path === 'string' ? args.path : '.';
			return themeFg('muted', 'find ') + themeFg('accent', pattern) + themeFg('dim', ` in ${shortenPath(rawPath)}`);
		}
		case 'grep': {
			const pattern = typeof args.pattern === 'string' ? args.pattern : '';
			const rawPath = typeof args.path === 'string' ? args.path : '.';
			return (
				themeFg('muted', 'grep ') + themeFg('accent', `/${pattern}/`) + themeFg('dim', ` in ${shortenPath(rawPath)}`)
			);
		}
		case 'ls': {
			const rawPath = typeof args.path === 'string' ? args.path : '.';
			return themeFg('muted', 'ls ') + themeFg('accent', shortenPath(rawPath));
		}
		default: {
			return themeFg('accent', toolName) + themeFg('dim', ` ${compactText(JSON.stringify(args), 50)}`);
		}
	}
}

async function mapWithConcurrencyLimit<TIn, TOut>(
	items: TIn[],
	concurrency: number,
	fn: (item: TIn, index: number) => Promise<TOut>
): Promise<TOut[]> {
	if (items.length === 0) {
		return [];
	}

	const limit = Math.max(1, Math.min(concurrency, items.length));
	const results: TOut[] = new Array(items.length);
	let nextIndex = 0;

	await Promise.all(
		new Array(limit).fill(null).map(async () => {
			while (true) {
				const currentIndex = nextIndex++;
				if (currentIndex >= items.length) {
					return;
				}
				results[currentIndex] = await fn(items[currentIndex], currentIndex);
			}
		})
	);

	return results;
}

async function writePromptToTempFile(agentName: string, prompt: string): Promise<{ dir: string; filePath: string }> {
	const dir = await mkdtemp(join(tmpdir(), 'pi-subagent-'));
	const safeName = agentName.replace(/[^\w.-]+/g, '_');
	const filePath = join(dir, `${safeName}.md`);

	await withFileMutationQueue(filePath, async () => {
		await mkdir(dirname(filePath), { recursive: true });
		await writeFile(filePath, prompt, { encoding: 'utf8', mode: 0o600 });
	});

	return { dir, filePath };
}

function statusFromResult(result: SingleResult): WidgetTaskStatus {
	if (result.exitCode === -1) {
		return 'running';
	}
	if (result.exitCode !== 0 || result.stopReason === 'error' || result.stopReason === 'aborted') {
		return 'error';
	}
	return 'success';
}

function previewFromResult(result: SingleResult): string {
	const items = getDisplayItems(result.messages);
	for (let index = items.length - 1; index >= 0; index--) {
		const item = items[index];
		if (item.type === 'text') {
			const preview = compactText(item.text, 70);
			if (preview) {
				return preview;
			}
		}
	}

	if (result.errorMessage) {
		return compactText(result.errorMessage, 70);
	}
	if (result.stderr) {
		return compactText(result.stderr, 70);
	}
	return '';
}

function renderWidget(ctx: ExtensionContext) {
	if (!ctx.hasUI) {
		return;
	}

	if (activeRuns.size === 0) {
		ctx.ui.setStatus('subagents', undefined);
		ctx.ui.setWidget('subagents', undefined, { placement: 'belowEditor' });
		return;
	}

	const theme = ctx.ui.theme;
	const runs = [...activeRuns.values()]
		.sort((left, right) => left.startedAt - right.startedAt)
		.slice(0, MAX_WIDGET_RUNS);
	const activeTaskCount = runs
		.flatMap((run) => run.tasks)
		.filter((task) => task.status === 'queued' || task.status === 'running').length;

	ctx.ui.setStatus(
		'subagents',
		theme.fg('warning', '⏳ subagents') +
			theme.fg('dim', ` ${runs.length} run${runs.length === 1 ? '' : 's'} · ${activeTaskCount} active`)
	);

	const lines: string[] = [
		theme.fg('muted', 'SUBAGENTS // ') +
			theme.fg('warning', `${runs.length} run${runs.length === 1 ? '' : 's'} in flight`) +
			theme.fg('dim', ' · outputs continue in the tool pane')
	];

	for (const run of runs) {
		const running = run.tasks.filter((task) => task.status === 'queued' || task.status === 'running').length;
		const done = run.tasks.filter((task) => task.status === 'success').length;
		const failed = run.tasks.filter((task) => task.status === 'error').length;
		lines.push(
			theme.fg('accent', `• ${run.toolName}`) +
				theme.fg('dim', ` ${run.title}`) +
				theme.fg('muted', ` · ${run.mode}`) +
				theme.fg(
					'dim',
					` · ${done} done${failed ? ` · ${failed} failed` : ''}${running ? ` · ${running} running` : ''}`
				)
		);

		for (const task of run.tasks.slice(0, MAX_WIDGET_TASKS)) {
			const icon =
				task.status === 'success'
					? theme.fg('success', '✓')
					: task.status === 'error'
						? theme.fg('error', '✗')
						: theme.fg('warning', '⏳');
			const preview = task.preview ? theme.fg('dim', ` — ${task.preview}`) : '';
			lines.push(`  ${icon} ${theme.fg('muted', task.label)}${preview}`);
		}

		if (run.tasks.length > MAX_WIDGET_TASKS) {
			lines.push(theme.fg('dim', `  … ${run.tasks.length - MAX_WIDGET_TASKS} more task(s)`));
		}
	}

	if (activeRuns.size > runs.length) {
		lines.push(theme.fg('dim', `… ${activeRuns.size - runs.length} more run(s)`));
	}

	ctx.ui.setWidget('subagents', lines, { placement: 'belowEditor' });
}

function updateWidgetRun(
	ctx: ExtensionContext,
	toolCallId: string,
	toolName: string,
	title: string,
	mode: 'single' | 'parallel' | 'chain',
	tasks: WidgetTaskState[]
) {
	activeRuns.set(toolCallId, {
		id: toolCallId,
		toolName,
		title,
		mode,
		startedAt: activeRuns.get(toolCallId)?.startedAt ?? Date.now(),
		tasks
	});
	renderWidget(ctx);
}

function removeWidgetRun(ctx: ExtensionContext, toolCallId: string) {
	activeRuns.delete(toolCallId);
	renderWidget(ctx);
}

function initializeWidgetForSubagent(
	ctx: ExtensionContext,
	toolCallId: string,
	toolName: string,
	title: string,
	mode: 'single' | 'parallel' | 'chain',
	tasks: TaskDefinition[]
) {
	updateWidgetRun(
		ctx,
		toolCallId,
		toolName,
		title,
		mode,
		tasks.map((task, index) => ({
			label: mode === 'chain' ? `${index + 1}. ${task.agent}` : task.agent,
			status: 'queued',
			preview: compactText(task.task, 70)
		}))
	);
}

function syncWidgetFromDetails(
	ctx: ExtensionContext,
	toolCallId: string,
	toolName: string,
	title: string,
	details: SubagentDetails
) {
	updateWidgetRun(
		ctx,
		toolCallId,
		toolName,
		title,
		details.mode,
		details.results.map((result) => ({
			label: result.step ? `${result.step}. ${result.agent}` : result.agent,
			status: statusFromResult(result),
			preview: previewFromResult(result)
		}))
	);
}

function buildBackgroundResultContent(job: BackgroundJob): string {
	const status = statusFromResult(job.result);
	const heading = status === 'success' ? 'Background subagent completed' : 'Background subagent failed';
	const finalOutput = compactText(
		getFinalOutput(job.result.messages) || job.result.errorMessage || job.result.stderr || '(no output)',
		180
	);
	return `${heading}: ${job.agentName} (${job.id})\n\n${finalOutput}`;
}

function publishBackgroundResult(pi: ExtensionAPI, job: BackgroundJob) {
	pi.sendMessage(
		{
			customType: 'background-subagent-result',
			content: buildBackgroundResultContent(job),
			display: true,
			details: {
				jobId: job.id,
				toolName: job.toolName,
				result: job.result,
				agentScope: job.agentScope,
				projectAgentDirs: job.projectAgentDirs,
				startedAt: job.startedAt,
				completedAt: Date.now()
			}
		},
		{ deliverAs: 'steer', triggerTurn: true }
	);
}

async function cleanupBackgroundJob(job: BackgroundJob | undefined) {
	if (!job) {
		return;
	}

	backgroundJobs.delete(job.id);
	if (job.tempDir) {
		await rm(job.tempDir, { recursive: true, force: true }).catch(() => undefined);
	}
}

async function startBackgroundSubagent(
	pi: ExtensionAPI,
	ctx: ExtensionContext,
	toolCallId: string,
	toolName: 'Agent' | 'Task',
	title: string,
	agent: AgentConfig,
	task: string,
	cwd: string | undefined,
	agentScope: AgentScope,
	projectAgentDirs: string[],
	modelOverride?: string
): Promise<{ jobId: string }> {
	const args = ['--mode', 'json', '-p', '--no-session'];
	const resolvedModel = modelOverride ?? agent.model;
	if (resolvedModel) {
		args.push('--model', resolvedModel);
	}
	if (agent.tools && agent.tools.length > 0) {
		args.push('--tools', agent.tools.join(','));
	}

	let tempDir: string | undefined;
	let tempPromptPath: string | undefined;
	if (agent.systemPrompt.trim()) {
		const promptFile = await writePromptToTempFile(agent.name, agent.systemPrompt);
		tempDir = promptFile.dir;
		tempPromptPath = promptFile.filePath;
		args.push('--append-system-prompt', tempPromptPath);
	}

	args.push(`Task: ${task}`);
	const invocation = getPiInvocation(args);
	const child = spawn(invocation.command, invocation.args, {
		cwd: cwd ?? ctx.cwd,
		shell: false,
		stdio: ['ignore', 'pipe', 'pipe']
	});
	const jobId = `bg-${randomUUID().slice(0, 8)}`;
	const result: SingleResult = {
		agent: agent.name,
		agentSource: agent.source,
		task,
		exitCode: -1,
		messages: [],
		stderr: '',
		usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, contextTokens: 0, turns: 0 },
		model: resolvedModel
	};
	const job: BackgroundJob = {
		id: jobId,
		toolCallId,
		toolName,
		agentName: agent.name,
		task,
		startedAt: Date.now(),
		child,
		result,
		agentScope,
		projectAgentDirs,
		tempDir
	};
	backgroundJobs.set(jobId, job);
	updateWidgetRun(ctx, toolCallId, toolName, title, 'single', [
		{ label: agent.name, status: 'running', preview: compactText(task, 70) }
	]);

	let buffer = '';
	const processLine = (line: string) => {
		if (!line.trim()) {
			return;
		}

		let event: Record<string, unknown>;
		try {
			event = JSON.parse(line) as Record<string, unknown>;
		} catch {
			return;
		}

		if (event.type === 'message_end' && event.message) {
			const message = event.message as Message;
			job.result.messages.push(message);
			if (message.role === 'assistant') {
				job.result.usage.turns += 1;
				if (message.usage) {
					job.result.usage.input += message.usage.input || 0;
					job.result.usage.output += message.usage.output || 0;
					job.result.usage.cacheRead += message.usage.cacheRead || 0;
					job.result.usage.cacheWrite += message.usage.cacheWrite || 0;
					job.result.usage.cost += message.usage.cost?.total || 0;
					job.result.usage.contextTokens = message.usage.totalTokens || 0;
				}
				if (!job.result.model && message.model) {
					job.result.model = message.model;
				}
				job.result.stopReason = message.stopReason;
				job.result.errorMessage = message.errorMessage;
			}
		}

		if (event.type === 'tool_result_end' && event.message) {
			job.result.messages.push(event.message as Message);
		}

		updateWidgetRun(ctx, toolCallId, toolName, title, 'single', [
			{ label: agent.name, status: 'running', preview: previewFromResult(job.result) || compactText(task, 70) }
		]);
	};

	child.stdout.on('data', (data) => {
		buffer += data.toString();
		const lines = buffer.split('\n');
		buffer = lines.pop() || '';
		for (const line of lines) {
			processLine(line);
		}
	});

	child.stderr.on('data', (data) => {
		job.result.stderr += data.toString();
	});

	child.on('error', async () => {
		job.result.exitCode = 1;
		updateWidgetRun(ctx, toolCallId, toolName, title, 'single', [
			{ label: agent.name, status: 'error', preview: previewFromResult(job.result) || 'Process error' }
		]);
		publishBackgroundResult(pi, job);
		removeWidgetRun(ctx, toolCallId);
		await cleanupBackgroundJob(job);
	});

	child.on('close', async (code) => {
		if (buffer.trim()) {
			processLine(buffer);
		}
		job.result.exitCode = code ?? 0;
		updateWidgetRun(ctx, toolCallId, toolName, title, 'single', [
			{
				label: agent.name,
				status: statusFromResult(job.result),
				preview: previewFromResult(job.result) || compactText(task, 70)
			}
		]);
		publishBackgroundResult(pi, job);
		removeWidgetRun(ctx, toolCallId);
		await cleanupBackgroundJob(job);
	});

	return { jobId };
}

async function runSingleAgent(
	defaultCwd: string,
	agents: AgentConfig[],
	agentName: string,
	task: string,
	cwd: string | undefined,
	step: number | undefined,
	signal: AbortSignal | undefined,
	onUpdate: ((partial: AgentToolResult<SubagentDetails>) => void) | undefined,
	makeDetails: (results: SingleResult[]) => SubagentDetails,
	options: SingleResultOptions = {}
): Promise<SingleResult> {
	const agent = findAgentByName(agents, agentName);
	if (!agent) {
		const available = agents.map((entry) => `"${entry.name}"`).join(', ') || 'none';
		return {
			agent: agentName,
			agentSource: 'unknown',
			task,
			exitCode: 1,
			messages: [],
			stderr: `Unknown agent: "${agentName}". Available agents: ${available}.`,
			usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, contextTokens: 0, turns: 0 },
			step
		};
	}

	const args = ['--mode', 'json', '-p', '--no-session'];
	const resolvedModel = options.modelOverride ?? agent.model;
	if (resolvedModel) {
		args.push('--model', resolvedModel);
	}

	const resolvedTools = options.toolRestriction ?? agent.tools;
	if (resolvedTools && resolvedTools.length > 0) {
		args.push('--tools', resolvedTools.join(','));
	}

	const currentResult: SingleResult = {
		agent: agent.name,
		agentSource: agent.source,
		task,
		exitCode: -1,
		messages: [],
		stderr: '',
		usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, contextTokens: 0, turns: 0 },
		model: resolvedModel,
		step
	};

	let tempDir: string | undefined;
	let tempPromptPath: string | undefined;

	const emitUpdate = () => {
		onUpdate?.({
			content: [{ type: 'text', text: getFinalOutput(currentResult.messages) || '(running...)' }],
			details: makeDetails([currentResult])
		});
	};

	try {
		if (agent.systemPrompt.trim()) {
			const promptFile = await writePromptToTempFile(agent.name, agent.systemPrompt);
			tempDir = promptFile.dir;
			tempPromptPath = promptFile.filePath;
			args.push('--append-system-prompt', tempPromptPath);
		}

		args.push(`Task: ${task}`);
		let wasAborted = false;

		const exitCode = await new Promise<number>((resolve) => {
			const invocation = getPiInvocation(args);
			const child = spawn(invocation.command, invocation.args, {
				cwd: cwd ?? defaultCwd,
				shell: false,
				stdio: ['ignore', 'pipe', 'pipe']
			});
			let buffer = '';

			const processLine = (line: string) => {
				if (!line.trim()) {
					return;
				}

				let event: Record<string, unknown>;
				try {
					event = JSON.parse(line) as Record<string, unknown>;
				} catch {
					return;
				}

				if (event.type === 'message_end' && event.message) {
					const message = event.message as Message;
					currentResult.messages.push(message);

					if (message.role === 'assistant') {
						currentResult.usage.turns += 1;
						if (message.usage) {
							currentResult.usage.input += message.usage.input || 0;
							currentResult.usage.output += message.usage.output || 0;
							currentResult.usage.cacheRead += message.usage.cacheRead || 0;
							currentResult.usage.cacheWrite += message.usage.cacheWrite || 0;
							currentResult.usage.cost += message.usage.cost?.total || 0;
							currentResult.usage.contextTokens = message.usage.totalTokens || 0;
						}
						if (!currentResult.model && message.model) {
							currentResult.model = message.model;
						}
						currentResult.stopReason = message.stopReason;
						currentResult.errorMessage = message.errorMessage;
					}

					emitUpdate();
				}

				if (event.type === 'tool_result_end' && event.message) {
					currentResult.messages.push(event.message as Message);
					emitUpdate();
				}
			};

			child.stdout.on('data', (data) => {
				buffer += data.toString();
				const lines = buffer.split('\n');
				buffer = lines.pop() || '';
				for (const line of lines) {
					processLine(line);
				}
			});

			child.stderr.on('data', (data) => {
				currentResult.stderr += data.toString();
			});

			child.on('close', (code) => {
				if (buffer.trim()) {
					processLine(buffer);
				}
				resolve(code ?? 0);
			});

			child.on('error', () => {
				resolve(1);
			});

			if (signal) {
				const abort = () => {
					wasAborted = true;
					child.kill('SIGTERM');
					setTimeout(() => {
						if (!child.killed) {
							child.kill('SIGKILL');
						}
					}, 5_000);
				};

				if (signal.aborted) {
					abort();
				} else {
					signal.addEventListener('abort', abort, { once: true });
				}
			}
		});

		currentResult.exitCode = exitCode;
		if (wasAborted) {
			throw new Error('Subagent was aborted');
		}
		return currentResult;
	} finally {
		if (tempDir) {
			await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
		}
	}
}

const AgentScopeSchema = StringEnum(['user', 'project', 'both'] as const, {
	description:
		'Which agent directories to use. Default: both so project-local and Claude-compatible agents are available.'
});

const ClaudeCompatParamsSchema = Type.Object({
	subagent_type: Type.Optional(
		Type.String({ description: 'Claude-style subagent type, for example Explore, Plan, or general-purpose' })
	),
	description: Type.Optional(Type.String({ description: 'Short label for the delegated task' })),
	prompt: Type.String({ description: 'Full instructions for the delegated agent' }),
	model: Type.Optional(Type.String({ description: 'Optional model override, such as haiku or sonnet' })),
	run_in_background: Type.Optional(
		Type.Boolean({ description: 'Accepted for Claude Code compatibility. Pi runs the task synchronously.' })
	),
	agentScope: Type.Optional(AgentScopeSchema)
});

function buildSubagentTitle(
	mode: 'single' | 'parallel' | 'chain',
	params: { agent?: string; task?: string; tasks?: TaskDefinition[]; chain?: TaskDefinition[] }
): string {
	if (mode === 'single') {
		return `${params.agent ?? 'agent'} · ${compactText(params.task ?? '', 40)}`;
	}
	if (mode === 'parallel') {
		return `${params.tasks?.length ?? 0} parallel task(s)`;
	}
	return `${params.chain?.length ?? 0} chained step(s)`;
}

async function executeSubagentTool(
	toolName: string,
	toolCallId: string,
	params: {
		agent?: string;
		task?: string;
		tasks?: TaskDefinition[];
		chain?: TaskDefinition[];
		agentScope?: AgentScope;
		cwd?: string;
		model?: string;
	},
	signal: AbortSignal | undefined,
	onUpdate: ((partial: AgentToolResult<SubagentDetails>) => void) | undefined,
	ctx: ExtensionContext
): Promise<AgentToolResult<SubagentDetails>> {
	const agentScope = params.agentScope ?? 'both';
	const discovery = discoverAgents(ctx.cwd, agentScope);
	const agents = discovery.agents;
	const hasChain = (params.chain?.length ?? 0) > 0;
	const hasParallel = (params.tasks?.length ?? 0) > 0;
	const hasSingle = Boolean(params.agent && params.task);
	const modeCount = Number(hasChain) + Number(hasParallel) + Number(hasSingle);
	const mode: 'single' | 'parallel' | 'chain' = hasChain ? 'chain' : hasParallel ? 'parallel' : 'single';

	const makeDetails = (results: SingleResult[]): SubagentDetails => ({
		mode,
		agentScope,
		projectAgentDirs: discovery.projectAgentDirs,
		results
	});

	if (modeCount !== 1) {
		const available = agents.map((agent) => `${agent.name} (${agent.source})`).join(', ') || 'none';
		return {
			content: [{ type: 'text', text: `Invalid parameters. Provide exactly one mode. Available agents: ${available}` }],
			details: makeDetails([]),
			isError: true
		};
	}

	const title = buildSubagentTitle(mode, params);
	const initialTasks = hasChain
		? (params.chain ?? [])
		: hasParallel
			? (params.tasks ?? [])
			: [{ agent: params.agent!, task: params.task!, cwd: params.cwd, model: params.model }];
	initializeWidgetForSubagent(ctx, toolCallId, toolName, title, mode, initialTasks);

	const emitUpdate = (partial: AgentToolResult<SubagentDetails>) => {
		if (partial.details) {
			syncWidgetFromDetails(ctx, toolCallId, toolName, title, partial.details);
		}
		onUpdate?.(partial);
	};

	try {
		if (hasChain) {
			const results: SingleResult[] = [];
			let previousOutput = '';

			for (let index = 0; index < (params.chain?.length ?? 0); index++) {
				const step = params.chain![index]!;
				const task = step.task.replace(/\{previous\}/g, previousOutput);
				const result = await runSingleAgent(
					ctx.cwd,
					agents,
					step.agent,
					task,
					step.cwd,
					index + 1,
					signal,
					(partial) => {
						const current = partial.details?.results[0];
						if (!current) {
							return;
						}
						emitUpdate({
							content: partial.content,
							details: makeDetails([...results, current])
						});
					},
					(resultsForCurrent) => makeDetails(resultsForCurrent),
					{ modelOverride: step.model }
				);

				results.push(result);
				const isError = result.exitCode !== 0 || result.stopReason === 'error' || result.stopReason === 'aborted';
				if (isError) {
					const errorText = result.errorMessage || result.stderr || getFinalOutput(result.messages) || '(no output)';
					const response: AgentToolResult<SubagentDetails> = {
						content: [{ type: 'text', text: `Chain stopped at step ${index + 1} (${step.agent}): ${errorText}` }],
						details: makeDetails(results),
						isError: true
					};
					syncWidgetFromDetails(ctx, toolCallId, toolName, title, response.details);
					return response;
				}
				previousOutput = getFinalOutput(result.messages);
			}

			const response: AgentToolResult<SubagentDetails> = {
				content: [{ type: 'text', text: getFinalOutput(results.at(-1)?.messages ?? []) || '(no output)' }],
				details: makeDetails(results)
			};
			syncWidgetFromDetails(ctx, toolCallId, toolName, title, response.details);
			return response;
		}

		if (hasParallel) {
			if ((params.tasks?.length ?? 0) > MAX_PARALLEL_TASKS) {
				return {
					content: [
						{
							type: 'text',
							text: `Too many parallel tasks (${params.tasks?.length ?? 0}). Max is ${MAX_PARALLEL_TASKS}.`
						}
					],
					details: makeDetails([]),
					isError: true
				};
			}

			const allResults: SingleResult[] = (params.tasks ?? []).map((task) => ({
				agent: task.agent,
				agentSource: 'unknown',
				task: task.task,
				exitCode: -1,
				messages: [],
				stderr: '',
				usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, contextTokens: 0, turns: 0 },
				model: task.model
			}));

			const results = await mapWithConcurrencyLimit(params.tasks ?? [], MAX_CONCURRENCY, async (task, index) => {
				const result = await runSingleAgent(
					ctx.cwd,
					agents,
					task.agent,
					task.task,
					task.cwd,
					undefined,
					signal,
					(partial) => {
						const current = partial.details?.results[0];
						if (!current) {
							return;
						}
						allResults[index] = current;
						emitUpdate({
							content: [
								{
									type: 'text',
									text: `Parallel: ${allResults.filter((entry) => entry.exitCode !== -1).length}/${allResults.length} done`
								}
							],
							details: makeDetails([...allResults])
						});
					},
					(resultsForCurrent) => makeDetails(resultsForCurrent),
					{ modelOverride: task.model }
				);

				allResults[index] = result;
				emitUpdate({
					content: [
						{
							type: 'text',
							text: `Parallel: ${allResults.filter((entry) => entry.exitCode !== -1).length}/${allResults.length} done`
						}
					],
					details: makeDetails([...allResults])
				});
				return result;
			});

			const successCount = results.filter((result) => result.exitCode === 0).length;
			const summaries = results.map((result) => {
				const preview = compactText(
					getFinalOutput(result.messages) || result.errorMessage || result.stderr || '(no output)',
					100
				);
				return `[${result.agent}] ${result.exitCode === 0 ? 'completed' : 'failed'}: ${preview}`;
			});

			const response: AgentToolResult<SubagentDetails> = {
				content: [
					{ type: 'text', text: `Parallel: ${successCount}/${results.length} succeeded\n\n${summaries.join('\n\n')}` }
				],
				details: makeDetails(results),
				isError: successCount !== results.length
			};
			syncWidgetFromDetails(ctx, toolCallId, toolName, title, response.details);
			return response;
		}

		const singleResult = await runSingleAgent(
			ctx.cwd,
			agents,
			params.agent!,
			params.task!,
			params.cwd,
			undefined,
			signal,
			(partial) => emitUpdate(partial),
			(resultsForCurrent) => makeDetails(resultsForCurrent),
			{ modelOverride: params.model }
		);

		const isError =
			singleResult.exitCode !== 0 || singleResult.stopReason === 'error' || singleResult.stopReason === 'aborted';
		const response: AgentToolResult<SubagentDetails> = isError
			? {
					content: [
						{
							type: 'text',
							text: `Agent ${singleResult.stopReason || 'failed'}: ${singleResult.errorMessage || singleResult.stderr || getFinalOutput(singleResult.messages) || '(no output)'}`
						}
					],
					details: makeDetails([singleResult]),
					isError: true
				}
			: {
					content: [{ type: 'text', text: getFinalOutput(singleResult.messages) || '(no output)' }],
					details: makeDetails([singleResult])
				};
		syncWidgetFromDetails(ctx, toolCallId, toolName, title, response.details);
		return response;
	} finally {
		removeWidgetRun(ctx, toolCallId);
	}
}

function buildClaudeCompatTask(params: ClaudeCompatParams): string {
	return params.description?.trim() ? `${params.description.trim()}\n\n${params.prompt}` : params.prompt;
}

function mapClaudeAgentType(agentType: string | undefined): string {
	const normalized = agentType?.trim().toLowerCase();
	if (!normalized) {
		return 'general-purpose';
	}
	if (normalized === 'explore') {
		return 'Explore';
	}
	if (normalized === 'plan') {
		return 'Plan';
	}
	if (normalized === 'general-purpose') {
		return 'general-purpose';
	}
	return agentType!.trim();
}

function renderDisplayItems(
	items: DisplayItem[],
	theme: { fg: (color: string, text: string) => string },
	expanded: boolean,
	limit?: number
): string {
	const toRender = limit ? items.slice(-limit) : items;
	const skipped = limit && items.length > limit ? items.length - limit : 0;
	const lines: string[] = [];
	if (skipped > 0) {
		lines.push(theme.fg('muted', `... ${skipped} earlier items`));
	}
	for (const item of toRender) {
		if (item.type === 'toolCall') {
			lines.push(theme.fg('muted', '→ ') + formatToolCall(item.name, item.args, theme.fg));
		} else {
			lines.push(theme.fg('toolOutput', expanded ? item.text : item.text.split('\n').slice(0, 3).join('\n')));
		}
	}
	return lines.join('\n');
}

export default function subagents(pi: ExtensionAPI) {
	pi.registerCommand('subagents', {
		description: 'List the available Pi and Claude-compatible subagents',
		handler: async (_args, ctx) => {
			const discovery = discoverAgents(ctx.cwd, 'both');
			const lines = [
				'# Available subagents',
				'',
				`User dirs: ${discovery.userAgentDirs.length > 0 ? discovery.userAgentDirs.join(', ') : 'none'}`,
				`Project dirs: ${discovery.projectAgentDirs.length > 0 ? discovery.projectAgentDirs.join(', ') : 'none'}`,
				''
			];

			if (discovery.agents.length === 0) {
				lines.push('No subagents discovered.');
			} else {
				for (const agent of discovery.agents.sort((left, right) => left.name.localeCompare(right.name))) {
					lines.push(`- ${agent.name} (${agent.source}) — ${agent.description}`);
					if (agent.tools?.length) {
						lines.push(`  tools: ${agent.tools.join(', ')}`);
					}
					if (agent.model) {
						lines.push(`  model: ${agent.model}`);
					}
				}
			}

			lines.push('', '# Active background jobs', '');
			if (backgroundJobs.size === 0) {
				lines.push('None.');
			} else {
				for (const job of backgroundJobs.values()) {
					lines.push(`- ${job.id} — ${job.toolName} / ${job.agentName}`);
					lines.push(`  task: ${compactText(job.task, 160)}`);
					lines.push(`  status: ${statusFromResult(job.result)}`);
				}
			}

			if (!ctx.hasUI) {
				ctx.ui.notify(lines.join('\n'), 'info');
				return;
			}

			await ctx.ui.editor('Available subagents', lines.join('\n'));
		}
	});

	pi.registerMessageRenderer('background-subagent-result', (message, { expanded }, theme) => {
		const details = message.details as
			| {
					jobId?: string;
					toolName?: string;
					result?: SingleResult;
					startedAt?: number;
					completedAt?: number;
			  }
			| undefined;
		const result = details?.result;
		if (!result) {
			return new Text(typeof message.content === 'string' ? message.content : 'Background subagent result', 0, 0);
		}

		const finalOutput = getFinalOutput(result.messages);
		const lines = [
			`${statusFromResult(result) === 'success' ? theme.fg('success', '✓') : theme.fg('error', '✗')} ${theme.fg('accent', details?.toolName ?? 'Task')} ${theme.fg('muted', details?.jobId ?? '')}`,
			`${theme.fg('muted', 'agent:')} ${theme.fg('accent', result.agent)}${theme.fg('dim', ` (${result.agentSource})`)}`
		];

		const renderedItems = renderDisplayItems(
			getDisplayItems(result.messages),
			theme,
			expanded,
			expanded ? undefined : COLLAPSED_ITEM_COUNT
		);
		if (renderedItems) {
			lines.push(renderedItems);
		}
		if (expanded && finalOutput) {
			lines.push('', finalOutput.trim());
		}

		const usage = formatUsageStats(result.usage, result.model);
		if (usage) {
			lines.push(theme.fg('dim', usage));
		}
		if (details?.startedAt && details?.completedAt) {
			lines.push(theme.fg('dim', `duration ${((details.completedAt - details.startedAt) / 1000).toFixed(1)}s`));
		}
		if (!expanded) {
			lines.push(theme.fg('dim', '(Ctrl+O to expand full background subagent output)'));
		}

		return new Text(lines.join('\n'), 0, 0);
	});

	// The user already has a global subagent package installed, so this project-local extension
	// focuses on Claude Code compatibility aliases (`Agent` / `Task`) plus live widget tracking.

	for (const compatibleToolName of ['Agent', 'Task'] as const) {
		pi.registerTool({
			name: compatibleToolName,
			label: compatibleToolName,
			description:
				compatibleToolName === 'Agent'
					? 'Claude Code compatibility tool. Spawns a specialized subagent in an isolated Pi process.'
					: 'Claude Code Task compatibility tool. Spawns a specialized subagent in an isolated Pi process.',
			parameters: ClaudeCompatParamsSchema,
			async execute(toolCallId, params, signal, onUpdate, ctx) {
				const mappedAgent = mapClaudeAgentType(params.subagent_type);
				const task = buildClaudeCompatTask(params);
				const agentScope = params.agentScope ?? 'both';

				if (params.run_in_background) {
					const discovery = discoverAgents(ctx.cwd, agentScope);
					const agent = findAgentByName(discovery.agents, mappedAgent);
					if (!agent) {
						const available = discovery.agents.map((entry) => `${entry.name} (${entry.source})`).join(', ') || 'none';
						return {
							content: [{ type: 'text', text: `Unknown agent: ${mappedAgent}. Available agents: ${available}` }],
							isError: true
						};
					}

					const title = buildSubagentTitle('single', { agent: agent.name, task });
					const { jobId } = await startBackgroundSubagent(
						pi,
						ctx,
						toolCallId,
						compatibleToolName,
						title,
						agent,
						task,
						undefined,
						agentScope,
						discovery.projectAgentDirs,
						params.model
					);

					return {
						content: [
							{
								type: 'text',
								text: `Started background ${compatibleToolName} job ${jobId} using ${agent.name}. Results will be posted back into the conversation automatically when the subagent finishes.`
							}
						],
						details: {
							jobId,
							mode: 'single',
							agent: agent.name,
							background: true
						}
					};
				}

				return executeSubagentTool(
					compatibleToolName,
					toolCallId,
					{
						agent: mappedAgent,
						task,
						model: params.model,
						agentScope
					},
					signal,
					onUpdate,
					ctx
				);
			},
			renderCall(args, theme) {
				return new Text(
					theme.fg('toolTitle', theme.bold(`${compatibleToolName} `)) +
						theme.fg('accent', args.subagent_type ?? 'general-purpose') +
						(args.run_in_background ? theme.fg('warning', ' [bg]') : '') +
						theme.fg('dim', ` · ${compactText(args.description ?? args.prompt, 60)}`),
					0,
					0
				);
			},
			renderResult(result, { expanded }, theme) {
				const maybeBackground = result.details as { background?: boolean; jobId?: string; agent?: string } | undefined;
				if (maybeBackground?.background) {
					return new Text(
						theme.fg('warning', `⏳ background job ${maybeBackground.jobId ?? ''}`) +
							theme.fg('dim', ` · ${maybeBackground.agent ?? 'subagent'} running in parallel`),
						0,
						0
					);
				}

				const details = result.details as SubagentDetails | undefined;
				if (!details) {
					const block = result.content[0];
					return new Text(block?.type === 'text' ? block.text : '(no output)', 0, 0);
				}

				const entry = details.results[0];
				if (!entry) {
					const block = result.content[0];
					return new Text(block?.type === 'text' ? block.text : '(no output)', 0, 0);
				}

				const items = getDisplayItems(entry.messages);
				const lines = [
					`${statusFromResult(entry) === 'success' ? theme.fg('success', '✓') : theme.fg('warning', '◐')} ${theme.fg('accent', entry.agent)}${theme.fg('dim', ` (${entry.agentSource})`)}`,
					renderDisplayItems(items, theme, expanded, expanded ? undefined : COLLAPSED_ITEM_COUNT)
				].filter(Boolean);

				const usage = formatUsageStats(entry.usage, entry.model);
				if (usage) {
					lines.push(theme.fg('dim', usage));
				}
				if (!expanded) {
					lines.push(theme.fg('dim', '(Ctrl+O to expand full subagent output)'));
				}
				return new Text(lines.join('\n'), 0, 0);
			}
		});
	}

	pi.on('session_start', async (_event, ctx) => {
		activeRuns.clear();
		backgroundJobs.clear();
		renderWidget(ctx);
	});

	pi.on('session_shutdown', async (_event, ctx) => {
		for (const job of backgroundJobs.values()) {
			job.child.kill('SIGTERM');
		}
		activeRuns.clear();
		backgroundJobs.clear();
		renderWidget(ctx);
	});
}
