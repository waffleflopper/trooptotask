import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkModuleBoundaries, type Manifest } from './module-boundaries';
import { newViolations, ownerDependencyEdges, runModuleGovernance } from './module-governance';
import { buildImportGraph } from './module-imports';

const manifest: Manifest = {
	owners: {
		alpha: { roots: ['src/features/alpha/'], files: [], packet: '08-M04' },
		beta: { roots: ['src/features/beta/'], files: [], packet: '08-M05' }
	},
	rootExclusions: {},
	dependencies: { alpha: ['beta'], beta: [] },
	publicRoots: {},
	publicFiles: { alpha: ['src/features/alpha/index.ts'], beta: ['src/features/beta/index.ts'] },
	mixedFiles: {}
};

function findings(alpha: string) {
	const sources = [
		{ path: 'src/features/alpha/index.ts', content: alpha },
		{ path: 'src/features/beta/index.ts', content: 'export const publicValue = true;' },
		{ path: 'src/features/beta/private.ts', content: 'export const secret = true;' }
	];
	const graph = buildImportGraph(sources, (candidate) => sources.some((source) => source.path === candidate));
	return checkModuleBoundaries({ sourcePaths: sources.map((source) => source.path), ...graph }, manifest);
}

function ownerCycleFindings(includeGamma: boolean, includeBack = true) {
	const sources = [
		{ path: 'src/features/alpha/out.ts', content: "import '$features/beta/in';" },
		{ path: 'src/features/alpha/in.ts', content: 'export const alpha = true;' },
		{ path: 'src/features/beta/in.ts', content: 'export const beta = true;' },
		{ path: 'src/features/beta/out.ts', content: includeGamma ? "import '$features/gamma/in';" : '' },
		{ path: 'src/features/beta/back.ts', content: includeBack ? "import '$features/alpha/in';" : '' },
		{ path: 'src/features/gamma/in.ts', content: 'export const gamma = true;' },
		{ path: 'src/features/gamma/out.ts', content: includeGamma ? "import '$features/alpha/in';" : '' }
	];
	const roots = Object.fromEntries(['alpha', 'beta', 'gamma'].map((owner) => [owner, [`src/features/${owner}/`]]));
	const cycleManifest: Manifest = {
		owners: Object.fromEntries(
			['alpha', 'beta', 'gamma'].map((owner, index) => [
				owner,
				{ roots: roots[owner], files: [], packet: `08-M0${index + 4}` }
			])
		),
		rootExclusions: {},
		dependencies: { alpha: ['beta'], beta: ['alpha', 'gamma'], gamma: ['alpha'] },
		publicRoots: roots,
		publicFiles: {},
		mixedFiles: {}
	};
	const graph = buildImportGraph(sources, (candidate) => sources.some((source) => source.path === candidate));
	const sourceGraph = { sourcePaths: sources.map((source) => source.path), ...graph };
	return {
		findings: checkModuleBoundaries(sourceGraph, cycleManifest),
		edges: ownerDependencyEdges(sourceGraph, cycleManifest)
	};
}

describe('module governance regression gate', () => {
	it('accepts only a strict reduction of an existing owner cycle', () => {
		const before = {
			kind: 'current-cycle',
			file: 'alpha',
			message: 'Strongly connected owners: alpha, beta, gamma',
			packet: '08-M04/08-M05/08-M06'
		};
		const smaller = {
			...before,
			message: 'Strongly connected owners: alpha, beta',
			packet: '08-M04/08-M05'
		};
		const expanded = {
			...before,
			message: 'Strongly connected owners: alpha, beta, gamma, delta',
			packet: '08-M04/08-M05/08-M06/08-M07'
		};
		const changed = {
			...before,
			message: 'Strongly connected owners: alpha, beta, delta',
			packet: '08-M04/08-M05/08-M07'
		};

		const beforeEdges = new Set(['alpha\0beta', 'beta\0alpha', 'beta\0gamma', 'gamma\0alpha']);
		const smallerEdges = new Set(['alpha\0beta', 'beta\0alpha']);
		expect(newViolations([smaller], [before], beforeEdges, smallerEdges)).toEqual([]);
		expect(newViolations([smaller], [before])).toEqual([smaller]);
		expect(newViolations([expanded], [before])).toEqual([expanded]);
		expect(newViolations([changed], [before])).toEqual([changed]);
	});

	it('recognizes a real owner-cycle shrink and still rejects the reverse graph change', () => {
		const threeOwners = ownerCycleFindings(true);
		const twoOwners = ownerCycleFindings(false);
		expect(threeOwners.findings.filter((issue) => issue.kind === 'current-cycle')).toHaveLength(1);
		expect(twoOwners.findings.filter((issue) => issue.kind === 'current-cycle')).toHaveLength(1);
		expect(newViolations(twoOwners.findings, threeOwners.findings, threeOwners.edges, twoOwners.edges)).toEqual([]);
		expect(
			newViolations(threeOwners.findings, twoOwners.findings, twoOwners.edges, threeOwners.edges).map(
				(issue) => issue.kind
			)
		).toContain('current-cycle');
	});

	it('rejects a smaller owner cycle when its reverse dependency is new', () => {
		const before = ownerCycleFindings(true, false);
		const after = ownerCycleFindings(false, true);
		expect(before.edges.has('beta\0alpha')).toBe(false);
		expect(after.edges.has('beta\0alpha')).toBe(true);
		expect(
			newViolations(after.findings, before.findings, before.edges, after.edges).map((issue) => issue.kind)
		).toContain('current-cycle');
	});

	it('fails a newly introduced private import even while existing debt remains reported', () => {
		const before = findings("import { secret } from '$features/beta/private';");
		const after = findings(
			"import { secret } from '$features/beta/private'; import { again } from '$features/beta/private';"
		);
		expect(before.map((issue) => issue.kind)).toContain('private');
		expect(newViolations(after, before).map((issue) => issue.kind)).toContain('private');
	});

	it('does not classify unchanged or removed debt as a new violation', () => {
		const before = findings("import { secret } from '$features/beta/private';");
		expect(newViolations(before, before)).toEqual([]);
		expect(newViolations(findings("import { publicValue } from '$features/beta';"), before)).toEqual([]);
	});
});

