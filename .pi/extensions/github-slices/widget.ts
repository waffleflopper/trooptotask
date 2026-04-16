import { truncateToWidth } from '@mariozechner/pi-tui';
import type { SliceIssue, SliceWidgetModel } from './types.js';

function buildWindow(issues: SliceIssue[], activeIssueNumber: number | undefined, windowSize: number): SliceIssue[] {
	if (issues.length <= windowSize) {
		return issues;
	}

	const activeIndex = issues.findIndex((issue) => issue.number === activeIssueNumber);
	if (activeIndex === -1) {
		return issues.slice(0, windowSize);
	}

	const beforeCount = Math.floor((windowSize - 1) / 2);
	const afterCount = windowSize - beforeCount - 1;
	let start = Math.max(0, activeIndex - beforeCount);
	let end = Math.min(issues.length, activeIndex + afterCount + 1);

	const deficit = windowSize - (end - start);
	if (deficit > 0) {
		start = Math.max(0, start - deficit);
		end = Math.min(issues.length, start + windowSize);
	}

	return issues.slice(start, end);
}

function summarizeWorkflow(model: SliceWidgetModel): string | undefined {
	if (!model.activeWorkflow) {
		return undefined;
	}

	return `workflow:${model.activeWorkflow}`;
}

function summarizeVerify(model: SliceWidgetModel): string | undefined {
	if (!model.latestVerify) {
		return undefined;
	}

	if (model.latestVerify.ok) {
		return 'checks passed';
	}

	return model.latestVerify.failedStep ? `checks failed:${model.latestVerify.failedStep}` : 'checks failed';
}

function buildIssueBadge(model: SliceWidgetModel, issue: SliceIssue): string | undefined {
	if (issue.number !== model.activeIssueNumber) {
		return undefined;
	}

	if (model.latestVerify?.ok) {
		return 'verify passed';
	}

	if (model.latestVerify?.failedStep) {
		return `verify failed:${model.latestVerify.failedStep}`;
	}

	if (model.activeWorkflow) {
		return model.activeWorkflow;
	}

	return undefined;
}

export function createSlicesWidget(model: SliceWidgetModel) {
	return (_tui: unknown, theme: { fg: (color: string, text: string) => string }) => ({
		invalidate() {},
		render(width: number): string[] {
			if (!model.config) {
				return [];
			}

			const lines: string[] = [];
			const parts = [theme.fg('muted', 'SLICES'), theme.fg('dim', `// ${model.issues.length} loaded`)];
			if (model.activeIssueNumber) {
				parts.push(theme.fg('accent', `active #${model.activeIssueNumber}`));
			}
			const workflow = summarizeWorkflow(model);
			if (workflow) {
				parts.push(theme.fg('dim', workflow));
			}
			const verify = summarizeVerify(model);
			if (verify) {
				parts.push(model.latestVerify?.ok ? theme.fg('success', verify) : theme.fg('warning', verify));
			}
			lines.push(truncateToWidth(parts.join(' '), width));

			if (model.metadataError) {
				lines.push(truncateToWidth(theme.fg('warning', model.metadataError), width));
				return lines;
			}

			if (model.issues.length === 0) {
				lines.push(truncateToWidth(theme.fg('dim', 'Use /slice-set 568-581 to load a slice run.'), width));
				return lines;
			}

			const visibleIssues = buildWindow(model.issues, model.activeIssueNumber, model.config.widget.windowSize);
			const firstVisibleIndex = model.issues.findIndex((issue) => issue.number === visibleIssues[0]?.number);
			const hiddenAbove = Math.max(0, firstVisibleIndex);
			const hiddenBelow = Math.max(0, model.issues.length - firstVisibleIndex - visibleIssues.length);
			if (hiddenAbove > 0) {
				lines.push(truncateToWidth(theme.fg('dim', `  ↑ ${hiddenAbove} earlier`), width));
			}

			for (const issue of visibleIssues) {
				const isActive = issue.number === model.activeIssueNumber;
				const marker = isActive ? theme.fg('accent', '▶') : theme.fg('dim', ' ');
				const number = isActive ? theme.fg('accent', `#${issue.number}`) : theme.fg('muted', `#${issue.number}`);
				const state = issue.state === 'CLOSED' ? theme.fg('success', 'closed') : theme.fg('dim', 'open');
				const badge = buildIssueBadge(model, issue);
				const badgeText = badge
					? `${theme.fg('dim', '·')} ${badge.startsWith('verify failed') ? theme.fg('warning', badge) : badge.startsWith('verify passed') ? theme.fg('success', badge) : theme.fg('accent', badge)}`
					: '';
				const row = `${marker} ${number} ${issue.title} ${theme.fg('dim', '·')} ${state}${badgeText}`;
				lines.push(truncateToWidth(row, width));
			}

			if (hiddenBelow > 0) {
				lines.push(truncateToWidth(theme.fg('dim', `  ↓ ${hiddenBelow} later`), width));
			}

			lines.push(truncateToWidth(theme.fg('dim', '/slices pick · /slice-next · /slice-refresh'), width));
			return lines;
		}
	});
}
