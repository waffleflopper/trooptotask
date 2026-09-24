import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { checkModuleBoundaries, type Manifest, type Violation } from './module-boundaries.ts';
import { scanRepository } from './module-imports.ts';

function git(...args: string[]): string {
	const result = spawnSync('git', args, { encoding: 'utf8' });
	if (result.status !== 0) throw new Error(`git ${args[0]} failed: ${result.stderr.trim()}`);
	return result.stdout.trim();
}

function comparisonCommit(): string {
	const head = git('rev-parse', 'HEAD');
	const main = git('rev-parse', 'refs/remotes/origin/main');
	if (head === main) return git('rev-parse', 'HEAD^');
	const base = git('merge-base', 'HEAD', main);
	if (base !== main)
		throw new Error(`Branch is behind origin/main (${main}); integrate current default content before checking`);
	return main;
}

function violationKey(issue: Violation): string {
	return [issue.kind, issue.file, issue.message, issue.packet].join('\0');
}

function newViolations(current: Violation[], before: Violation[]): Violation[] {
	const remaining = new Map<string, number>();
	for (const issue of before) {
		const key = violationKey(issue);
		remaining.set(key, (remaining.get(key) ?? 0) + 1);
	}
	return current.filter((issue) => {
		const key = violationKey(issue);
		const count = remaining.get(key) ?? 0;
		if (count === 0) return true;
		remaining.set(key, count - 1);
		return false;
	});
}

function scanCommittedSource(commit: string) {
	const directory = mkdtempSync(path.join(os.tmpdir(), 't3-module-governance-'));
	try {
		const archive = spawnSync('git', ['archive', commit, 'src'], { maxBuffer: 128 * 1024 * 1024 });
		if (archive.status !== 0) throw new Error(`Cannot read comparison source at ${commit}`);
		const extract = spawnSync('tar', ['-xf', '-', '-C', directory], { input: archive.stdout });
		if (extract.status !== 0) throw new Error(`Cannot extract comparison source at ${commit}`);
		return scanRepository(directory);
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
}

function runModuleGovernance() {
	const manifest = JSON.parse(readFileSync('scripts/module-boundaries.json', 'utf8')) as Manifest;
	const comparison = comparisonCommit();
	const before = checkModuleBoundaries(scanCommittedSource(comparison), manifest);
	const current = checkModuleBoundaries(scanRepository(process.cwd()), manifest);
	const introduced = newViolations(current, before);
	const completedScope = current.filter((issue) => issue.packet.startsWith('07-'));
	const packets = Object.entries(Object.groupBy(current, (issue) => issue.packet))
		.map(([packet, issues]) => `${packet}: ${issues?.length ?? 0}`)
		.join(', ');
	console.log(`Module boundaries: ${current.length} unresolved findings compared with ${comparison}.`);
	console.log(`Phase 08 ownership: ${packets || 'none'}. Full findings: node scripts/module-boundaries.ts`);
	return [...new Set([...introduced, ...completedScope])];
}

export { newViolations, runModuleGovernance };
