import type { ExtensionAPI, ExtensionContext } from '@mariozechner/pi-coding-agent';

type MessageRole = 'user' | 'assistant' | 'toolResult';

type VerificationStep = 'format' | 'lint' | 'check' | 'test';

interface EntryLike {
	type: string;
	customType?: string;
	id?: string;
	parentId?: string | null;
	message?: MessageLike;
	data?: unknown;
}

interface MessageLike {
	role: MessageRole | string;
	content?: string | ContentBlock[];
	toolCallId?: string;
	toolName?: string;
	isError?: boolean;
}

type ContentBlock = TextBlock | ToolCallBlock | GenericBlock;

interface TextBlock {
	type: 'text';
	text: string;
}

interface ToolCallBlock {
	type: 'toolCall';
	id: string;
	name: string;
	arguments: Record<string, unknown>;
}

interface GenericBlock {
	type: string;
	[key: string]: unknown;
}

interface ToolCallInfo {
	name: string;
	arguments: Record<string, unknown>;
}

interface VerifyStepStatus {
	ok: boolean;
	source: string;
}

interface VerifyStateLike {
	ok: boolean;
	results: Array<{ key: VerificationStep; ok: boolean }>;
}

interface ContextSnapshot {
	activeMode?: string;
	latestGoal?: string;
	recentRequests: string[];
	readFiles: string[];
	modifiedFiles: string[];
	verification: Array<{ step: VerificationStep; ok: boolean; source: string }>;
	risks: string[];
	followUps: string[];
	assistantCarryForward: string[];
}

const MAX_REQUESTS = 3;
const MAX_FILES = 12;
const MAX_NOTES = 6;
const MAX_PREVIOUS_SUMMARY = 4_000;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function isContentBlock(value: unknown): value is ContentBlock {
	return isRecord(value) && typeof value.type === 'string';
}

function isToolCallBlock(value: ContentBlock): value is ToolCallBlock {
	return (
		value.type === 'toolCall' &&
		typeof value.id === 'string' &&
		typeof value.name === 'string' &&
		isRecord(value.arguments)
	);
}

function isTextBlock(value: ContentBlock): value is TextBlock {
	return value.type === 'text' && typeof value.text === 'string';
}

function isMessageLike(value: unknown): value is MessageLike {
	return isRecord(value) && typeof value.role === 'string';
}

function compactText(text: string, maxLength: number): string {
	const singleLine = text.replace(/\s+/g, ' ').trim();
	if (singleLine.length <= maxLength) {
		return singleLine;
	}

	return `${singleLine.slice(0, maxLength - 1).trimEnd()}…`;
}

function uniqueLimited(items: Iterable<string>, maxItems: number): string[] {
	const seen = new Set<string>();
	for (const item of items) {
		const trimmed = item.trim();
		if (!trimmed) {
			continue;
		}

		seen.add(trimmed);
		if (seen.size >= maxItems) {
			break;
		}
	}

	return [...seen];
}

function extractText(content: string | ContentBlock[] | undefined): string {
	if (typeof content === 'string') {
		return content.trim();
	}

	if (!Array.isArray(content)) {
		return '';
	}

	return content
		.filter(isContentBlock)
		.filter(isTextBlock)
		.map((block) => block.text)
		.join('\n')
		.trim();
}

function orderEntries(entries: EntryLike[]): EntryLike[] {
	if (entries.length < 2) {
		return [...entries];
	}

	const [first, second] = entries;
	if (first.parentId && first.parentId === second.id) {
		return [...entries].reverse();
	}

	return [...entries];
}

function shouldTreatAsGoal(text: string): boolean {
	const trimmed = text.trim();
	if (!trimmed) {
		return false;
	}

	return !trimmed.startsWith('/');
}

function extractPathFromArguments(argumentsObject: Record<string, unknown>): string | undefined {
	const path = argumentsObject.path;
	if (typeof path !== 'string') {
		return undefined;
	}

	return path.replace(/^@+/, '');
}

