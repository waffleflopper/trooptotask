import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildImportGraph, scanRepository } from './module-imports';

function inspect(path: string, content: string, available: string[]) {
	return buildImportGraph([{ path, content }], (candidate: string) => available.includes(candidate));
}

describe('module import inventory', () => {
	it('resolves both Svelte scripts, markup imports, aliases and TypeScript-backed .js paths', () => {
		const graph = inspect(
			'src/features/calendar/View.svelte',
			`<script context="module" lang="ts">
				export { Person } from '$features/personnel';
			</script>
			<script lang="ts">
				import { cn } from '$lib/utils.js';
				const store = import('./store.svelte');
			</script>
			{#await import('$features/personnel/Person.svelte') then Person}{/await}`,
			[
				'src/features/personnel/index.ts',
				'src/features/personnel/Person.svelte',
				'src/lib/utils.ts',
				'src/features/calendar/store.svelte.ts'
			]
		);
		expect(graph.failures).toEqual([]);
		expect(graph.edges.map(({ kind, to }) => [kind, to])).toEqual([
			['export', 'src/features/personnel/index.ts'],
			['import', 'src/lib/utils.ts'],
			['dynamic', 'src/features/calendar/store.svelte.ts'],
			['dynamic', 'src/features/personnel/Person.svelte']
		]);
	});

	it('keeps re-exports, type imports and literal dynamic imports in the same local graph', () => {
		const graph = inspect(
			'src/features/personnel/index.ts',
			`export * from './internal';
				import type { Note } from './contracts';
				type Lazy = typeof import('./internal');
				void import('./internal');
				// import '$lib/server/hidden';`,
			['src/features/personnel/internal.ts', 'src/features/personnel/contracts.ts']
		);
		expect(graph.failures).toEqual([]);
		expect(graph.edges.map(({ kind, to }) => [kind, to])).toEqual([
			['export', 'src/features/personnel/internal.ts'],
			['import', 'src/features/personnel/contracts.ts'],
			['import-type', 'src/features/personnel/internal.ts'],
			['dynamic', 'src/features/personnel/internal.ts']
		]);
	});

	it('fails closed for unresolved local and opaque production imports', () => {
		const graph = inspect(
			'src/features/calendar/index.ts',
			`import './missing';
				void import(target);
				import '$app/navigation';
				import 'svelte';`,
			[]
		);
		expect(graph.failures.map(({ message }) => message)).toEqual([
			expect.stringContaining('Opaque dynamic'),
			'Unresolved local import: ./missing'
		]);
		expect(graph.edges.map(({ classification }) => classification)).toEqual(['unresolved', 'virtual', 'external']);
	});

	it('fails closed for computed imports in tests too', () => {
		const graph = inspect('src/tests/example.test.ts', 'void import(moduleUrl);', []);
		expect(graph.failures.map(({ message }) => message)).toEqual([expect.stringContaining('Opaque dynamic')]);
	});

	it('resolves files and barrel indexes, never a directory target', () => {
		const root = mkdtempSync(path.join(tmpdir(), 't3-module-imports-'));
		try {
			mkdirSync(path.join(root, 'src/features/personnel'), { recursive: true });
			mkdirSync(path.join(root, 'src/lib/types'), { recursive: true });
			writeFileSync(path.join(root, 'src/features/personnel/index.ts'), 'export const person = true;');
			writeFileSync(path.join(root, 'src/lib/types.ts'), 'export type Person = string;');
			writeFileSync(
				path.join(root, 'src/features/personnel/consumer.ts'),
				"import '$features/personnel'; import type { Person } from '$lib/types'; import '$lib';"
			);

			const graph = scanRepository(root);
			expect(graph.edges.map(({ specifier, classification, to }) => [specifier, classification, to])).toEqual([
				['$features/personnel', 'local', 'src/features/personnel/index.ts'],
				['$lib/types', 'local', 'src/lib/types.ts'],
				['$lib', 'unresolved', undefined]
			]);
			expect(graph.failures).toEqual([
				{ file: 'src/features/personnel/consumer.ts', message: 'Unresolved local import: $lib' }
			]);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	it('includes TSX and JSX source files in the real scan', () => {
		const root = mkdtempSync(path.join(tmpdir(), 't3-module-imports-'));
		try {
			mkdirSync(path.join(root, 'src/features/personnel'), { recursive: true });
			mkdirSync(path.join(root, 'src/lib'), { recursive: true });
			writeFileSync(path.join(root, 'src/lib/utils.ts'), 'export const value = true;');
			writeFileSync(
				path.join(root, 'src/features/personnel/view.tsx'),
				"import { value } from '$lib/utils'; export const View = () => <div>{value}</div>;"
			);
			writeFileSync(
				path.join(root, 'src/features/personnel/other.jsx'),
				"import { value } from '$lib/utils'; export const Other = () => <div>{value}</div>;"
			);

			const graph = scanRepository(root);
			expect(graph.sourcePaths).toEqual([
				'src/features/personnel/other.jsx',
				'src/features/personnel/view.tsx',
				'src/lib/utils.ts'
			]);
			expect(graph.failures).toEqual([]);
			expect(graph.edges.map(({ to }) => to)).toEqual(['src/lib/utils.ts', 'src/lib/utils.ts']);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	it('recognizes generated $types only in an actual SvelteKit route directory', () => {
		const allowed = buildImportGraph(
			[{ path: 'src/routes/example/+page.server.ts', content: "import type { PageServerLoad } from './$types';" }],
			(candidate) => candidate === 'src/routes/example/+page.server.ts'
		);
		expect(allowed.failures).toEqual([]);
		expect(allowed.edges[0].classification).toBe('virtual');

		const unrelated = buildImportGraph(
			[
				{ path: 'src/features/personnel/consumer.ts', content: "import type { X } from './$types';" },
				{ path: 'src/routes/not-a-route/helper.ts', content: "import type { X } from './$types';" }
			],
			() => false
		);
		expect(unrelated.edges.map(({ classification }) => classification)).toEqual(['unresolved', 'unresolved']);
		expect(unrelated.failures.map(({ message }) => message)).toEqual([
			'Unresolved local import: ./$types',
			'Unresolved local import: ./$types'
		]);
	});

	it('uses TypeScript source substitution before runtime extensions', () => {
		const root = mkdtempSync(path.join(tmpdir(), 't3-module-imports-'));
		try {
			const directory = path.join(root, 'src/features/personnel');
			mkdirSync(directory, { recursive: true });
			writeFileSync(path.join(directory, 'a.mts'), 'export const a = true;');
			writeFileSync(path.join(directory, 'b.cts'), 'export const b = true;');
			writeFileSync(path.join(directory, 'c.ts'), 'export const c = true;');
			writeFileSync(path.join(directory, 'c.js'), 'export const c = false;');
			writeFileSync(path.join(directory, 'consumer.ts'), "import './a.mjs'; import './b.cjs'; import './c.js';");

			const graph = scanRepository(root);
			expect(graph.failures).toEqual([]);
			expect(graph.edges.map(({ to }) => to)).toEqual([
				'src/features/personnel/a.mts',
				'src/features/personnel/b.cts',
				'src/features/personnel/c.ts'
			]);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
