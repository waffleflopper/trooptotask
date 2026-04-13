import { Type } from '@sinclair/typebox';
import { StringEnum } from '@mariozechner/pi-ai';
import type { ExtensionAPI, ExtensionContext } from '@mariozechner/pi-coding-agent';
import { truncateTail } from '@mariozechner/pi-coding-agent';
import { Text } from '@mariozechner/pi-tui';

type GithubAction =
	| 'auth_status'
	| 'repo_view'
	| 'issue_list'
	| 'issue_view'
	| 'issue_comment'
	| 'issue_create'
	| 'pr_list'
	| 'pr_view'
	| 'pr_comment'
	| 'pr_checks'
	| 'pr_create';

interface GithubCommandPlan {
	args: string[];
	summary: string;
	mutation: boolean;
}

interface GithubResultDetails {
	action: GithubAction;
	command: string;
	summary: string;
	repo?: string;
	exitCode: number;
	mutation: boolean;
	stdout: string;
	stderr: string;
}

const GITHUB_ACTIONS = [
	'auth_status',
	'repo_view',
	'issue_list',
	'issue_view',
	'issue_comment',
	'issue_create',
	'pr_list',
	'pr_view',
	'pr_comment',
	'pr_checks',
	'pr_create'
] as const;

const GITHUB_ACTION_LABELS: Record<GithubAction, string> = {
	auth_status: 'auth status',
	repo_view: 'repo view',
	issue_list: 'issue list',
	issue_view: 'issue view',
	issue_comment: 'issue comment',
	issue_create: 'issue create',
	pr_list: 'pr list',
	pr_view: 'pr view',
	pr_comment: 'pr comment',
	pr_checks: 'pr checks',
	pr_create: 'pr create'
};

const GITHUB_MUTATIONS = new Set<GithubAction>(['issue_comment', 'issue_create', 'pr_comment', 'pr_create']);

function pushRepoFlag(args: string[], repo: string | undefined) {
	if (repo?.trim()) {
		args.push('--repo', repo.trim());
	}
}

function quoted(value: string): string {
	return JSON.stringify(value);
}

function requireString(value: string | undefined, label: string): string {
	const trimmed = value?.trim();
	if (!trimmed) {
		throw new Error(`Missing required parameter: ${label}`);
	}
	return trimmed;
}

function requireNumber(value: number | undefined, label: string): number {
	if (typeof value !== 'number' || Number.isNaN(value)) {
		throw new Error(`Missing required parameter: ${label}`);
	}
	return value;
}

function joinList(values: string[] | undefined): string | undefined {
	const cleaned = (values ?? []).map((value) => value.trim()).filter(Boolean);
	return cleaned.length > 0 ? cleaned.join(',') : undefined;
}

function summarizeRepo(repo: string | undefined): string {
	return repo?.trim() ? ` in ${repo.trim()}` : '';
}

function validateState(action: GithubAction, state: string | undefined): string | undefined {
	if (!state) {
		return undefined;
	}

	if (action === 'pr_list') {
		if (state === 'open' || state === 'closed' || state === 'merged' || state === 'all') {
			return state;
		}
		throw new Error('pr_list state must be one of: open, closed, merged, all');
	}

	if (action === 'issue_list') {
		if (state === 'open' || state === 'closed' || state === 'all') {
			return state;
		}
		throw new Error('issue_list state must be one of: open, closed, all');
	}

	return state;
}

