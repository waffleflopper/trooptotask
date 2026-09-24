import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { build } from 'vite';
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

	it('keeps Vite root-relative imports local and fails unresolved root-relative targets', () => {
		const graph = inspect(
			'src/features/alpha/index.ts',
			`export { secret } from '/src/features/beta/private.ts';
				import '/src/features/beta/missing.ts';`,
			['src/features/beta/private.ts']
		);
		expect(graph.edges.map(({ classification, to }) => [classification, to])).toEqual([
			['local', 'src/features/beta/private.ts'],
			['unresolved', undefined]
		]);
		expect(graph.failures).toEqual([
			{ file: 'src/features/alpha/index.ts', message: 'Unresolved local import: /src/features/beta/missing.ts' }
		]);
	});

	it.each([
		['src/features/alpha/index.ts', `export const modules = import.meta.glob('../beta/private.ts', { eager: true });`],
		[
			'src/features/alpha/View.svelte',
			`<script lang="ts">const modules = import.meta.glob('../beta/private.ts', { eager: true });</script>`
		],
		['src/features/alpha/View.svelte', `{#each Object.keys(import.meta.glob('../beta/*.ts')) as name}{name}{/each}`]
	])('rejects unsupported glob imports in %s', (file, content) => {
		const graph = inspect(file, content, ['src/features/beta/private.ts']);
		expect(graph.failures).toEqual([{ file, message: expect.stringContaining('Unsupported import.meta.glob') }]);
	});

	it('accepts ordinary glob calls and text mentioning import.meta.glob', () => {
		const graph = inspect(
			'src/features/alpha/index.ts',
			`const utility = { glob: (pattern: string) => pattern };
				export const text = utility.glob('import.meta.glob("../beta/*.ts")');
				// import.meta.glob('../beta/*.ts');`,
			[]
		);
		expect(graph.failures).toEqual([]);
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

	it('uses TypeScript runtime fallback only when the imported JavaScript file is absent', () => {
		const root = mkdtempSync(path.join(tmpdir(), 't3-module-imports-'));
		try {
			const directory = path.join(root, 'src/features/personnel');
			mkdirSync(directory, { recursive: true });
			writeFileSync(path.join(directory, 'a.mts'), 'export const a = true;');
			writeFileSync(path.join(directory, 'b.cts'), 'export const b = true;');
			writeFileSync(path.join(directory, 'c.js'), 'export const c = false;');
			writeFileSync(path.join(directory, 'consumer.ts'), "import './a.mjs'; import './b.cjs'; import './c.js';");

			const graph = scanRepository(root);
			expect(graph.failures).toEqual([]);
			expect(graph.edges.map(({ to }) => to)).toEqual([
				'src/features/personnel/a.mts',
				'src/features/personnel/b.cts',
				'src/features/personnel/c.js'
			]);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	it.each([
		['.js', '.ts', '.d.ts'],
		['.jsx', '.tsx', '.d.ts'],
		['.mjs', '.mts', '.d.mts'],
		['.cjs', '.cts', '.d.cts']
	])('keeps distinct runtime and type targets for explicit %s imports', (runtime, source, declaration) => {
		const base = 'src/features/alpha/value';
		const inspectImport = (statement: string, available: string[]) =>
			inspect('src/features/alpha/contracts.ts', statement, available);
		const statement = `export { value } from './value${runtime}';`;
		const withSource = inspectImport(statement, [base + runtime, base + source, base + declaration]);
		expect(withSource.failures).toEqual([]);
		expect(withSource.edges.map(({ to }) => to)).toEqual([base + runtime, base + source]);
		const withDeclaration = inspectImport(statement, [base + runtime, base + declaration]);
		expect(withDeclaration.edges.map(({ to }) => to)).toEqual([base + runtime, base + declaration]);
		const typeOnly = inspectImport(`export type { Value } from './value${runtime}';`, [
			base + runtime,
			base + declaration
		]);
		expect(typeOnly.edges.map(({ to }) => to)).toEqual([base + declaration]);
	});

	it('resolves extensionless files and barrels with runtime and type precedence', () => {
		const base = 'src/features/alpha/value';
		for (const suffix of ['', '/index']) {
			const graph = inspect('src/features/alpha/contracts.ts', "export { value } from './value';", [
				`${base}${suffix}.js`,
				`${base}${suffix}.ts`,
				`${base}${suffix}.mjs`,
				`${base}${suffix}.d.ts`
			]);
			expect(graph.failures).toEqual([]);
			expect(graph.edges.map(({ to }) => to)).toEqual([`${base}${suffix}.mjs`, `${base}${suffix}.ts`]);
		}
	});

	it('fails explicitly for unsupported directory package entries instead of assuming an index', () => {
		const root = mkdtempSync(path.join(tmpdir(), 't3-module-package-'));
		try {
			const directory = path.join(root, 'src/features/alpha');
			mkdirSync(path.join(directory, 'barrel'), { recursive: true });
			writeFileSync(path.join(directory, 'contracts.ts'), "export { value } from './barrel';");
			writeFileSync(path.join(directory, 'barrel/package.json'), JSON.stringify({ main: './actual.js' }));
			writeFileSync(path.join(directory, 'barrel/index.ts'), "export const value = 'portable';");
			writeFileSync(path.join(directory, 'barrel/actual.js'), 'export const value = document.title;');
			expect(scanRepository(root).failures).toContainEqual({
				file: 'src/features/alpha/contracts.ts',
				message: 'Unsupported local package entry: src/features/alpha/barrel/package.json; use an explicit file import'
			});
			writeFileSync(path.join(directory, 'barrel.mjs'), "export const value = 'portable runtime';");
			writeFileSync(path.join(directory, 'barrel/package.json'), JSON.stringify({ types: './actual.d.ts' }));
			writeFileSync(path.join(directory, 'barrel/actual.d.ts'), 'export declare const value: HTMLInputElement;');
			const withRuntimeFile = scanRepository(root);
			expect(withRuntimeFile.edges).toContainEqual(expect.objectContaining({ to: 'src/features/alpha/barrel.mjs' }));
			expect(withRuntimeFile.failures).toContainEqual({
				file: 'src/features/alpha/contracts.ts',
				message: 'Unsupported local package entry: src/features/alpha/barrel/package.json; use an explicit file import'
			});
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	it.each(['./value.js', './value', './barrel'])('includes the actual Vite runtime target of %s', async (specifier) => {
		const root = mkdtempSync(path.join(tmpdir(), 't3-module-runtime-'));
		try {
			const directory = path.join(root, 'src/features/alpha');
			mkdirSync(path.join(directory, 'barrel'), { recursive: true });
			const entry = path.join(directory, 'contracts.ts');
			writeFileSync(entry, `export { value } from '${specifier}';`);
			for (const stem of ['value', 'barrel/index']) {
				writeFileSync(path.join(directory, `${stem}.ts`), "export const value = 'portable';");
				writeFileSync(path.join(directory, `${stem}.js`), 'export const value = document.title;');
			}
			const built = await build({
				root,
				configFile: false,
				logLevel: 'silent',
				build: { write: false, lib: { entry, formats: ['es'] } }
			});
			const outputs = Array.isArray(built) ? built : [built];
			const runtimeFiles = outputs.flatMap((output) =>
				'output' in output
					? output.output.flatMap((chunk) => (chunk.type === 'chunk' ? Object.keys(chunk.modules) : []))
					: []
			);
			const expected = specifier === './barrel' ? 'src/features/alpha/barrel/index.js' : 'src/features/alpha/value.js';
			expect(runtimeFiles).toContain(path.join(root, expected));
			const graph = scanRepository(root);
			expect(graph.failures).toEqual([]);
			expect(graph.edges).toContainEqual(
				expect.objectContaining({ from: 'src/features/alpha/contracts.ts', to: expected, typeOnly: false })
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	it('does not treat a declaration as executable but retains erased type-only imports', () => {
		const file = 'src/features/alpha/contracts.ts';
		const available = ['src/features/alpha/value.d.ts'];
		for (const statement of [
			"import type { Value } from './value.js';",
			"export type { Value } from './value.js';",
			"export { type Value } from './value.js';",
			"export type Value = import('./value.js').Value;"
		]) {
			const graph = inspect(file, statement, available);
			expect(graph.failures).toEqual([]);
			expect(graph.edges.map(({ to }) => to)).toEqual(available);
		}
		for (const statement of ["import { value } from './value.js';", "import { type Value } from './value.js';"]) {
			expect(inspect(file, statement, available).failures).toContainEqual({
				file,
				message: 'Unresolved local import: ./value.js'
			});
		}
	});

	it.each(['file', 'directory', 'source-root', 'dangling', 'cycle'])(
		'rejects unsupported %s symlinks explicitly',
		(kind) => {
			const root = mkdtempSync(path.join(tmpdir(), 't3-module-imports-'));
			try {
				mkdirSync(path.join(root, 'src/features/alpha'), { recursive: true });
				writeFileSync(path.join(root, 'src/features/alpha/contracts.ts'), "export { value } from './alias';");
				writeFileSync(path.join(root, 'src/features/alpha/actual.ts'), 'export const value = document.title;');
				let link = 'src/features/alpha/alias.ts';
				let target = 'actual.ts';
				if (kind === 'directory') {
					link = 'src/features/linked';
					target = 'alpha';
				} else if (kind === 'source-root') {
					rmSync(path.join(root, 'src'), { recursive: true });
					mkdirSync(path.join(root, 'actual'));
					link = 'src';
					target = 'actual';
				} else if (kind === 'dangling') target = 'missing.ts';
				else if (kind === 'cycle') target = 'alias.ts';
				symlinkSync(target, path.join(root, link));
				expect(() => scanRepository(root)).toThrow(`Unsupported source symlink: ${link}`);
			} finally {
				rmSync(root, { recursive: true, force: true });
			}
		}
	);
});
