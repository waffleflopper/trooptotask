import { access, readFile } from 'node:fs/promises';
import { constants as fsConstants, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import type { ExecResult, ExtensionAPI, ExtensionCommandContext } from '@mariozechner/pi-coding-agent';

const STATUS_ID = 'implement-slice';
const MAX_REVIEW_FIX_ATTEMPTS = 3;
const MAX_VERIFY_FIX_ATTEMPTS = 5;
const VERIFY_TIMEOUT_MS = 60 * 60 * 1000;
const PR_FEEDBACK_TIMEOUT_MS = 30 * 60 * 1000;
const PR_FEEDBACK_POLL_INTERVAL_MS = 60 * 1000;
const CLAUDE_REVIEW_COMMENT = '@claude please review';

export default function implementSliceExtension(pi: ExtensionAPI) {
	pi.on('resources_discover', async (event) => {
		const projectRoot = findProjectRoot(event.cwd);
		if (!projectRoot) return;

		const skillPath = join(projectRoot, 'v2', 'agent-skills');
		if (!(await pathExists(skillPath))) return;

		return {
			skillPaths: [skillPath]
		};
	});

	pi.registerCommand('implement-slice', {
		description:
			'Run implementation, pnpm verify, slice audit, architecture review, PR handoff, and PR feedback triage',
		handler: async (args, ctx) => {
			const issueNumber = args.trim();
			if (!issueNumber) {
				ctx.ui.notify('Usage: /implement-slice <github-issue-number>', 'warning');
				return;
			}

			if (!/^\d+$/.test(issueNumber)) {
				ctx.ui.notify('Issue number must be numeric, e.g. /implement-slice 123', 'warning');
				return;
			}

			if (!ctx.isIdle() || ctx.hasPendingMessages()) {
				ctx.ui.notify('Run /implement-slice when the agent is idle and no messages are queued.', 'warning');
				return;
			}

			const projectRoot = findProjectRoot(ctx.cwd);
			if (!projectRoot) {
				ctx.ui.notify('Could not find the project root containing .pi/prompt.md', 'error');
				return;
			}

			const promptPath = join(projectRoot, '.pi', 'prompt.md');
			const promptTemplate = await readTextFile(promptPath);
			if (!promptTemplate) {
				ctx.ui.notify(`Could not read prompt template: ${promptPath}`, 'error');
				return;
			}

			const requiredSkills = [
				'skill:trooptotask-v2-issue',
				'skill:trooptotask-v2-authz',
				'skill:trooptotask-v2-migration',
				'skill:trooptotask-v2-slice-audit',
				'skill:trooptotask-v2-architecture-review',
				'skill:gh-pr-findings'
			];
			const availableCommands = new Set(pi.getCommands().map((command) => command.name));
			const missingSkills = requiredSkills.filter((command) => !availableCommands.has(command));
			if (missingSkills.length > 0) {
				ctx.ui.notify(
					`Missing skill commands: ${missingSkills.map((name) => `/${name}`).join(', ')}. Run /reload after installing this extension.`,
					'error'
				);
				return;
			}

			const implementationPrompt = replaceTemplateArgs(promptTemplate, [issueNumber]);
			const prTemplatePath = findPrTemplatePath(projectRoot);

			ctx.ui.setStatus(STATUS_ID, `Implementing slice #${issueNumber}`);

			try {
				await runStage(ctx, pi, `issue #${issueNumber} implementation`, implementationPrompt);

				const initialVerifyPassed = await runVerifyLoop({
					ctx,
					pi,
					projectRoot,
					stageLabel: 'pnpm verify after implementation'
				});
				if (!initialVerifyPassed) return;

				const auditPassed = await reviewAndFixLoop({
					ctx,
					pi,
					projectRoot,
					stageLabel: 'slice audit',
					skillCommand: '/skill:trooptotask-v2-slice-audit',
					hasFindings: hasSliceAuditFindings,
					fixPrompt: [
						`Your immediately previous response was a slice audit for issue #${issueNumber}.`,
						'Fix every finding that is actually in scope for this slice now.',
						'After fixing, rerun the relevant verification commands and summarize what changed.',
						'If something truly cannot be fixed without HITL or rescoping, stop and explain exactly why instead of papering over it.'
					].join('\n')
				});
				if (!auditPassed) {
					ctx.ui.notify(
						`Stopped after ${MAX_REVIEW_FIX_ATTEMPTS} slice-audit fix attempt(s). Not continuing to PR until the review is fully clean.`,
						'warning'
					);
					return;
				}

				const architecturePassed = await reviewAndFixLoop({
					ctx,
					pi,
					projectRoot,
					stageLabel: 'architecture review',
					skillCommand: '/skill:trooptotask-v2-architecture-review',
					hasFindings: hasArchitectureReviewFindings,
					fixPrompt: [
						`Your immediately previous response was an architecture review for issue #${issueNumber}.`,
						'Fix every finding that is actually in scope now.',
						'Then rerun the relevant verification commands and summarize exactly which findings were resolved.',
						'If any finding still needs HITL or must be deferred, stop and explain the blocker clearly.'
					].join('\n')
				});
				if (!architecturePassed) {
					ctx.ui.notify(
						`Stopped after ${MAX_REVIEW_FIX_ATTEMPTS} architecture-review fix attempt(s). Not continuing to PR until the review is fully clean.`,
						'warning'
					);
					return;
				}

				const finalVerifyPassed = await runVerifyLoop({
					ctx,
					pi,
					projectRoot,
					stageLabel: 'final pnpm verify before PR'
				});
				if (!finalVerifyPassed) return;

				ctx.ui.setStatus(STATUS_ID, `Committing and opening PR for #${issueNumber}`);
				await runStage(ctx, pi, 'commit, push, and PR handoff', buildPrPrompt(issueNumber, prTemplatePath));

				const prDetails = await ensureReadyPr(ctx, pi, projectRoot, issueNumber);
				if (!prDetails) return;

				await commentForClaudeReview(ctx, pi, projectRoot, prDetails.number);

				const prFeedback = await waitForPrFeedback(ctx, pi, projectRoot, prDetails);
				await runStage(ctx, pi, 'PR findings triage', buildGhPrFindingsPrompt(prDetails.url, prFeedback));

				ctx.ui.notify(`Completed /implement-slice workflow for issue #${issueNumber}`, 'info');
			} finally {
				ctx.ui.setStatus(STATUS_ID, undefined);
			}
		}
	});
}

function findProjectRoot(startDir: string): string | undefined {
	let currentDir = resolve(startDir);

	while (true) {
		if (existsSync(join(currentDir, '.pi', 'prompt.md'))) {
			return currentDir;
		}

		const parentDir = dirname(currentDir);
		if (parentDir === currentDir) {
			return undefined;
		}

		currentDir = parentDir;
	}
}

async function pathExists(path: string): Promise<boolean> {
	try {
		await access(path, fsConstants.F_OK);
		return true;
	} catch {
		return false;
	}
}

async function readTextFile(path: string): Promise<string | undefined> {
	try {
		return await readFile(path, 'utf8');
	} catch {
		return undefined;
	}
}

function replaceTemplateArgs(template: string, args: string[]): string {
	return template.replace(/\{arg\((\d+)\)\}/g, (_match, rawIndex) => {
		const index = Number(rawIndex) - 1;
		return args[index] ?? '';
	});
}

async function runStage(
	ctx: ExtensionCommandContext,
	pi: ExtensionAPI,
	stageLabel: string,
	prompt: string
): Promise<void> {
	ctx.ui.notify(`Starting ${stageLabel}`, 'info');
	pi.sendUserMessage(prompt);
	await ctx.waitForIdle();
}

type VerifyLoopOptions = {
	ctx: ExtensionCommandContext;
	pi: ExtensionAPI;
	projectRoot: string;
	stageLabel: string;
};

async function runVerifyLoop(options: VerifyLoopOptions): Promise<boolean> {
	const { ctx, pi, projectRoot, stageLabel } = options;

	for (let attempt = 1; attempt <= MAX_VERIFY_FIX_ATTEMPTS; attempt += 1) {
		ctx.ui.setStatus(STATUS_ID, `${toTitleCase(stageLabel)} attempt ${attempt}`);
		ctx.ui.notify(`Running pnpm verify (${stageLabel}, attempt ${attempt})`, 'info');

		const verifyResult = await pi.exec('pnpm', ['verify'], {
			cwd: projectRoot,
			timeout: VERIFY_TIMEOUT_MS
		});

		if (verifyResult.code === 0) {
			ctx.ui.notify('pnpm verify passed cleanly', 'info');
			return true;
		}

		if (attempt === MAX_VERIFY_FIX_ATTEMPTS) {
			ctx.ui.notify(
				`pnpm verify is still failing after ${MAX_VERIFY_FIX_ATTEMPTS} fix attempt(s). Not continuing to PR.`,
				'warning'
			);
			return false;
		}

		await runStage(ctx, pi, `${stageLabel} fixes (attempt ${attempt})`, buildVerifyFixPrompt(verifyResult));
	}

	return false;
}

type ReviewLoopOptions = {
	ctx: ExtensionCommandContext;
	pi: ExtensionAPI;
	projectRoot: string;
	stageLabel: string;
	skillCommand: string;
	hasFindings: (responseText: string) => boolean;
	fixPrompt: string;
};

async function reviewAndFixLoop(options: ReviewLoopOptions): Promise<boolean> {
	const { ctx, pi, projectRoot, stageLabel, skillCommand, hasFindings, fixPrompt } = options;

	for (let attempt = 1; attempt <= MAX_REVIEW_FIX_ATTEMPTS; attempt += 1) {
		ctx.ui.setStatus(STATUS_ID, `${toTitleCase(stageLabel)} attempt ${attempt}`);
		await runStage(ctx, pi, `${stageLabel} (attempt ${attempt})`, skillCommand);

		const latestAssistantText = getLastAssistantText(ctx);
		if (!hasFindings(latestAssistantText)) {
			return true;
		}

		if (attempt === MAX_REVIEW_FIX_ATTEMPTS) {
			return false;
		}

		await runStage(ctx, pi, `${stageLabel} fixes (attempt ${attempt})`, fixPrompt);
		const verifyPassed = await runVerifyLoop({
			ctx,
			pi,
			projectRoot,
			stageLabel: `pnpm verify after ${stageLabel} fixes`
		});
		if (!verifyPassed) {
			return false;
		}
	}

	return false;
}

function getLastAssistantText(ctx: ExtensionCommandContext): string {
	const sessionContextBuilder = ctx.sessionManager as unknown as {
		buildSessionContext: () => { messages?: Array<{ role?: string; content?: unknown }> };
	};
	const sessionContext = sessionContextBuilder.buildSessionContext();
	const messages = sessionContext.messages ?? [];

	for (let index = messages.length - 1; index >= 0; index -= 1) {
		const message = messages[index];
		if (message?.role !== 'assistant') continue;
		return textFromContent(message.content);
	}

	return '';
}

function textFromContent(content: unknown): string {
	if (typeof content === 'string') return content;
	if (!Array.isArray(content)) return '';

	return content
		.filter((block): block is { type?: string; text?: string } => Boolean(block) && typeof block === 'object')
		.filter((block) => block.type === 'text' && typeof block.text === 'string')
		.map((block) => block.text ?? '')
		.join('\n');
}

function hasSliceAuditFindings(responseText: string): boolean {
	const normalized = responseText.trim();
	if (!normalized) return true;

	const firstLine = normalized
		.split(/\r?\n/)
		.map((line) => line.trim())
		.find(Boolean);

	const verdictIsComplete = Boolean(firstLine && /^complete\b/i.test(firstLine));
	const hasSeverityMarkers = /\[P[0-3]\]/i.test(normalized);

	return !verdictIsComplete || hasSeverityMarkers;
}

function hasArchitectureReviewFindings(responseText: string): boolean {
	const normalized = responseText.trim();
	if (!normalized) return true;
	return /\[P[0-3]\]/i.test(normalized);
}

function toTitleCase(value: string): string {
	return value
		.split(/\s+/)
		.map((part) => (part ? part[0].toUpperCase() + part.slice(1) : part))
		.join(' ');
}

function findPrTemplatePath(projectRoot: string): string | undefined {
	const candidates = [
		join(projectRoot, '.github', 'PULL_REQUEST_TEMPLATE.md'),
		join(projectRoot, '.github', 'pull_request_template.md'),
		join(projectRoot, 'v2', 'root', '.github', 'PULL_REQUEST_TEMPLATE.md'),
		join(projectRoot, 'v2', 'root', '.github', 'pull_request_template.md')
	];

	return candidates.find((candidate) => existsSync(candidate));
}

function buildVerifyFixPrompt(result: ExecResult): string {
	const output = truncateText(joinCommandOutput(result), 12_000);

	return [
		'`pnpm verify` failed in the repository root.',
		'Fix the issues it reported, then stop. I will rerun `pnpm verify` myself and will not continue until it passes cleanly with no errors.',
		`Exit code: ${result.code}`,
		'',
		'Latest captured output:',
		'```text',
		output,
		'```'
	].join('\n');
}

function joinCommandOutput(result: ExecResult): string {
	const sections = [];
	if (result.stdout.trim()) {
		sections.push(`STDOUT:\n${result.stdout.trimEnd()}`);
	}
	if (result.stderr.trim()) {
		sections.push(`STDERR:\n${result.stderr.trimEnd()}`);
	}
	if (sections.length === 0) {
		sections.push('(no output captured)');
	}
	return sections.join('\n\n');
}

function truncateText(text: string, maxChars: number): string {
	if (text.length <= maxChars) return text;
	return `${text.slice(0, maxChars)}\n\n[truncated ${text.length - maxChars} characters]`;
}

type PullRequestDetails = {
	number: number;
	url: string;
	isDraft: boolean;
	headRefName?: string;
};

async function ensureReadyPr(
	ctx: ExtensionCommandContext,
	pi: ExtensionAPI,
	projectRoot: string,
	issueNumber: string
): Promise<PullRequestDetails | undefined> {
	let prDetails = await getCurrentPrDetails(pi, projectRoot);
	if (!prDetails) {
		await runStage(
			ctx,
			pi,
			'PR recovery',
			[
				`I could not detect an open pull request for issue #${issueNumber}.`,
				'Open the pull request now, make sure it is ready for review and not a draft, then report the PR URL.'
			].join('\n')
		);
		prDetails = await getCurrentPrDetails(pi, projectRoot);
	}

	if (!prDetails) {
		ctx.ui.notify('Could not detect an open pull request for the current branch.', 'error');
		return undefined;
	}

	if (prDetails.isDraft) {
		ctx.ui.notify(`PR #${prDetails.number} was opened as draft. Marking it ready for review.`, 'warning');
		const readyResult = await pi.exec('gh', ['pr', 'ready', String(prDetails.number)], {
			cwd: projectRoot,
			timeout: 60_000
		});
		if (readyResult.code !== 0) {
			ctx.ui.notify(
				`Failed to mark PR #${prDetails.number} ready for review: ${truncateText(joinCommandOutput(readyResult), 1000)}`,
				'error'
			);
			return undefined;
		}

		prDetails = await getCurrentPrDetails(pi, projectRoot);
		if (!prDetails || prDetails.isDraft) {
			ctx.ui.notify(`PR #${prDetails?.number ?? 'unknown'} is still draft. Stopping.`, 'error');
			return undefined;
		}
	}

	return prDetails;
}

async function getCurrentPrDetails(pi: ExtensionAPI, projectRoot: string): Promise<PullRequestDetails | undefined> {
	const result = await pi.exec('gh', ['pr', 'view', '--json', 'number,url,isDraft,headRefName'], {
		cwd: projectRoot,
		timeout: 60_000
	});
	if (result.code !== 0) return undefined;

	try {
		const parsed = JSON.parse(result.stdout) as PullRequestDetails;
		if (typeof parsed.number !== 'number' || typeof parsed.url !== 'string') {
			return undefined;
		}
		return parsed;
	} catch {
		return undefined;
	}
}

async function commentForClaudeReview(
	ctx: ExtensionCommandContext,
	pi: ExtensionAPI,
	projectRoot: string,
	prNumber: number
): Promise<void> {
	ctx.ui.setStatus(STATUS_ID, `Commenting on PR #${prNumber} for Claude review`);
	const commentResult = await pi.exec('gh', ['pr', 'comment', String(prNumber), '--body', CLAUDE_REVIEW_COMMENT], {
		cwd: projectRoot,
		timeout: 60_000
	});

	if (commentResult.code !== 0) {
		ctx.ui.notify(
			`Failed to comment on PR #${prNumber}: ${truncateText(joinCommandOutput(commentResult), 1000)}`,
			'error'
		);
		return;
	}

	ctx.ui.notify(`Requested Claude review on PR #${prNumber}`, 'info');
}

type RepoInfo = {
	owner: string;
	name: string;
	nameWithOwner: string;
};

type PrFeedbackStatus = {
	claudeReviewComplete: boolean;
	codexFeedbackComplete: boolean;
	claudeActors: string[];
	codexActors: string[];
	completedWithinTimeout: boolean;
};

type PullRequestDiscussionSnapshot = {
	comments: Array<{ author: string; body: string }>;
	reviews: Array<{ author: string; body: string; state: string }>;
	threadComments: Array<{ author: string; body: string }>;
};

async function waitForPrFeedback(
	ctx: ExtensionCommandContext,
	pi: ExtensionAPI,
	projectRoot: string,
	prDetails: PullRequestDetails
): Promise<PrFeedbackStatus> {
	const repoInfo = await getRepoInfo(pi, projectRoot);
	if (!repoInfo) {
		ctx.ui.notify(
			'Could not determine GitHub repository info. Running gh-pr-findings without PR polling context.',
			'warning'
		);
		return {
			claudeReviewComplete: false,
			codexFeedbackComplete: false,
			claudeActors: [],
			codexActors: [],
			completedWithinTimeout: false
		};
	}

	const deadline = Date.now() + PR_FEEDBACK_TIMEOUT_MS;
	let latestStatus: PrFeedbackStatus = {
		claudeReviewComplete: false,
		codexFeedbackComplete: false,
		claudeActors: [],
		codexActors: [],
		completedWithinTimeout: false
	};

	while (Date.now() <= deadline) {
		ctx.ui.setStatus(STATUS_ID, `Waiting for Claude/Codex PR feedback on #${prDetails.number}`);
		const snapshot = await getPullRequestDiscussionSnapshot(pi, projectRoot, repoInfo, prDetails.number);
		if (snapshot) {
			latestStatus = derivePrFeedbackStatus(snapshot);
			if (latestStatus.claudeReviewComplete && latestStatus.codexFeedbackComplete) {
				ctx.ui.notify(`Detected Claude and Codex feedback on PR #${prDetails.number}`, 'info');
				return {
					...latestStatus,
					completedWithinTimeout: true
				};
			}
		}

		await sleep(PR_FEEDBACK_POLL_INTERVAL_MS);
	}

	ctx.ui.notify(
		`Timed out waiting for full Claude/Codex PR feedback on #${prDetails.number}. Running gh-pr-findings with the feedback available so far.`,
		'warning'
	);
	return latestStatus;
}

async function getRepoInfo(pi: ExtensionAPI, projectRoot: string): Promise<RepoInfo | undefined> {
	const result = await pi.exec('gh', ['repo', 'view', '--json', 'nameWithOwner'], {
		cwd: projectRoot,
		timeout: 60_000
	});
	if (result.code !== 0) return undefined;

	try {
		const parsed = JSON.parse(result.stdout) as { nameWithOwner?: string };
		if (!parsed.nameWithOwner || !parsed.nameWithOwner.includes('/')) return undefined;
		const [owner, name] = parsed.nameWithOwner.split('/');
		if (!owner || !name) return undefined;
		return { owner, name, nameWithOwner: parsed.nameWithOwner };
	} catch {
		return undefined;
	}
}

async function getPullRequestDiscussionSnapshot(
	pi: ExtensionAPI,
	projectRoot: string,
	repoInfo: RepoInfo,
	prNumber: number
): Promise<PullRequestDiscussionSnapshot | undefined> {
	const query = [
		'query($owner: String!, $name: String!, $number: Int!) {',
		'  repository(owner: $owner, name: $name) {',
		'    pullRequest(number: $number) {',
		'      comments(first: 100) {',
		'        nodes { author { login } body }',
		'      }',
		'      reviews(first: 100) {',
		'        nodes { author { login } body state submittedAt }',
		'      }',
		'      reviewThreads(first: 100) {',
		'        nodes {',
		'          comments(first: 100) {',
		'            nodes { author { login } body }',
		'          }',
		'        }',
		'      }',
		'    }',
		'  }',
		'}'
	].join('\n');

	const result = await pi.exec(
		'gh',
		[
			'api',
			'graphql',
			'-f',
			`query=${query}`,
			'-f',
			`owner=${repoInfo.owner}`,
			'-f',
			`name=${repoInfo.name}`,
			'-F',
			`number=${prNumber}`
		],
		{
			cwd: projectRoot,
			timeout: 60_000
		}
	);
	if (result.code !== 0) return undefined;

	try {
		const parsed = JSON.parse(result.stdout) as {
			data?: {
				repository?: {
					pullRequest?: {
						comments?: { nodes?: Array<{ author?: { login?: string | null } | null; body?: string | null }> };
						reviews?: {
							nodes?: Array<{
								author?: { login?: string | null } | null;
								body?: string | null;
								state?: string | null;
								submittedAt?: string | null;
							}>;
						};
						reviewThreads?: {
							nodes?: Array<{
								comments?: {
									nodes?: Array<{ author?: { login?: string | null } | null; body?: string | null }>;
								};
							}>;
						};
					};
				};
			};
		};

		const pr = parsed.data?.repository?.pullRequest;
		if (!pr) return undefined;

		return {
			comments: (pr.comments?.nodes ?? []).map((node) => ({
				author: node.author?.login ?? 'unknown',
				body: node.body ?? ''
			})),
			reviews: (pr.reviews?.nodes ?? [])
				.filter((node) => Boolean(node.submittedAt))
				.map((node) => ({
					author: node.author?.login ?? 'unknown',
					body: node.body ?? '',
					state: node.state ?? ''
				})),
			threadComments: (pr.reviewThreads?.nodes ?? []).flatMap((thread) =>
				(thread.comments?.nodes ?? []).map((node) => ({
					author: node.author?.login ?? 'unknown',
					body: node.body ?? ''
				}))
			)
		};
	} catch {
		return undefined;
	}
}

function derivePrFeedbackStatus(snapshot: PullRequestDiscussionSnapshot): PrFeedbackStatus {
	const claudeActors = new Set<string>();
	const codexActors = new Set<string>();

	for (const review of snapshot.reviews) {
		if (matchesClaudeActor(review.author)) {
			claudeActors.add(review.author);
		}
		if (matchesCodexActor(review.author)) {
			codexActors.add(review.author);
		}
	}

	for (const comment of [...snapshot.comments, ...snapshot.threadComments]) {
		if (matchesClaudeActor(comment.author)) {
			claudeActors.add(comment.author);
		}
		if (matchesCodexActor(comment.author)) {
			codexActors.add(comment.author);
		}
	}

	return {
		claudeReviewComplete: claudeActors.size > 0,
		codexFeedbackComplete: codexActors.size > 0,
		claudeActors: [...claudeActors].sort(),
		codexActors: [...codexActors].sort(),
		completedWithinTimeout: false
	};
}

function matchesClaudeActor(author: string): boolean {
	return /claude/i.test(author);
}

function matchesCodexActor(author: string): boolean {
	return /(codex|openai)/i.test(author);
}

function buildGhPrFindingsPrompt(prUrl: string, prFeedback: PrFeedbackStatus): string {
	const lines = [`/skill:gh-pr-findings ${prUrl}`];

	if (prFeedback.completedWithinTimeout) {
		lines.push(
			'',
			`Claude feedback detected from: ${prFeedback.claudeActors.join(', ') || 'unknown actor'}.`,
			`Codex feedback detected from: ${prFeedback.codexActors.join(', ') || 'unknown actor'}.`,
			'Focus on the current PR discussion and deduplicate bot findings carefully.'
		);
	} else {
		lines.push(
			'',
			'PR polling timed out before both Claude and Codex feedback were definitively detected.',
			`Claude actors detected so far: ${prFeedback.claudeActors.join(', ') || 'none'}.`,
			`Codex actors detected so far: ${prFeedback.codexActors.join(', ') || 'none'}.`,
			'Run the findings triage anyway using the feedback currently present and note any missing review source in the report.'
		);
	}

	return lines.join('\n');
}

function buildPrPrompt(issueNumber: string, prTemplatePath: string | undefined): string {
	const lines = [
		`The slice audit, architecture review, and final pnpm verify are clean for issue #${issueNumber}.`,
		'Now finish the delivery workflow:',
		'1. make a focused commit for the work',
		'2. push the branch',
		'3. open a pull request',
		'4. make sure the PR is ready for review and NOT opened as a draft',
		'5. report the branch name, commit SHA, and PR URL'
	];

	if (prTemplatePath) {
		lines.push(`Use the PR template at \`${prTemplatePath}\` and fill every relevant section.`);
	} else {
		lines.push('Use the repository PR template if one exists, and explicitly say if none was found.');
	}

	lines.push(
		`Reference issue #${issueNumber} in the PR title/body.`,
		'Include the verification that was run, any skipped checks with reasons, and relevant ADR/parity/security/migration/README notes.',
		'Do not comment `@claude please review`; the extension will handle that immediately after the PR is opened.'
	);

	return lines.join('\n');
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolvePromise) => {
		setTimeout(resolvePromise, ms);
	});
}