function buildGithubCommand(params: {
	action: GithubAction;
	repo?: string;
	number?: number;
	limit?: number;
	state?: string;
	search?: string;
	title?: string;
	body?: string;
	base?: string;
	head?: string;
	labels?: string[];
	assignees?: string[];
	draft?: boolean;
}): GithubCommandPlan {
	const action = params.action;
	const repo = params.repo?.trim();

	switch (action) {
		case 'auth_status': {
			return {
				args: ['auth', 'status'],
				summary: 'Check GitHub CLI authentication status',
				mutation: false
			};
		}

		case 'repo_view': {
			const args = ['repo', 'view'];
			pushRepoFlag(args, repo);
			args.push('--json', 'name,nameWithOwner,description,url,defaultBranchRef,isPrivate,viewerPermission');
			return {
				args,
				summary: `View repository details${summarizeRepo(repo) || ' for the current repository'}`,
				mutation: false
			};
		}

		case 'issue_list': {
			const limit = params.limit ?? 20;
			const state = validateState(action, params.state);
			const args = ['issue', 'list', '--limit', String(limit)];
			pushRepoFlag(args, repo);
			if (state) {
				args.push('--state', state);
			}
			if (params.search?.trim()) {
				args.push('--search', params.search.trim());
			}
			args.push('--json', 'number,title,state,author,labels,updatedAt,url');
			return {
				args,
				summary: `List issues${summarizeRepo(repo) || ' for the current repository'}`,
				mutation: false
			};
		}

		case 'issue_view': {
			const number = requireNumber(params.number, 'number');
			const args = ['issue', 'view', String(number)];
			pushRepoFlag(args, repo);
			args.push('--json', 'number,title,state,author,body,labels,assignees,updatedAt,url');
			return {
				args,
				summary: `View issue #${number}${summarizeRepo(repo)}`,
				mutation: false
			};
		}

		case 'issue_comment': {
			const number = requireNumber(params.number, 'number');
			const body = requireString(params.body, 'body');
			const args = ['issue', 'comment', String(number), '--body', body];
			pushRepoFlag(args, repo);
			return {
				args,
				summary: `Comment on issue #${number}${summarizeRepo(repo)}`,
				mutation: true
			};
		}

		case 'issue_create': {
			const title = requireString(params.title, 'title');
			const body = requireString(params.body, 'body');
			const args = ['issue', 'create', '--title', title, '--body', body];
			const labels = joinList(params.labels);
			const assignees = joinList(params.assignees);
			pushRepoFlag(args, repo);
			if (labels) {
				args.push('--label', labels);
			}
			if (assignees) {
				args.push('--assignee', assignees);
			}
			return {
				args,
				summary: `Create issue${summarizeRepo(repo) || ' in the current repository'}: ${title}`,
				mutation: true
			};
		}

		case 'pr_list': {
			const limit = params.limit ?? 20;
			const state = validateState(action, params.state);
			const args = ['pr', 'list', '--limit', String(limit)];
			pushRepoFlag(args, repo);
			if (state) {
				args.push('--state', state);
			}
			if (params.search?.trim()) {
				args.push('--search', params.search.trim());
			}
			args.push('--json', 'number,title,state,isDraft,author,headRefName,baseRefName,updatedAt,url');
			return {
				args,
				summary: `List pull requests${summarizeRepo(repo) || ' for the current repository'}`,
				mutation: false
			};
		}

		case 'pr_view': {
			const number = requireNumber(params.number, 'number');
			const args = ['pr', 'view', String(number)];
			pushRepoFlag(args, repo);
			args.push(
				'--json',
				'number,title,state,isDraft,author,body,baseRefName,headRefName,reviewDecision,mergeStateStatus,updatedAt,url,files'
			);
			return {
				args,
				summary: `View pull request #${number}${summarizeRepo(repo)}`,
				mutation: false
			};
		}

		case 'pr_comment': {
			const number = requireNumber(params.number, 'number');
			const body = requireString(params.body, 'body');
			const args = ['pr', 'comment', String(number), '--body', body];
			pushRepoFlag(args, repo);
			return {
				args,
				summary: `Comment on pull request #${number}${summarizeRepo(repo)}`,
				mutation: true
			};
		}

		case 'pr_checks': {
			const number = requireNumber(params.number, 'number');
			const args = ['pr', 'checks', String(number)];
			pushRepoFlag(args, repo);
			return {
				args,
				summary: `Check CI status for pull request #${number}${summarizeRepo(repo)}`,
				mutation: false
			};
		}

		case 'pr_create': {
			const title = requireString(params.title, 'title');
			const body = requireString(params.body, 'body');
			const args = ['pr', 'create', '--title', title, '--body', body];
			pushRepoFlag(args, repo);
			if (params.base?.trim()) {
				args.push('--base', params.base.trim());
			}
			if (params.head?.trim()) {
				args.push('--head', params.head.trim());
			}
			if (params.draft) {
				args.push('--draft');
			}
			return {
				args,
				summary: `Create pull request${summarizeRepo(repo) || ' in the current repository'}: ${title}`,
				mutation: true
			};
		}
	}

	throw new Error(`Unsupported GitHub action: ${action}`);
}