it('uses historical ownership for a real file relocation while rejecting new private dependencies and source cycles', () => {
	const directory = mkdtempSync(path.join(os.tmpdir(), 't2t-module-move-'));
	const write = (file: string, content: string) => {
		mkdirSync(path.dirname(path.join(directory, file)), { recursive: true });
		writeFileSync(path.join(directory, file), content);
	};
	const git = (...args: string[]) => execFileSync('git', args, { cwd: directory, stdio: 'pipe' });
	try {
		const beforeManifest: Manifest = {
			owners: {
				alpha: { roots: ['src/features/alpha/'], files: ['src/lib/alpha.server.ts'], packet: '08-M04' },
				beta: { roots: ['src/features/beta/'], files: [], packet: '08-M05' }
			},
			rootExclusions: {},
			dependencies: { alpha: ['beta'], beta: [] },
			publicRoots: {},
			publicFiles: {
				alpha: ['src/features/alpha/contracts.ts', 'src/features/alpha/index.server.ts'],
				beta: ['src/features/beta/index.server.ts']
			},
			mixedFiles: {}
		};
		write('scripts/module-boundaries.json', JSON.stringify(beforeManifest));
		write('src/features/alpha/contracts.ts', 'export const value = true;');
		write('src/features/alpha/index.server.ts', "export { value } from '$lib/alpha.server';");
		write('src/lib/alpha.server.ts', "import '$features/beta/index.server'; export const value = true;");
		write('src/features/beta/index.server.ts', 'export const beta = true;');
		write('src/features/beta/back.server.ts', "import '$features/alpha/contracts';");
		write('src/features/beta/private.server.ts', 'export const secret = true;');
		git('init', '--quiet');
		git('add', '.');
		git(
			'-c',
			'user.name=Synthetic verifier',
			'-c',
			'user.email=verification@example.test',
			'commit',
			'--quiet',
			'-m',
			'Existing owner cycle'
		);
		git('update-ref', 'refs/remotes/origin/main', 'HEAD');
		git(
			'-c',
			'user.name=Synthetic verifier',
			'-c',
			'user.email=verification@example.test',
			'commit',
			'--quiet',
			'--allow-empty',
			'-m',
			'Candidate'
		);
		const current = structuredClone(beforeManifest);
		current.owners.alpha.files = [];
		write('scripts/module-boundaries.json', JSON.stringify(current));
		rmSync(path.join(directory, 'src/lib/alpha.server.ts'));
		write('src/features/alpha/index.server.ts', "import '$features/beta/index.server'; export const value = true;");
		expect(runModuleGovernance(directory)).toEqual([]);
		write('src/features/alpha/index.server.ts', "import '$features/beta/private.server'; export const value = true;");
		expect(runModuleGovernance(directory).map(({ kind }) => kind)).toContain('private');
		write('src/features/alpha/index.server.ts', "import '$features/beta/index.server'; export const value = true;");
		write('src/features/beta/index.server.ts', "import '$features/alpha/index.server'; export const beta = true;");
		expect(runModuleGovernance(directory).map(({ kind }) => kind)).toContain('source-cycle');
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
});
