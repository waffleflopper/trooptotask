import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import config from '../vercel.json';

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })));

function repository() {
	const root = mkdtempSync(path.join(os.tmpdir(), 't2t-vercel-ignore-'));
	roots.push(root);
	const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
	git('init', '--quiet');
	git('config', 'user.email', 'build-test@example.test');
	git('config', 'user.name', 'Build fixture');
	function write(file: string, contents = 'fixture\n') {
		mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
		writeFileSync(path.join(root, file), contents);
	}
	function commit() {
		git('add', '.');
		git('commit', '--quiet', '-m', 'fixture');
		return git('rev-parse', 'HEAD');
	}
	write('src/routes/+page.svelte', '<h1>Before</h1>');
	write('README.md');
	const deployed = commit();
	function decision(previous = deployed) {
		const result = spawnSync('bash', ['-c', config.ignoreCommand], {
			cwd: root,
			env: { ...process.env, VERCEL_GIT_PREVIOUS_SHA: previous },
			encoding: 'utf8'
		});
		if (result.error) throw result.error;
		if (result.status === null) throw new Error(`Build selection terminated: ${result.signal}`);
		return result.status;
	}
	return { root, git, write, commit, deployed, decision };
}

describe('Vercel build selection', () => {
	it('skips documentation and test changes while leaving CI responsible for validation', () => {
		const repo = repository();
		for (const file of [
			'README.md',
			'AGENTS.md',
			'docs/architecture/ARCHITECTURE.md',
			'.agents/skills/verify-trooptotask/features/calendar.md',
			'src/features/calendar/components/Calendar.test.ts',
			'scripts/ci/changes.test.ts',
			'scripts/verification/browser.test.mjs'
		]) {
			repo.write(file, 'updated\n');
		}
		repo.commit();
		expect(repo.decision()).toBe(0);
	});

	it('builds all undeployed app changes even when the final commit only updates documentation', () => {
		const repo = repository();
		repo.write('src/routes/+page.svelte', '<h1>After</h1>');
		repo.commit();
		repo.write('README.md', 'updated\n');
		repo.commit();
		expect(repo.decision()).toBe(1);
	});

	it.each([
		'package.json',
		'package-lock.json',
		'vercel.json',
		'svelte.config.js',
		'vite.config.ts',
		'static/robots.txt',
		'.github/copilot-instructions.md',
		'scripts/patch-bits-ui-timers.mjs',
		'docs/architecture/GOVERNANCE_BASELINE.json',
		'src/features/calendar/contracts.ts',
		'unknown.config'
	])('builds when %s changes', (file) => {
		const repo = repository();
		repo.write(file);
		repo.commit();
		expect(repo.decision()).toBe(1);
	});

	it('builds when app code is deleted or renamed into an excluded documentation path', () => {
		const repo = repository();
		repo.write('docs/README.md');
		repo.git('mv', 'src/routes/+page.svelte', 'docs/renamed.md');
		repo.commit();
		expect(repo.decision()).toBe(1);
	});

	it('builds the first deployment, explicit rebuilds, and unavailable shallow-clone history', () => {
		const repo = repository();
		expect(repo.decision('')).toBe(1);
		expect(repo.decision()).toBe(1);
		repo.write('README.md', 'updated\n');
		repo.commit();
		expect(repo.decision('a'.repeat(40))).toBe(1);
	});
});