function renderMutationPreview(
	action: GithubAction,
	params: { repo?: string; number?: number; title?: string; body?: string }
) {
	const lines = [`Action: ${GITHUB_ACTION_LABELS[action]}`];

	if (params.repo?.trim()) {
		lines.push(`Repo: ${params.repo.trim()}`);
	}

	if (typeof params.number === 'number') {
		lines.push(`Number: #${params.number}`);
	}

	if (params.title?.trim()) {
		lines.push(`Title: ${params.title.trim()}`);
	}

	if (params.body?.trim()) {
		lines.push('', params.body.trim().length > 500 ? `${params.body.trim().slice(0, 500)}…` : params.body.trim());
	}

	return lines.join('\n');
}

async function confirmMutation(
	action: GithubAction,
	params: { repo?: string; number?: number; title?: string; body?: string },
	ctx: ExtensionContext
): Promise<boolean> {
	if (!ctx.hasUI) {
		return false;
	}

	return ctx.ui.confirm('Allow GitHub write operation?', renderMutationPreview(action, params));
}

function trimOutput(text: string): string {
	if (!text.trim()) {
		return '';
	}

	return truncateTail(text.trim(), { maxLines: 120, maxBytes: 24_000 }).content;
}

function parseGithubDetails(value: unknown): GithubResultDetails | undefined {
	if (typeof value !== 'object' || value === null) {
		return undefined;
	}

	const record = value as Record<string, unknown>;
	if (
		typeof record.action !== 'string' ||
		!GITHUB_ACTIONS.includes(record.action as GithubAction) ||
		typeof record.command !== 'string' ||
		typeof record.summary !== 'string' ||
		typeof record.exitCode !== 'number' ||
		typeof record.mutation !== 'boolean' ||
		typeof record.stdout !== 'string' ||
		typeof record.stderr !== 'string'
	) {
		return undefined;
	}

	return {
		action: record.action as GithubAction,
		command: record.command,
		summary: record.summary,
		repo: typeof record.repo === 'string' ? record.repo : undefined,
		exitCode: record.exitCode,
		mutation: record.mutation,
		stdout: record.stdout,
		stderr: record.stderr
	};
}

function buildResultText(details: GithubResultDetails): string {
	const stdout = trimOutput(details.stdout);
	const stderr = trimOutput(details.stderr);
	const lines = [details.summary, '', `$ gh ${details.command}`];

	if (stdout) {
		lines.push('', stdout);
	}

	if (stderr) {
		lines.push('', 'stderr:', stderr);
	}

	if (!stdout && !stderr) {
		lines.push('', details.exitCode === 0 ? 'Command completed with no output.' : 'Command failed with no output.');
	}

	return lines.join('\n');
}

