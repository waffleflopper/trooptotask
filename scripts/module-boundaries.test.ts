import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { checkModuleBoundaries, type Manifest } from './module-boundaries';
import { buildImportGraph, scanRepository } from './module-imports';

function fixture(
	sources: { path: string; content: string }[],
	dependencies: Record<string, string[]> = { alpha: ['beta'], beta: [] },
	resolvableFiles: string[] = []
) {
	const paths = sources.map((source) => source.path);
	const graph = buildImportGraph(
		sources,
		(candidate) => paths.includes(candidate) || resolvableFiles.includes(candidate)
	);
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

	it('enforces public and declared ownership for root-relative imports', () => {
		const sources = [
			{ path: 'src/features/alpha/index.ts', content: "export { value } from '/src/features/beta/index.ts';" },
			{ path: 'src/features/beta/index.ts', content: 'export const value = true;' },
			{ path: 'src/features/beta/private.ts', content: 'export const value = true;' }
		];
		const allowed = fixture(sources);
		expect(checkModuleBoundaries(allowed.graph, allowed.manifest)).toEqual([]);
		sources[0].content = "export { value } from '/src/features/beta/private.ts';";
		const denied = fixture(sources, { alpha: [], beta: [] });
		expect(checkModuleBoundaries(denied.graph, denied.manifest).map((issue) => issue.kind)).toEqual([
			'private',
			'undeclared'
		]);
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

	it('rejects a browser import chain into a feature server file without recognized placement', () => {
		const { graph, manifest } = fixture([
			{
				path: 'src/features/alpha/Panel.svelte',
				content: '<script lang="ts">import { value } from "./index";</script>{value}'
			},
			{ path: 'src/features/alpha/index.ts', content: "export { value } from './server/data';" },
			{ path: 'src/features/alpha/server/data.ts', content: 'export const value = true;' }
		]);
		const kinds = checkModuleBoundaries(graph, manifest).map((issue) => issue.kind);
		expect(kinds).toContain('web-privilege');
		expect(kinds).toContain('server-placement');
	});

	it('rejects transitive server-only and private-env imports from a web entry', () => {
		const { graph, manifest } = fixture([
			{ path: 'src/features/alpha/index.ts', content: "export { value } from './bridge';" },
			{ path: 'src/features/alpha/bridge.ts', content: "export { value } from './data.server';" },
			{
				path: 'src/features/alpha/data.server.ts',
				content: "import { SECRET } from '$env/static/private'; export const value = SECRET;"
			}
		]);
		const issues = checkModuleBoundaries(graph, manifest).filter((issue) => issue.kind === 'web-privilege');
		expect(issues.some((issue) => issue.message.includes('data.server.ts'))).toBe(true);
	});

	it('rejects portable imports of Svelte, providers and DOM globals through barrels', () => {
		const { graph, manifest } = fixture([
			{ path: 'src/features/alpha/contracts.ts', content: "export { value } from './plain';" },
			{
				path: 'src/features/alpha/plain.ts',
				content:
					"import type { User } from '@supabase/supabase-js'; import { tick } from 'svelte'; export const value = window.location.href;"
			}
		]);
		const kinds = checkModuleBoundaries(graph, manifest).map((issue) => issue.kind);
		expect(kinds).toContain('portable-leak');
		expect(kinds).toContain('portable-global');
	});

	it.each([
		["import { page } from '$app/state'; export type Note = typeof page;", '$app/state'],
		["import { readFileSync } from 'node:fs'; export const note = readFileSync;", 'node:fs'],
		["import { readFileSync } from 'fs'; export const note = readFileSync;", 'fs'],
		["import { read } from '$app/server'; export const note = read;", '$app/server']
	])('rejects a portable contract that imports %s', (content, specifier) => {
		const { graph, manifest } = fixture([
			{ path: 'src/features/alpha/contracts.ts', content },
			{ path: 'src/features/beta/index.ts', content: 'export type Empty = never;' }
		]);
		expect(
			checkModuleBoundaries(graph, manifest).some(
				(issue) => issue.kind === 'portable-leak' && issue.message.includes(specifier)
			)
		).toBe(true);
	});

	it.each([
		['svelte-sonner', undefined],
		['@lucide/svelte/icons/plus', undefined],
		['bits-ui', undefined],
		['layerchart', undefined],
		['mode-watcher', undefined],
		['./widget.svelte.js', 'src/features/alpha/widget.svelte.js'],
		['@fontsource/ibm-plex-mono/400.css', undefined],
		['@fontsource/ibm-plex-mono', undefined],
		['@fontsource/barlow-condensed/600.css?url', undefined],
		['tw-animate-css', undefined],
		['./style.css', 'src/features/alpha/style.css'],
		['$features/alpha/theme.scss', 'src/features/alpha/theme.scss'],
		['./logo.svg', 'src/features/alpha/logo.svg'],
		['tailwindcss', undefined],
		['@tailwindcss/vite', undefined],
		['exceljs', undefined],
		['jspdf', undefined],
		['jspdf-autotable', undefined],
		['svelte', undefined],
		['vite', undefined],
		['vitest', undefined],
		['jsdom', undefined],
		['happy-dom', undefined],
		['@testing-library/svelte', undefined],
		['devalue', undefined]
	])('keeps %s available to web code but out of portable contracts', (specifier, target) => {
		const resolvableFiles = target ? [target] : [];
		const sources = [
			{ path: 'src/features/alpha/index.ts', content: "export * from './helper';" },
			{ path: 'src/features/alpha/helper.ts', content: `import '${specifier}'; export const value = 1;` },
			{ path: 'src/features/beta/index.ts', content: '' }
		];
		const web = fixture(sources, undefined, resolvableFiles);
		expect(checkModuleBoundaries(web.graph, web.manifest)).toEqual([]);
		const portable = fixture(
			[...sources, { path: 'src/features/alpha/contracts.ts', content: "export * from './helper';" }],
			undefined,
			resolvableFiles
		);
		expect(checkModuleBoundaries(portable.graph, portable.manifest)).toEqual([
			{
				kind: 'portable-leak',
				file: 'src/features/alpha/helper.ts',
				message: `${specifier}${target ? ` (${target})` : ''} reached from src/features/alpha/contracts.ts`,
				packet: '08-M04'
			}
		]);
	});

	it.each(['zod', 'clsx', '@internationalized/date'])(
		'accepts neutral external dependency %s in a consumed portable contract',
		(specifier) => {
			const { graph, manifest } = fixture([
				{ path: 'src/features/alpha/index.ts', content: "export * from './contracts';" },
				{ path: 'src/features/alpha/contracts.ts', content: `export * from '${specifier}';` },
				{ path: 'src/features/beta/index.ts', content: '' }
			]);
			expect(checkModuleBoundaries(graph, manifest)).toEqual([]);
		}
	);

	it('treats every SvelteKit .server. basename as server-only', () => {
		const { graph, manifest } = fixture([
			{ path: 'src/features/alpha/index.ts', content: "import { value } from './data.server.test.ts';" },
			{ path: 'src/features/alpha/data.server.test.ts', content: 'export const value = true;' },
			{ path: 'src/features/beta/index.ts', content: '' }
		]);
		expect(checkModuleBoundaries(graph, manifest).filter((issue) => issue.kind === 'web-privilege')).toEqual([
			{
				kind: 'web-privilege',
				file: 'src/features/alpha/index.ts',
				message:
					'./data.server.test.ts (src/features/alpha/data.server.test.ts) reached from src/features/alpha/index.ts',
				packet: '08-M04'
			}
		]);
	});

	it('accepts a local data asset in a consumed portable contract', () => {
		const { graph, manifest } = fixture(
			[
				{ path: 'src/features/alpha/index.ts', content: "export * from './contracts';" },
				{ path: 'src/features/alpha/contracts.ts', content: "export { default as ranks } from './ranks.json';" },
				{ path: 'src/features/beta/index.ts', content: '' }
			],
			undefined,
			['src/features/alpha/ranks.json']
		);
		expect(graph.edges.find((edge) => edge.from === 'src/features/alpha/contracts.ts')?.to).toBe(
			'src/features/alpha/ranks.json'
		);
		expect(checkModuleBoundaries(graph, manifest)).toEqual([]);
	});

	it.each(['src/hooks.ts', 'src/params/rank.ts'])('rejects server-only imports from universal %s', (entry) => {
		const { graph, manifest } = fixture([
			{ path: entry, content: "import { SECRET } from '$env/static/private'; export const value = SECRET;" },
			{ path: 'src/features/beta/index.ts', content: '' }
		]);
		expect(checkModuleBoundaries(graph, manifest).filter((issue) => issue.kind === 'web-privilege')).toEqual([
			{
				kind: 'web-privilege',
				file: entry,
				message: `$env/static/private reached from ${entry}`,
				packet: '07-02c'
			}
		]);
	});

	it('does not treat a param matcher test as a universal entry', () => {
		const { graph, manifest } = fixture([
			{
				path: 'src/params/rank.test.ts',
				content: "import { readFileSync } from 'node:fs'; export const value = readFileSync;"
			},
			{ path: 'src/features/beta/index.ts', content: '' }
		]);
		expect(checkModuleBoundaries(graph, manifest).filter((issue) => issue.kind === 'web-privilege')).toEqual([]);
	});

	it('rejects a portable contract that reaches browser globals through globalThis', () => {
		const { graph, manifest } = fixture([
			{ path: 'src/features/alpha/contracts.ts', content: 'export const value = globalThis.window.localStorage;' },
			{ path: 'src/features/beta/index.ts', content: 'export type Empty = never;' }
		]);
		expect(checkModuleBoundaries(graph, manifest).some((issue) => issue.kind === 'portable-global')).toBe(true);
	});

	it('allows neutral globalThis APIs but rejects aliases that could hide browser access', () => {
		const sources = [
			{
				path: 'src/features/alpha/contracts.ts',
				content:
					'export const copy = globalThis.structuredClone(globalThis.JSON.stringify(globalThis.Math.max(1, 2)) + globalThis.TextEncoder.name + globalThis.URL.name);'
			},
			{ path: 'src/features/alpha/index.ts', content: "export { copy } from './contracts';" },
			{ path: 'src/features/beta/index.ts', content: 'export type Empty = never;' }
		];
		const { manifest } = fixture(sources);
		const graph = buildImportGraph(sources, (candidate) => sources.some((source) => source.path === candidate));
		expect(checkModuleBoundaries({ sourcePaths: sources.map((source) => source.path), ...graph }, manifest)).toEqual(
			[]
		);
		const alias = [
			{ ...sources[0], content: 'const browser = globalThis; export const copy = browser.window;' },
			...sources.slice(1)
		];
		const aliasGraph = buildImportGraph(alias, (candidate) => alias.some((source) => source.path === candidate));
		expect(
			checkModuleBoundaries({ sourcePaths: alias.map((source) => source.path), ...aliasGraph }, manifest).some(
				(issue) => issue.kind === 'portable-global'
			)
		).toBe(true);
		for (const content of [
			'export const copy = globalThis.process.env.NODE_ENV;',
			'export const copy = globalThis.Buffer.from("x");',
			'export const copy = process.env.NODE_ENV;',
			'export const copy = Buffer.from("x");'
		]) {
			const nodeOnly = [{ ...sources[0], content }, ...sources.slice(1)];
			const nodeGraph = buildImportGraph(nodeOnly, (candidate) => nodeOnly.some((source) => source.path === candidate));
			expect(
				checkModuleBoundaries({ sourcePaths: nodeOnly.map((source) => source.path), ...nodeGraph }, manifest).some(
					(issue) => issue.kind === 'portable-global'
				)
			).toBe(true);
		}
	});

	it('checks a root route load as browser code and rejects its transitive server import', () => {
		const sources = [
			{ path: 'src/routes/+page.ts', content: "export { value } from '$features/alpha/index';" },
			{ path: 'src/features/alpha/index.ts', content: "export { value } from './value.server';" },
			{ path: 'src/features/alpha/value.server.ts', content: 'export const value = true;' }
		];
		const graph = buildImportGraph(sources, (candidate) => sources.some((source) => source.path === candidate));
		const { manifest } = fixture(sources);
		manifest.owners.delivery = { roots: ['src/routes/'], files: [], packet: '08-M17' };
		manifest.dependencies.delivery = ['alpha'];
		expect(
			checkModuleBoundaries({ sourcePaths: sources.map((source) => source.path), ...graph }, manifest).some(
				(issue) => issue.kind === 'web-privilege' && issue.message.includes('src/routes/+page.ts')
			)
		).toBe(true);
	});

	it('accepts a pure consumed contract and a recognized server operation', () => {
		const { graph, manifest } = fixture([
			{ path: 'src/features/alpha/index.ts', content: "export type { Note } from './contracts';" },
			{ path: 'src/features/alpha/contracts.ts', content: 'export type Note = { id: string };' },
			{
				path: 'src/features/alpha/index.server.ts',
				content: "import type { Note } from './contracts'; export type Read = () => Promise<Note>;"
			},
			{ path: 'src/features/beta/index.ts', content: 'export type Empty = never;' }
		]);
		expect(checkModuleBoundaries(graph, manifest)).toEqual([]);
	});

	it('checks the runtime file as well as its separate TypeScript definition', () => {
		const sources = [
			{ path: 'src/features/alpha/index.ts', content: "export * from './contracts';" },
			{ path: 'src/features/alpha/contracts.ts', content: "export { value } from './value.js';" },
			{ path: 'src/features/alpha/value.ts', content: "export const value = 'safe';" },
			{ path: 'src/features/alpha/value.js', content: 'export const value = document.title;' },
			{ path: 'src/features/beta/index.ts', content: '' }
		];
		const runtimeLeak = fixture(sources);
		expect(checkModuleBoundaries(runtimeLeak.graph, runtimeLeak.manifest)).toContainEqual(
			expect.objectContaining({ kind: 'portable-global', file: 'src/features/alpha/value.js' })
		);
		sources[3].content = "export const value = 'safe';";
		sources[2].content = 'export const value = document.title;';
		const typeLeak = fixture(sources);
		expect(checkModuleBoundaries(typeLeak.graph, typeLeak.manifest)).toContainEqual(
			expect.objectContaining({ kind: 'portable-global', file: 'src/features/alpha/value.ts' })
		);
		sources[2].content = "export const value = 'safe';";
		const allowed = fixture(sources);
		expect(checkModuleBoundaries(allowed.graph, allowed.manifest)).toEqual([]);
	});

	it.each([
		'export type Input = HTMLInputElement;',
		'export const observer = new MutationObserver(() => {});',
		'export const frame = requestAnimationFrame(() => {});',
		'export const browser = { window };',
		'export const browser = { [window.name]: true };'
	])('rejects actual DOM dependencies in a consumed portable contract: %s', (content) => {
		const { graph, manifest } = fixture([
			{ path: 'src/features/alpha/index.ts', content: "export * from './contracts';" },
			{ path: 'src/features/alpha/contracts.ts', content },
			{ path: 'src/features/beta/index.ts', content: '' }
		]);
		expect(checkModuleBoundaries(graph, manifest).some((issue) => issue.kind === 'portable-global')).toBe(true);
	});

	it('accepts portable DTO fields, local bindings and neutral language types', () => {
		const { graph, manifest } = fixture([
			{ path: 'src/features/alpha/index.ts', content: "export * from './contracts';" },
			{
				path: 'src/features/alpha/contracts.ts',
				content: `export type Appointment = { location: string; history: string[] };
					export function select(window: number) { return { window }; }
					export const names = ({ location: history }: Appointment) => history;
					export const lookup = new Map<string, Readonly<Appointment>>();
					export const absent = undefined;
					export const alsoAbsent = globalThis.undefined;
					export function count() { return arguments.length; }
					export type Tuple = [name: string, count: number];
					export const kinds = ['a', 'b'] as const;`
			},
			{ path: 'src/features/beta/index.ts', content: '' }
		]);
		expect(checkModuleBoundaries(graph, manifest)).toEqual([]);
	});

	it('checks globals in transitive helpers while respecting imported bindings', () => {
		const sources = [
			{ path: 'src/features/alpha/index.ts', content: "export * from './contracts';" },
			{
				path: 'src/features/alpha/contracts.ts',
				content: `import { window } from './helper'; export const value = window;
					export { window as renamed } from './helper';
					export type { Value as Renamed } from './helper';`
			},
			{ path: 'src/features/alpha/helper.ts', content: 'export const window = 1; export type Value = string;' },
			{ path: 'src/features/beta/index.ts', content: '' }
		];
		const allowed = fixture(sources);
		expect(checkModuleBoundaries(allowed.graph, allowed.manifest)).toEqual([]);
		sources[2].content = 'export const window = new MutationObserver(() => {});';
		const denied = fixture(sources);
		expect(
			checkModuleBoundaries(denied.graph, denied.manifest).some(
				(issue) => issue.kind === 'portable-global' && issue.file === 'src/features/alpha/helper.ts'
			)
		).toBe(true);
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
