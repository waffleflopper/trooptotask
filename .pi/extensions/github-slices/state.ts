import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import type { EntryLike, LatestVerifyState, SliceSessionState } from './types.js';

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

export function createSessionState(
	activeIssueNumber?: number,
	activeWorkflow?: SliceSessionState['activeWorkflow']
): SliceSessionState {
	return {
		activeIssueNumber,
		activeWorkflow,
		updatedAt: new Date().toISOString()
	};
}

export function restoreSessionState(entries: EntryLike[]): SliceSessionState | undefined {
	const latest = entries
		.filter((entry) => entry.type === 'custom' && entry.customType === 'github-slices-state')
		.at(-1);

	if (!latest || !isRecord(latest.data) || typeof latest.data.updatedAt !== 'string') {
		return undefined;
	}

	return {
		activeIssueNumber: typeof latest.data.activeIssueNumber === 'number' ? latest.data.activeIssueNumber : undefined,
		activeWorkflow:
			latest.data.activeWorkflow === 'manual' ||
			latest.data.activeWorkflow === 'tdd' ||
			latest.data.activeWorkflow === 'verify-work'
				? latest.data.activeWorkflow
				: undefined,
		updatedAt: latest.data.updatedAt
	};
}

export function persistSessionState(pi: ExtensionAPI, state: SliceSessionState): void {
	pi.appendEntry('github-slices-state', state);
}

export function restoreLatestVerifyState(entries: EntryLike[]): LatestVerifyState | undefined {
	const latest = entries.filter((entry) => entry.type === 'custom' && entry.customType === 'verify-state').at(-1);
	if (
		!latest ||
		!isRecord(latest.data) ||
		!Array.isArray(latest.data.results) ||
		typeof latest.data.completedAt !== 'string'
	) {
		return undefined;
	}

	let failedStep: string | undefined;
	for (const result of latest.data.results) {
		if (!isRecord(result) || typeof result.key !== 'string' || typeof result.ok !== 'boolean') {
			continue;
		}

		if (!result.ok) {
			failedStep = result.key;
			break;
		}
	}

	return {
		ok: typeof latest.data.ok === 'boolean' ? latest.data.ok : failedStep === undefined,
		failedStep,
		completedAt: latest.data.completedAt
	};
}