export default function githubCliExtension(pi: ExtensionAPI) {
	pi.registerTool({
		name: 'github',
		label: 'GitHub',
		description: 'Use the GitHub CLI for common repository, issue, and pull request operations.',
		promptSnippet:
			'Inspect GitHub auth, repos, issues, and pull requests via the gh CLI, with confirmation for write actions.',
		promptGuidelines: [
			'Use this tool instead of raw bash when the user asks for GitHub issue, pull request, or repository operations.',
			'Prefer read-only GitHub actions first, and confirm write actions only when you have the exact content ready.',
			'If a write action is requested, gather the final title/body/details before calling the tool so the confirmation dialog is precise.'
		],
		parameters: Type.Object({
			action: StringEnum(GITHUB_ACTIONS),
			repo: Type.Optional(
				Type.String({ description: 'Optional owner/repo override. Defaults to the current git remote repo.' })
			),
			number: Type.Optional(
				Type.Number({ description: 'Issue or pull request number for view/comment/check actions.' })
			),
			limit: Type.Optional(Type.Number({ description: 'Maximum number of issues or pull requests to list.' })),
			state: Type.Optional(
				StringEnum(['open', 'closed', 'merged', 'all'] as const, {
					description:
						'State filter for list actions. issue_list supports open|closed|all. pr_list supports open|closed|merged|all.'
				})
			),
			search: Type.Optional(Type.String({ description: 'Optional search query for issue_list or pr_list.' })),
			title: Type.Optional(Type.String({ description: 'Title for issue_create or pr_create.' })),
			body: Type.Optional(Type.String({ description: 'Body text for create/comment actions.' })),
			base: Type.Optional(Type.String({ description: 'Base branch for pr_create.' })),
			head: Type.Optional(Type.String({ description: 'Head branch for pr_create.' })),
			labels: Type.Optional(Type.Array(Type.String({ description: 'Label name.' }))),
			assignees: Type.Optional(Type.Array(Type.String({ description: 'GitHub username.' }))),
			draft: Type.Optional(Type.Boolean({ description: 'Create the pull request as a draft.' }))
		}),
		async execute(_toolCallId, params, signal, onUpdate, ctx) {
			try {
				const plan = buildGithubCommand(params);
				if (plan.mutation) {
					const confirmed = await confirmMutation(params.action, params, ctx);
					if (!confirmed) {
						return {
							content: [{ type: 'text', text: 'GitHub write operation cancelled.' }],
							details: {
								action: params.action,
								command: plan.args.map(quoted).join(' '),
								summary: plan.summary,
								repo: params.repo,
								exitCode: 1,
								mutation: true,
								stdout: '',
								stderr: ctx.hasUI
									? 'Cancelled by user.'
									: 'GitHub write operations require interactive confirmation in pi.'
							},
							isError: true
						};
					}
				}

				onUpdate?.({
					content: [{ type: 'text', text: `Running gh ${plan.args.map(quoted).join(' ')}` }],
					details: { step: 'running' }
				});

				const execution = await pi.exec('gh', plan.args, { signal });
				const exitCode = execution.code ?? (execution.killed ? 1 : 0);
				const details: GithubResultDetails = {
					action: params.action,
					command: plan.args.map(quoted).join(' '),
					summary: plan.summary,
					repo: params.repo?.trim() || undefined,
					exitCode,
					mutation: plan.mutation,
					stdout: execution.stdout,
					stderr: execution.stderr
				};

				return {
					content: [{ type: 'text', text: buildResultText(details) }],
					details,
					isError: exitCode !== 0
				};
			} catch (error) {
				const message = error instanceof Error ? error.message : 'Unknown GitHub tool error';
				const details: GithubResultDetails = {
					action: params.action,
					command: '',
					summary: `Unable to prepare ${GITHUB_ACTION_LABELS[params.action]}`,
					repo: params.repo?.trim() || undefined,
					exitCode: 1,
					mutation: GITHUB_MUTATIONS.has(params.action),
					stdout: '',
					stderr: message
				};
				return {
					content: [{ type: 'text', text: buildResultText(details) }],
					details,
					isError: true
				};
			}
		},
		renderCall(args, theme) {
			const repo = typeof args.repo === 'string' && args.repo.trim() ? ` ${args.repo.trim()}` : '';
			const target = typeof args.number === 'number' ? theme.fg('accent', ` #${args.number}`) : '';
			const mutation = GITHUB_MUTATIONS.has(args.action as GithubAction) ? theme.fg('warning', ' write') : '';
			return new Text(
				theme.fg('toolTitle', theme.bold('github ')) +
					theme.fg('accent', String(args.action)) +
					target +
					theme.fg('dim', repo) +
					mutation,
				0,
				0
			);
		},
		renderResult(result, { expanded }, theme) {
			const details = parseGithubDetails(result.details);
			if (!details) {
				const text = result.content[0];
				return new Text(text?.type === 'text' ? text.text : 'GitHub operation complete', 0, 0);
			}

			const header =
				details.exitCode === 0
					? theme.fg('success', `✓ ${details.summary}`)
					: theme.fg('error', `✗ ${details.summary}`);
			const command = theme.fg('dim', `$ gh ${details.command}`);
			if (!expanded) {
				return new Text(`${header}\n${command}`, 0, 0);
			}

			const stdout = trimOutput(details.stdout);
			const stderr = trimOutput(details.stderr);
			const lines = [header, command];
			if (stdout) {
				lines.push('', stdout);
			}
			if (stderr) {
				lines.push('', theme.fg('warning', 'stderr:'), theme.fg('dim', stderr));
			}
			return new Text(lines.join('\n'), 0, 0);
		}
	});
}
