import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { checkModuleBoundaries, type Manifest } from './module-boundaries';
import { buildImportGraph, scanRepository } from './module-imports';

function fixture(
	sources: { path: string; content: string }[],
	dependencies: Record<string, string[]> = { alpha: ['beta'], beta: [] }
) {
	const paths = sources.map((source) => source.path);
	const graph = buildImportGraph(sources, (candidate) => paths.includes(candidate));
	const manifest: Manifest = {
		owners: {
			alpha: { roots: ['src/features/alpha/'], files: [], packet: '08-M04' },
			beta: { roots: ['src/features/beta/'], files: [], packet: '08-M05' }
		},
		rootExclusions: {},
		dependencies,
		publicRoots: {},
		publicFiles: {
			alpha: ['src/features/alpha/index.ts'],
			beta: ['src/features/beta/index.ts']
		},
		mixedFiles: {}
	};
	return { graph: { sourcePaths: paths, ...graph }, manifest };
}

describe('module boundary declaration', () => {
	it('accepts declared public imports through aliases and local private imports', () => {
		const { graph, manifest } = fixture([
			{
				path: 'src/features/alpha/index.ts',
				content: "import type { B } from '$features/beta'; export { own } from './private';"
			},
			{ path: 'src/features/alpha/private.ts', content: 'export const own = true;' },
			{ path: 'src/features/beta/index.ts', content: 'export type B = string;' }
		]);
		expect(checkModuleBoundaries(graph, manifest)).toEqual([]);
	});

	it('accepts a declared server adapter dependency on current provider infrastructure', () => {
		const { graph, manifest } = fixture([
			{
				path: 'src/features/alpha/index.server.ts',
				content: "import { client } from '$lib/server/supabase';"
			},
			{ path: 'src/lib/server/supabase.ts', content: 'export const client = true;' }
		]);
		manifest.owners.provider = {
			roots: [],
			files: ['src/lib/server/supabase.ts'],
			packet: '08-M15'
		};
		manifest.dependencies.alpha = ['provider'];
		manifest.dependencies.provider = [];
		manifest.publicRoots.provider = ['src/lib/server/'];
		manifest.publicFiles.alpha = ['src/features/alpha/index.server.ts'];
		manifest.publicFiles.beta = [];
		delete manifest.owners.beta;
		delete manifest.dependencies.beta;
		expect(checkModuleBoundaries(graph, manifest)).toEqual([]);
	});

	it('keeps public routes outside privileged provider dependencies', () => {
		const sources = [
			{ path: 'src/routes/+page.server.ts', content: "import { client } from '$lib/server/supabase';" },
			{ path: 'src/lib/server/supabase.ts', content: 'export const client = true;' }
		];
		const graph = buildImportGraph(sources, (candidate) => sources.some((source) => source.path === candidate));
		const manifest = JSON.parse(readFileSync('scripts/module-boundaries.json', 'utf8')) as Manifest;
		expect(
			checkModuleBoundaries({ sourcePaths: sources.map((source) => source.path), ...graph }, manifest)
				.filter((issue) => issue.kind === 'undeclared')
				.map((issue) => issue.packet)
		).toEqual(['08-M17']);
	});

	it('reports private and undeclared paths without hiding either finding', () => {
		const { graph, manifest } = fixture(
			[
				{
					path: 'src/features/alpha/index.ts',
					content: "export { secret } from '$features/beta/private'; void import('../beta/private');"
				},
				{ path: 'src/features/beta/index.ts', content: '' },
				{ path: 'src/features/beta/private.ts', content: 'export const secret = true;' }
			],
			{ alpha: [], beta: [] }
		);
		const violations = checkModuleBoundaries(graph, manifest);
		expect(violations.filter((issue) => issue.kind === 'private')).toHaveLength(2);
		expect(violations.filter((issue) => issue.kind === 'undeclared')).toHaveLength(2);
		expect(violations.every((issue) => issue.packet === '08-M04')).toBe(true);
	});

	it('rejects cycles in the declaration and real import graph', () => {
		const { graph, manifest } = fixture(
			[
				{ path: 'src/features/alpha/index.ts', content: "export { b } from '$features/beta';" },
				{ path: 'src/features/beta/index.ts', content: "export { a } from '$features/alpha';" }
			],
			{ alpha: ['beta'], beta: ['alpha'] }
		);
		const kinds = checkModuleBoundaries(graph, manifest).map((issue) => issue.kind);
		expect(kinds).toContain('declared-cycle');
		expect(kinds).toContain('current-cycle');
	});

	it('reports a cycle within one owner even when the owner graph is acyclic', () => {
		const { graph, manifest } = fixture([
			{ path: 'src/features/alpha/index.ts', content: "export { x } from './private';" },
			{ path: 'src/features/alpha/private.ts', content: "import './index'; export const x = true;" }
		]);
		manifest.publicFiles.beta = [];
		expect(checkModuleBoundaries(graph, manifest).map((issue) => issue.kind)).toContain('source-cycle');
	});

	it('reports duplicate or missing ownership and mixed current files', () => {
		const { graph, manifest } = fixture([
			{ path: 'src/features/alpha/index.ts', content: '' },
			{ path: 'src/unowned.ts', content: '' }
		]);
		manifest.owners.beta.roots.push('src/features/alpha/');
		manifest.mixedFiles['src/features/alpha/index.ts'] = {
			packet: '08-M04',
			reason: 'current mixed composition'
		};
		const violations = checkModuleBoundaries(graph, manifest);
		expect(violations.filter((issue) => issue.kind === 'ownership').map((issue) => issue.message)).toEqual([
			'Duplicate owners: alpha, beta',
			'Missing owner'
		]);
		expect(violations.some((issue) => issue.kind === 'mixed-owner')).toBe(true);
	});

	it('classifies every current source file with one owner and keeps the target graph acyclic', () => {
		const manifest = JSON.parse(readFileSync('scripts/module-boundaries.json', 'utf8')) as Manifest;
		const graph = scanRepository(process.cwd());
		const violations = checkModuleBoundaries(graph, manifest);
		expect(
			violations.filter((issue) => ['ownership', 'manifest', 'declared-cycle', 'source-graph'].includes(issue.kind))
		).toEqual([]);
	});
});