function extractVerifyState(data: unknown): VerifyStateLike | undefined {
	if (!isRecord(data) || typeof data.ok !== 'boolean' || !Array.isArray(data.results)) {
		return undefined;
	}

	const results: Array<{ key: VerificationStep; ok: boolean }> = [];
	for (const result of data.results) {
		if (!isRecord(result) || typeof result.key !== 'string' || typeof result.ok !== 'boolean') {
			return undefined;
		}

		if (result.key !== 'format' && result.key !== 'lint' && result.key !== 'check' && result.key !== 'test') {
			return undefined;
		}

		results.push({ key: result.key, ok: result.ok });
	}

	return { ok: data.ok, results };
}

function collectImportantLines(text: string, risks: Set<string>, followUps: Set<string>, carryForward: Set<string>) {
	for (const rawLine of text.split('\n')) {
		const line = rawLine.replace(/^[-*]\s*/, '').trim();
		if (!line) {
			continue;
		}

		if (/(follow[- ]?up|manual|before merge|before merging|remote|migration|needs to be run)/i.test(line)) {
			followUps.add(compactText(line, 220));
		}

		if (/(risk|risky|warning|caution|edge case|blocker|watch out|important)/i.test(line)) {
			risks.add(compactText(line, 220));
		}

		if (/(decided|decision|implemented|updated|changed|added|removed|remaining|next step)/i.test(line)) {
			carryForward.add(compactText(line, 220));
		}
	}
}

function describeVerification(
	verification: Map<VerificationStep, VerifyStepStatus>
): Array<{ step: VerificationStep; ok: boolean; source: string }> {
	return ['format', 'lint', 'check', 'test']
		.filter(
			(step): step is VerificationStep => step === 'format' || step === 'lint' || step === 'check' || step === 'test'
		)
		.map((step) => {
			const status = verification.get(step);
			return status ? { step, ok: status.ok, source: status.source } : undefined;
		})
		.filter((status): status is { step: VerificationStep; ok: boolean; source: string } => status !== undefined);
}

function buildSnapshot(entries: EntryLike[]): ContextSnapshot {
	const orderedEntries = orderEntries(entries);
	const toolCalls = new Map<string, ToolCallInfo>();
	const recentRequests: string[] = [];
	const readFiles = new Set<string>();
	const modifiedFiles = new Set<string>();
	const risks = new Set<string>();
	const followUps = new Set<string>();
	const carryForward = new Set<string>();
	const verification = new Map<VerificationStep, VerifyStepStatus>();
	let latestGoal: string | undefined;
	let activeMode: string | undefined;

	for (const entry of orderedEntries) {
		if (
			entry.type === 'custom' &&
			entry.customType === 'preset-state' &&
			isRecord(entry.data) &&
			typeof entry.data.name === 'string'
		) {
			activeMode = entry.data.name || undefined;
		}

		if (entry.type === 'custom' && entry.customType === 'verify-state') {
			const verifyState = extractVerifyState(entry.data);
			if (verifyState) {
				for (const result of verifyState.results) {
					verification.set(result.key, { ok: result.ok, source: 'verify workflow' });
				}
			}
		}

		if (!isMessageLike(entry.message)) {
			continue;
		}

		if (entry.message.role === 'user') {
			const text = extractText(entry.message.content);
			if (shouldTreatAsGoal(text)) {
				latestGoal = compactText(text, 260);
				recentRequests.push(compactText(text, 200));
			}
			continue;
		}

		if (entry.message.role === 'assistant') {
			if (Array.isArray(entry.message.content)) {
				for (const block of entry.message.content) {
					if (!isContentBlock(block) || !isToolCallBlock(block)) {
						continue;
					}
					toolCalls.set(block.id, { name: block.name, arguments: block.arguments });
				}
			}

			const text = extractText(entry.message.content);
			collectImportantLines(text, risks, followUps, carryForward);
			continue;
		}

		if (entry.message.role !== 'toolResult') {
			continue;
		}

		const toolCallId = typeof entry.message.toolCallId === 'string' ? entry.message.toolCallId : undefined;
		const callInfo = toolCallId ? toolCalls.get(toolCallId) : undefined;
		const toolName = callInfo?.name ?? entry.message.toolName;

		if (toolName === 'read') {
			const path = callInfo ? extractPathFromArguments(callInfo.arguments) : undefined;
			if (path) {
				readFiles.add(path);
			}
			continue;
		}

		if (toolName === 'edit' || toolName === 'write') {
			const path = callInfo ? extractPathFromArguments(callInfo.arguments) : undefined;
			if (path) {
				modifiedFiles.add(path);
			}
			continue;
		}

		if (toolName === 'bash' && callInfo) {
			const command = typeof callInfo.arguments.command === 'string' ? callInfo.arguments.command.trim() : '';
			const failed = entry.message.isError === true;
			if (command === 'npm run format') {
				verification.set('format', { ok: !failed, source: command });
			} else if (command === 'npm run lint') {
				verification.set('lint', { ok: !failed, source: command });
			} else if (command === 'npm run check') {
				verification.set('check', { ok: !failed, source: command });
			} else if (command === 'npm run test') {
				verification.set('test', { ok: !failed, source: command });
			}
		}
	}

	const recentRequestList = uniqueLimited(recentRequests.slice(-MAX_REQUESTS), MAX_REQUESTS);
	const readFileList = uniqueLimited(readFiles, MAX_FILES);
	const modifiedFileList = uniqueLimited(modifiedFiles, MAX_FILES);

	if (modifiedFileList.length > 0 && verification.size === 0) {
		followUps.add('Run /verify before calling the work complete.');
	}

	if (modifiedFileList.some((path) => path.startsWith('supabase/migrations/'))) {
		followUps.add(
			'If the migration needs to be applied remotely, do not run it from pi. State the required manual migration step before merge.'
		);
	}

	for (const status of verification.values()) {
		if (!status.ok) {
			risks.add('The latest recorded verification run has at least one failing step.');
			break;
		}
	}

	return {
		activeMode,
		latestGoal,
		recentRequests: recentRequestList,
		readFiles: readFileList,
		modifiedFiles: modifiedFileList,
		verification: describeVerification(verification),
		risks: uniqueLimited(risks, MAX_NOTES),
		followUps: uniqueLimited(followUps, MAX_NOTES),
		assistantCarryForward: uniqueLimited(carryForward, MAX_NOTES)
	};
}

