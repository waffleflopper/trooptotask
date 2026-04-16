import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import type { SliceIssue } from './types.js';

interface GhIssueLabel {
	name?: string;
}

interface GhIssueResponse {
	number: number;
	title: string;
	state: string;
	url: string;
	body?: string;
	labels?: GhIssueLabel[];
}

function describeCommand(args: string[]): string {
	return `gh ${args.map((arg) => JSON.stringify(arg)).join(' ')}`;
}

function buildErrorMessage(stdout: string, stderr: string, fallback: string): string {
	const message = [stderr.trim(), stdout.trim()].find(Boolean);
	return message || fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function parseIssueResponse(value: unknown): SliceIssue {
	if (
		!isRecord(value) ||
		typeof value.number !== 'number' ||
		typeof value.title !== 'string' ||
		typeof value.state !== 'string' ||
		typeof value.url !== 'string'
	) {
		throw new Error('Unexpected GitHub issue payload.');
	}

	const labels = Array.isArray(value.labels)
		? value.labels
				.filter((label): label is GhIssueLabel => isRecord(label))
				.map((label) => (typeof label.name === 'string' ? label.name.trim() : ''))
				.filter(Boolean)
		: [];

	return {
		number: value.number,
		title: value.title,
		state: value.state,
		url: value.url,
		labels,
		body: typeof value.body === 'string' ? value.body : ''
	};
}

async function runGhJson<T>(pi: ExtensionAPI, args: string[], signal?: AbortSignal): Promise<T> {
	const execution = await pi.exec('gh', args, { signal });
	const exitCode = execution.code ?? (execution.killed ? 1 : 0);
	if (exitCode !== 0) {
		throw new Error(buildErrorMessage(execution.stdout, execution.stderr, `Failed: ${describeCommand(args)}`));
	}

	try {
		return JSON.parse(execution.stdout) as T;
	} catch (error) {
		throw new Error(
			error instanceof Error
				? `Invalid JSON from ${describeCommand(args)}: ${error.message}`
				: `Invalid JSON from ${describeCommand(args)}`
		);
	}
}

export async function resolveCurrentRepo(pi: ExtensionAPI, signal?: AbortSignal): Promise<string> {
	const response = await runGhJson<{ nameWithOwner?: string }>(pi, ['repo', 'view', '--json', 'nameWithOwner'], signal);

	if (!response.nameWithOwner?.trim()) {
		throw new Error('Unable to determine the current GitHub repository.');
	}

	return response.nameWithOwner.trim();
}

export async function fetchIssue(
	pi: ExtensionAPI,
	repo: string,
	number: number,
	signal?: AbortSignal
): Promise<SliceIssue> {
	const response = await runGhJson<GhIssueResponse>(
		pi,
		['issue', 'view', String(number), '--repo', repo, '--json', 'number,title,state,url,labels,body'],
		signal
	);

	return parseIssueResponse(response);
}

export async function fetchIssues(
	pi: ExtensionAPI,
	repo: string,
	numbers: number[],
	signal?: AbortSignal
): Promise<SliceIssue[]> {
	const issues: SliceIssue[] = [];
	for (const number of numbers) {
		issues.push(await fetchIssue(pi, repo, number, signal));
	}

	return issues;
}
