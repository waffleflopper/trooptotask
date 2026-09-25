import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { changedFiles, classifyChanges, selectScope } from './changes.mjs';

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })));

function repository() {
	const root = mkdtempSync(path.join(os.tmpdir(), 't2t-ci-scope-'));
	roots.push(root);
	const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
	git('init', '--quiet');
	git('config', 'user.email', 'ci-test@example.test');
	git('config', 'user.name', 'CI fixture');
	mkdirSync(path.join(root, 'supabase'));
	writeFileSync(path.join(root, 'supabase/contract.sql'), 'SELECT 1;\n');
	writeFileSync(path.join(root, 'README.md'), '# Fixture\n');
	git('add', '.');
	git('commit', '--quiet', '-m', 'fixture');
	const base = git('rev-parse', 'HEAD');
	git('update-ref', 'refs/remotes/origin/main', base);
	return { root, git, base };
}

describe('CI job selection', () => {
	it('uses inexpensive validation for prose but keeps executable documentation covered', () => {
		expect(classifyChanges(['README.md', 'docs/architecture/DEFINITION_OF_DONE.md'])).toMatchObject({
			application: false,
			database: false
		});
		expect(classifyChanges(['docs/architecture/GOVERNANCE_BASELINE.json']).application).toBe(true);
		expect(classifyChanges(['new-tool.config'])).toMatchObject({ application: true, database: false });
	});

	it('runs SQL for its actual inputs and keeps application coverage for Supabase configuration', () => {
		for (const file of [
			'supabase/config.toml',
			'supabase/tests/scope.sql',
			'scripts/ci/database.py',
			'.depot/workflows/ci.yml',
			'package.json',
			'package-lock.json',
			'.nvmrc'
		]) {
			expect(classifyChanges([file]), file).toMatchObject({ application: true, database: true });
		}
		expect(classifyChanges(['src/routes/+page.svelte'])).toMatchObject({ application: true, database: false });
	});

	it('runs all jobs when a manual full validation is requested, even for prose', () => {
		expect(classifyChanges(['README.md'], true)).toMatchObject({ application: true, database: true });
	});

	it('includes deleted SQL, renamed paths and uncommitted additions in the real Git diff', () => {
		const { root, git, base } = repository();
		git('mv', 'supabase/contract.sql', 'README-sql.md');
		writeFileSync(path.join(root, 'new.config'), 'new input');
		const files = changedFiles(root, base);
		expect(files).toEqual(expect.arrayContaining(['supabase/contract.sql', 'README-sql.md', 'new.config']));
		expect(classifyChanges(files).database).toBe(true);
	});

	it('checks the whole PR, not just its latest prose-only commit', () => {
		const { root, git, base } = repository();
		writeFileSync(path.join(root, 'app.js'), 'export const value = 1;');
		git('add', '.');
		git('commit', '--quiet', '-m', 'application change');
		writeFileSync(path.join(root, 'README.md'), '# Updated fixture\n');
		git('add', '.');
		git('commit', '--quiet', '-m', 'prose change');
		expect(selectScope(root, 'pull_request', { pull_request: { base: { sha: base } } })).toMatchObject({
			application: true,
			database: false
		});
		expect(selectScope(root, 'workflow_dispatch', {})).toMatchObject({ application: true, database: true });
	});

	it('fails on missing PR metadata or history instead of reporting a docs-only success', () => {
		const { root } = repository();
		expect(() => selectScope(root, 'pull_request', {})).toThrow('base SHA');
		expect(() => selectScope(root, 'push', { before: '1234567890abcdef' })).toThrow();
	});
});
