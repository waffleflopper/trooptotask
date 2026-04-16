import type { AutocompleteItem } from '@mariozechner/pi-tui';
import type { ExtensionAPI, ExtensionContext } from '@mariozechner/pi-coding-agent';
import { loadSlicesConfig, normalizeIssueNumbers, saveSlicesConfig } from './config.js';
import { fetchIssues, resolveCurrentRepo } from './github.js';
import { detectWorkflowFromInput, parseIssueNumberWithRest } from './input-hooks.js';
import { showSlicesPicker } from './picker.js';
import { parseIssueNumber, parseIssueSetSpec } from './range-spec.js';
import { createSessionState, persistSessionState, restoreLatestVerifyState, restoreSessionState } from './state.js';
import type { EntryLike, GitHubSlicesConfig, LatestVerifyState, SliceIssue, SliceSessionState } from './types.js';
import { createSlicesWidget } from './widget.js';

export default function githubSlicesExtension(pi: ExtensionAPI) {
	let config: GitHubSlicesConfig | undefined;
	let issues: SliceIssue[] = [];
	let metadataError: string | undefined;
	let latestVerifyState: LatestVerifyState | undefined;
	let latestCtx: ExtensionContext | undefined;
	let sessionState: SliceSessionState = createSessionState();

	function getIssueNumbers(): number[] {
		return config?.issues ?? issues.map((issue) => issue.number);
	}

	function getPickerItems() {
		return issues.map((issue) => ({
			number: issue.number,
			title: issue.title,
			state: issue.state,
			isActive: issue.number === sessionState.activeIssueNumber
		}));
	}

	function buildIssueAutocomplete(prefix: string): AutocompleteItem[] | null {
		const value = prefix.trim();
		const options = issues.map((issue) => ({
			value: String(issue.number),
			label: `#${issue.number}`,
			description: issue.title
		}));
		const filtered = options.filter((option) => option.value.startsWith(value));
		return filtered.length > 0 ? filtered : null;
	}

	function refreshUi(ctx: ExtensionContext) {
		latestCtx = ctx;
		if (!ctx.hasUI) {
			return;
		}

		ctx.ui.setWidget(
			'github-slices',
			createSlicesWidget({
				config,
				issues,
				activeIssueNumber: sessionState.activeIssueNumber,
				activeWorkflow: sessionState.activeWorkflow,
				latestVerify: latestVerifyState,
				metadataError
			}),
			{ placement: 'aboveEditor' }
		);

		if (!config || !sessionState.activeIssueNumber) {
			ctx.ui.setStatus('github-slices', undefined);
			return;
		}

		ctx.ui.setStatus(
			'github-slices',
			ctx.ui.theme.fg('accent', `slice:#${sessionState.activeIssueNumber}`) +
				(sessionState.activeWorkflow ? ctx.ui.theme.fg('dim', ` ${sessionState.activeWorkflow}`) : '') +
				(latestVerifyState
					? latestVerifyState.ok
						? ctx.ui.theme.fg('success', ' ✓verify')
						: ctx.ui.theme.fg(
								'warning',
								` ✗verify${latestVerifyState.failedStep ? `:${latestVerifyState.failedStep}` : ''}`
							)
					: '')
		);
	}

	function persistAndRefresh(ctx: ExtensionContext, nextState: SliceSessionState) {
		sessionState = nextState;
		persistSessionState(pi, sessionState);
		refreshUi(ctx);
	}

	function ensureActiveIssueIsValid() {
		const issueNumbers = getIssueNumbers();
		if (issueNumbers.length === 0) {
			sessionState = createSessionState(undefined, undefined);
			return;
		}

		if (sessionState.activeIssueNumber && issueNumbers.includes(sessionState.activeIssueNumber)) {
			return;
		}

		sessionState = createSessionState(issueNumbers[0], sessionState.activeWorkflow);
	}

	async function reloadConfigAndIssues(ctx: ExtensionContext, signal?: AbortSignal) {
		config = await loadSlicesConfig(ctx.cwd);
		metadataError = undefined;
		issues = [];

		if (!config) {
			refreshUi(ctx);
			return;
		}

		try {
			issues = await fetchIssues(pi, config.repo, config.issues, signal);
			ensureActiveIssueIsValid();
		} catch (error) {
			metadataError = error instanceof Error ? error.message : 'Failed to fetch GitHub issues.';
		}

		refreshUi(ctx);
	}

	function parseCommandIssue(args: string | undefined): number {
		return parseIssueNumber(args, 'issue number');
	}

	async function ensureConfig(ctx: ExtensionContext): Promise<GitHubSlicesConfig> {
		if (config) {
			return config;
		}

		throw new Error('No slice set configured. Use /slice-set 568-581 first.');
	}

	async function saveIssueSet(ctx: ExtensionContext, nextIssues: number[]) {
		const repo = config?.repo ?? (await resolveCurrentRepo(pi, ctx.signal));
		const nextConfig: GitHubSlicesConfig = {
			repo,
			issues: normalizeIssueNumbers(nextIssues),
			widget: config?.widget ?? { placement: 'aboveEditor', windowSize: 5 }
		};
		await saveSlicesConfig(ctx.cwd, nextConfig);
		config = nextConfig;
		await reloadConfigAndIssues(ctx, ctx.signal);
	}

	function moveActiveIssue(ctx: ExtensionContext, direction: 1 | -1) {
		const issueNumbers = getIssueNumbers();
		if (issueNumbers.length === 0) {
			throw new Error('No slice set configured.');
		}

		const current = sessionState.activeIssueNumber ?? issueNumbers[0];
		const index = issueNumbers.indexOf(current);
		const fallbackIndex = direction === 1 ? 0 : issueNumbers.length - 1;
		const nextIndex = index === -1 ? fallbackIndex : Math.min(issueNumbers.length - 1, Math.max(0, index + direction));
		persistAndRefresh(ctx, createSessionState(issueNumbers[nextIndex], 'manual'));
	}

	function updateWorkflowState(
		ctx: ExtensionContext,
		workflow: SliceSessionState['activeWorkflow'],
		issueNumber = sessionState.activeIssueNumber
	) {
		persistAndRefresh(ctx, createSessionState(issueNumber, workflow));
	}

	function restoreStateFromSession(ctx: ExtensionContext) {
		const entries = ctx.sessionManager.getBranch() as EntryLike[];
		const restored = restoreSessionState(entries);
		if (restored) {
			sessionState = restored;
		}
		latestVerifyState = restoreLatestVerifyState(entries);
		ensureActiveIssueIsValid();
		refreshUi(ctx);
	}

	pi.registerCommand('slice-set', {
		description: 'Set the ordered GitHub slice issue list. Example: /slice-set 568-581 or /slice-set 568-573,575-581',
		handler: async (args, ctx) => {
			const nextIssues = parseIssueSetSpec(args ?? '');
			await saveIssueSet(ctx, nextIssues);
			persistAndRefresh(ctx, createSessionState(nextIssues[0], 'manual'));
			ctx.ui.notify(`Loaded ${nextIssues.length} slice issue(s).`, 'info');
		}
	});

	pi.registerCommand('slice-add', {
		description: 'Append an issue to the current slice set',
		getArgumentCompletions: buildIssueAutocomplete,
		handler: async (args, ctx) => {
			const issueNumber = parseCommandIssue(args);
			const currentConfig = config;
			const nextIssues = normalizeIssueNumbers([...(currentConfig?.issues ?? []), issueNumber]);
			await saveIssueSet(ctx, nextIssues);
			if (!sessionState.activeIssueNumber) {
				persistAndRefresh(ctx, createSessionState(issueNumber, 'manual'));
			}
			ctx.ui.notify(`Added #${issueNumber} to the slice set.`, 'info');
		}
	});

	pi.registerCommand('slice-remove', {
		description: 'Remove an issue from the current slice set',
		getArgumentCompletions: buildIssueAutocomplete,
		handler: async (args, ctx) => {
			const issueNumber = parseCommandIssue(args);
			const currentConfig = await ensureConfig(ctx);
			const nextIssues = currentConfig.issues.filter((issue) => issue !== issueNumber);
			if (nextIssues.length === 0) {
				throw new Error('Cannot remove the last slice. Use a new /slice-set instead.');
			}

			await saveIssueSet(ctx, nextIssues);
			if (sessionState.activeIssueNumber === issueNumber) {
				persistAndRefresh(ctx, createSessionState(nextIssues[0], 'manual'));
			} else {
				refreshUi(ctx);
			}
			ctx.ui.notify(`Removed #${issueNumber} from the slice set.`, 'info');
		}
	});

	pi.registerCommand('slice', {
		description: 'Set the active slice issue',
		getArgumentCompletions: buildIssueAutocomplete,
		handler: async (args, ctx) => {
			const issueNumber = parseCommandIssue(args);
			const available = new Set(getIssueNumbers());
			if (!available.has(issueNumber)) {
				throw new Error(`Issue #${issueNumber} is not in the current slice set. Use /slice-add ${issueNumber} first.`);
			}

			persistAndRefresh(ctx, createSessionState(issueNumber, 'manual'));
			ctx.ui.notify(`Active slice set to #${issueNumber}.`, 'info');
		}
	});

	pi.registerCommand('slice-next', {
		description: 'Move to the next slice in the configured order',
		handler: async (_args, ctx) => {
			moveActiveIssue(ctx, 1);
		}
	});

	pi.registerCommand('slice-prev', {
		description: 'Move to the previous slice in the configured order',
		handler: async (_args, ctx) => {
			moveActiveIssue(ctx, -1);
		}
	});

	pi.registerCommand('slice-clear', {
		description: 'Clear the active slice highlight',
		handler: async (_args, ctx) => {
			persistAndRefresh(ctx, createSessionState(undefined, undefined));
			ctx.ui.notify('Cleared the active slice.', 'info');
		}
	});

	pi.registerCommand('verify-slice', {
		description: 'Set the active slice and run the verify-work skill for it',
		getArgumentCompletions: buildIssueAutocomplete,
		handler: async (args, ctx) => {
			const issueNumber = parseCommandIssue(args);
			const available = new Set(getIssueNumbers());
			if (!available.has(issueNumber)) {
				throw new Error(`Issue #${issueNumber} is not in the current slice set. Use /slice-add ${issueNumber} first.`);
			}

			updateWorkflowState(ctx, 'verify-work', issueNumber);
			pi.sendUserMessage(`/skill:verify-work ${issueNumber}`);
		}
	});

	pi.registerCommand('tdd-slice', {
		description: 'Set the active slice and run the TDD skill for it',
		handler: async (args, ctx) => {
			const { issueNumber, rest } = parseIssueNumberWithRest(args);
			const available = new Set(getIssueNumbers());
			if (!available.has(issueNumber)) {
				throw new Error(`Issue #${issueNumber} is not in the current slice set. Use /slice-add ${issueNumber} first.`);
			}

			updateWorkflowState(ctx, 'tdd', issueNumber);
			const suffix = rest || `Issue #${issueNumber}`;
			pi.sendUserMessage(`/skill:tdd ${suffix}`);
		}
	});

	pi.registerCommand('slice-refresh', {
		description: 'Refresh GitHub metadata for the current slice set',
		handler: async (_args, ctx) => {
			await ensureConfig(ctx);
			await reloadConfigAndIssues(ctx, ctx.signal);
			ctx.ui.notify(metadataError ? metadataError : 'Slice metadata refreshed.', metadataError ? 'warning' : 'info');
		}
	});

	pi.registerCommand('slices', {
		description: 'Open the GitHub slice picker',
		handler: async (_args, ctx) => {
			if (issues.length === 0) {
				ctx.ui.notify('No slices loaded. Use /slice-set 568-581 first.', 'warning');
				return;
			}

			const selectedIssueNumber = await showSlicesPicker(ctx, getPickerItems());
			if (!selectedIssueNumber) {
				return;
			}

			persistAndRefresh(ctx, createSessionState(selectedIssueNumber, 'manual'));
			ctx.ui.notify(`Active slice set to #${selectedIssueNumber}.`, 'info');
		}
	});

	pi.on('input', async (event, ctx) => {
		const detected = detectWorkflowFromInput(event.text);
		if (!detected) {
			return { action: 'continue' };
		}

		const nextIssueNumber = detected.issueNumber ?? sessionState.activeIssueNumber;
		if (!nextIssueNumber) {
			return { action: 'continue' };
		}

		const available = new Set(getIssueNumbers());
		if (!available.has(nextIssueNumber)) {
			return { action: 'continue' };
		}

		updateWorkflowState(ctx, detected.workflow, nextIssueNumber);
		return { action: 'continue' };
	});

	pi.events.on('verify:updated', (payload: unknown) => {
		if (
			typeof payload !== 'object' ||
			payload === null ||
			typeof (payload as { completedAt?: unknown }).completedAt !== 'string'
		) {
			return;
		}

		const record = payload as { ok?: unknown; failedStep?: unknown; completedAt: string };
		latestVerifyState = {
			ok: typeof record.ok === 'boolean' ? record.ok : false,
			failedStep: typeof record.failedStep === 'string' ? record.failedStep : undefined,
			completedAt: record.completedAt
		};

		if (latestCtx) {
			refreshUi(latestCtx);
		}
	});

	pi.on('session_start', async (_event, ctx) => {
		sessionState = createSessionState();
		latestVerifyState = undefined;
		restoreStateFromSession(ctx);
		await reloadConfigAndIssues(ctx, ctx.signal);
	});

	pi.on('session_tree', async (_event, ctx) => {
		restoreStateFromSession(ctx);
	});
}
