import { relative, resolve } from 'node:path';
import type { ExtensionAPI, ExtensionContext } from '@mariozechner/pi-coding-agent';

interface CommandRule {
	pattern: RegExp;
	reason: string;
}

const BLOCKED_COMMAND_RULES: CommandRule[] = [
	{
		pattern: /\bsupabase\s+db\s+reset\b/i,
		reason: 'Blocked: resetting the local development database requires explicit user permission.'
	},
	{
		pattern: /\bsupabase\s+db\s+(push|remote\s+commit)\b/i,
		reason: 'Blocked: do not apply Supabase changes against a remote database from pi.'
	},
	{
		pattern: /\bsupabase\s+migration\s+up\b/i,
		reason: 'Blocked: remote migration/application commands must be handled manually outside pi.'
	},
	{
		pattern: /\bsupabase\s+link\b/i,
		reason: 'Blocked: linking a remote Supabase project is not allowed from pi.'
	},
	{
		pattern: /\bdrop\s+database\b/i,
		reason: 'Blocked: destructive SQL detected. Ask the user first.'
	},
	{
		pattern: /\bdrop\s+table\b/i,
		reason: 'Blocked: destructive SQL detected. Ask the user first.'
	},
	{
		pattern: /\btruncate\s+table\b/i,
		reason: 'Blocked: destructive SQL detected. Ask the user first.'
	},
	{
		pattern: /\bdelete\s+from\b/i,
		reason: 'Blocked: direct data deletion detected. Ask the user first.'
	}
];

function normalizeProjectPath(path: string, cwd: string): string {
	const cleaned = path.replace(/^@+/, '');
	const absolutePath = resolve(cwd, cleaned);
	return relative(cwd, absolutePath).replaceAll('\\', '/');
}

function isBlockedPath(path: string): boolean {
	return (
		path === '.env' ||
		path.startsWith('.env.') ||
		path.includes('/.env') ||
		path === '.git' ||
		path.startsWith('.git/') ||
		path.includes('/.git/') ||
		path === 'node_modules' ||
		path.startsWith('node_modules/') ||
		path.includes('/node_modules/')
	);
}

function requiresMigrationConfirmation(path: string): boolean {
	return (
		path.startsWith('supabase/migrations/') ||
		path === 'supabase/seed.sql' ||
		path === 'supabase/seed_remote.sql' ||
		path === 'supabase/schema_remote.sql' ||
		path === 'supabase/schema_remote_live.sql'
	);
}

async function confirmSensitivePath(path: string, ctx: ExtensionContext): Promise<boolean> {
	if (!ctx.hasUI) {
		return false;
	}

	return ctx.ui.confirm(
		'Confirm sensitive Supabase file edit',
		[
			`You are about to modify: ${path}`,
			'',
			'Only continue if this change is intentional and you understand any migration or seed impact.',
			'If a remote migration/application step will be needed, pi should not run it.'
		].join('\n')
	);
}

function findBlockedCommandReason(command: string): string | undefined {
	for (const rule of BLOCKED_COMMAND_RULES) {
		if (rule.pattern.test(command)) {
			return rule.reason;
		}
	}

	return undefined;
}

export default function trooptotaskGuardrails(pi: ExtensionAPI) {
	pi.on('tool_call', async (event, ctx) => {
		if (event.toolName === 'bash') {
			const command = typeof event.input.command === 'string' ? event.input.command : '';
			const reason = findBlockedCommandReason(command);

			if (reason) {
				if (ctx.hasUI) {
					ctx.ui.notify(reason, 'warning');
				}
				return { block: true, reason };
			}
		}

		if (event.toolName !== 'write' && event.toolName !== 'edit') {
			return undefined;
		}

		const rawPath = typeof event.input.path === 'string' ? event.input.path : '';
		const normalizedPath = normalizeProjectPath(rawPath, ctx.cwd);

		if (isBlockedPath(normalizedPath)) {
			const reason = `Blocked write to protected path: ${normalizedPath}`;
			if (ctx.hasUI) {
				ctx.ui.notify(reason, 'warning');
			}
			return { block: true, reason };
		}

		if (!requiresMigrationConfirmation(normalizedPath)) {
			return undefined;
		}

		const confirmed = await confirmSensitivePath(normalizedPath, ctx);
		if (!confirmed) {
			const reason = `Blocked change to sensitive Supabase file: ${normalizedPath}`;
			if (ctx.hasUI) {
				ctx.ui.notify(reason, 'warning');
			}
			return { block: true, reason };
		}

		return undefined;
	});

	pi.on('user_bash', async (event, ctx) => {
		const reason = findBlockedCommandReason(event.command);
		if (!reason) {
			return undefined;
		}

		if (ctx.hasUI) {
			ctx.ui.notify(reason, 'warning');
		}

		return {
			result: {
				output: `${reason}\nCommand: ${event.command}`,
				exitCode: 1,
				cancelled: false,
				truncated: false
			}
		};
	});
}