function formatList(items: string[]): string {
	if (items.length === 0) {
		return '- None captured.';
	}

	return items.map((item) => `- ${item}`).join('\n');
}

function buildSummary(entries: EntryLike[], previousSummary?: string): { summary: string; details: ContextSnapshot } {
	const snapshot = buildSnapshot(entries);
	const lines: string[] = ['# Context keeper summary'];

	if (previousSummary?.trim()) {
		lines.push('', '## Previous compacted context', compactText(previousSummary, MAX_PREVIOUS_SUMMARY));
	}

	lines.push('', '## Active mode', snapshot.activeMode ? `- ${snapshot.activeMode}` : '- None recorded.');
	lines.push('', '## Active goal', snapshot.latestGoal ? `- ${snapshot.latestGoal}` : '- None captured.');
	lines.push('', '## Recent user requests', formatList(snapshot.recentRequests));
	lines.push('', '## Files read', formatList(snapshot.readFiles));
	lines.push('', '## Files modified', formatList(snapshot.modifiedFiles));
	lines.push(
		'',
		'## Verification',
		snapshot.verification.length === 0
			? '- No verification run recorded.'
			: snapshot.verification
					.map((status) => `- ${status.ok ? 'PASS' : 'FAIL'} ${status.step} (${status.source})`)
					.join('\n')
	);
	lines.push('', '## Open risks', formatList(snapshot.risks));
	lines.push('', '## Follow-ups', formatList(snapshot.followUps));
	lines.push('', '## Assistant carry-forward notes', formatList(snapshot.assistantCarryForward));

	return {
		summary: lines.join('\n'),
		details: snapshot
	};
}

export default function contextKeeper(pi: ExtensionAPI) {
	pi.registerCommand('context-summary', {
		description: 'Preview the context snapshot used for custom compaction',
		handler: async (_args, ctx) => {
			const entries = ctx.sessionManager.getBranch() as EntryLike[];
			const { summary } = buildSummary(entries);
			if (!ctx.hasUI) {
				return;
			}

			await ctx.ui.editor('Current context summary', summary);
		}
	});

	pi.on('session_before_compact', async (event) => {
		const { summary, details } = buildSummary(event.branchEntries as EntryLike[], event.preparation.previousSummary);
		return {
			compaction: {
				summary,
				firstKeptEntryId: event.preparation.firstKeptEntryId,
				tokensBefore: event.preparation.tokensBefore,
				details
			}
		};
	});
}
