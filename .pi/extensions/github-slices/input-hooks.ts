import type { WorkflowMode } from './types.js';

const ISSUE_URL_PATTERN = /\/issues\/(\d+)(?:$|[/?#])/i;
const ISSUE_NUMBER_PATTERN = /(?:^|\s)#?(\d+)(?:\s|$)/;

export interface WorkflowDetectionResult {
	workflow: WorkflowMode;
	issueNumber?: number;
}

function parseIssueReference(text: string): number | undefined {
	const urlMatch = text.match(ISSUE_URL_PATTERN);
	if (urlMatch) {
		return Number.parseInt(urlMatch[1], 10);
	}

	const numberMatch = text.match(ISSUE_NUMBER_PATTERN);
	if (numberMatch) {
		return Number.parseInt(numberMatch[1], 10);
	}

	return undefined;
}

export function detectWorkflowFromInput(text: string): WorkflowDetectionResult | undefined {
	const trimmed = text.trim();
	if (!trimmed) {
		return undefined;
	}

	if (trimmed.startsWith('/skill:verify-work') || trimmed.startsWith('verify-work ')) {
		return {
			workflow: 'verify-work',
			issueNumber: parseIssueReference(trimmed)
		};
	}

	if (trimmed.startsWith('/skill:tdd') || trimmed.startsWith('tdd ') || trimmed === 'tdd') {
		return {
			workflow: 'tdd',
			issueNumber: parseIssueReference(trimmed)
		};
	}

	return undefined;
}

export function parseIssueNumberWithRest(value: string | undefined): { issueNumber: number; rest: string } {
	const trimmed = value?.trim() ?? '';
	if (!trimmed) {
		throw new Error('Missing issue number.');
	}

	const [firstToken, ...restTokens] = trimmed.split(/\s+/);
	if (!/^\d+$/.test(firstToken)) {
		throw new Error(`Invalid issue number: ${firstToken}`);
	}

	return {
		issueNumber: Number.parseInt(firstToken, 10),
		rest: restTokens.join(' ').trim()
	};
}
