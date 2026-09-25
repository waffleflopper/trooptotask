import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const prose = /^(?:README|AGENTS|CLAUDE|CONTEXT)\.md$|^docs\/.*\.md$/;
const databaseInput =
	/^(?:supabase\/|scripts\/ci\/|\.depot\/|\.github\/workflows\/ci\.yml$|package(?:-lock)?\.json$|\.nvmrc$)/;

export function classifyChanges(files, full = false) {
	return {
		application: full || files.some((file) => !prose.test(file)),
		database: full || files.some((file) => databaseInput.test(file)),
		documents: files.filter((file) => file.endsWith('.md'))
	};
}

function git(root, ...args) {
	return execFileSync('git', args, { cwd: root, encoding: 'utf8' });
}

export function changedFiles(root, base) {
	// No rename detection: both the removed and added paths affect job selection.
	return [
		...new Set(
			(
				git(root, 'diff', '--name-only', '--no-renames', '-z', base, '--') +
				git(root, 'ls-files', '--others', '--exclude-standard', '-z')
			)
				.split('\0')
				.filter(Boolean)
		)
	];
}

export function selectScope(root, eventName, event) {
	let base;
	let full = !['pull_request', 'push'].includes(eventName);
	if (eventName === 'pull_request') {
		if (!event.pull_request?.base?.sha) throw new Error('Pull request base SHA is missing');
		base = git(root, 'merge-base', 'HEAD', event.pull_request.base.sha).trim();
	} else if (eventName === 'push' && event.before && !/^0+$/.test(event.before)) {
		// Missing history must fail rather than silently classify the wrong diff.
		base = event.before;
	} else {
		full = true;
		const head = git(root, 'rev-parse', 'HEAD').trim();
		const main = git(root, 'rev-parse', 'origin/main').trim();
		base = head === main ? git(root, 'rev-parse', 'HEAD^').trim() : main;
	}
	const files = changedFiles(root, base);
	return { base, files, ...classifyChanges(files, full) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	const root = process.cwd();
	const event = process.env.GITHUB_EVENT_PATH ? JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8')) : {};
	const scope = selectScope(root, process.env.GITHUB_EVENT_NAME, event);
	if (process.argv.includes('--documents')) {
		const documents = scope.documents.filter((file) => existsSync(path.join(root, file)));
		if (documents.length) {
			execFileSync('npm', ['exec', 'prettier', '--', '--ignore-path', '/dev/null', '--check', ...documents], {
				stdio: 'inherit'
			});
		}
		// Check incoming links too: deleting a target or heading can break unchanged prose.
		const linkedDocuments = [
			...new Set(git(root, 'ls-files', '--cached', '--others', '--exclude-standard', '-z', '--', '*.md').split('\0'))
		].filter((file) => file && existsSync(path.join(root, file)));
		const { checkDocuments } = await import('./documents.mjs');
		const errors = checkDocuments(root, linkedDocuments);
		if (errors.length) throw new Error(errors.join('\n'));
		git(root, 'diff', '--check', scope.base, '--');
		console.log(
			`Documentation checks passed (${documents.length} changed Markdown files formatted; ${linkedDocuments.length} documents checked for links).`
		);
	} else {
		console.log(JSON.stringify(scope, null, 2));
		if (process.env.GITHUB_OUTPUT) {
			appendFileSync(process.env.GITHUB_OUTPUT, `application=${scope.application}\ndatabase=${scope.database}\n`);
		}
	}
}
