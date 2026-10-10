import { describe, expect, it } from 'vitest';
import { checkModuleBoundaries, type Manifest } from './module-boundaries';
import { buildImportGraph } from './module-imports';

const manifest: Manifest = {
	owners: {
		alpha: { roots: ['src/features/alpha/'], files: [], packet: '08-M04' },
		provider: { roots: ['src/lib/server/'], files: [], packet: '08-M15' },
		'web-ui': { roots: ['src/lib/components/'], files: [], packet: '08-M16' }
	},
	rootExclusions: {},
	dependencies: { alpha: ['web-ui', 'provider'], provider: [], 'web-ui': ['alpha', 'provider'] },
	publicRoots: { 'web-ui': ['src/lib/components/'], alpha: ['src/features/alpha/'], provider: ['src/lib/server/'] },
	publicFiles: {},
	mixedFiles: {}
};

const BUTTON = [
	{ path: 'src/lib/components/ui/button/index.ts', content: "export { default as Button } from './button.svelte';" },
	{
		path: 'src/lib/components/ui/button/button.svelte',
		content: '<script lang="ts">import { Button } from \'bits-ui\';</script>'
	}
];

function foundationFindings(sources: { path: string; content: string }[], resolvable: string[] = []) {
	const paths = sources.map((source) => source.path);
	const graph = buildImportGraph(sources, (candidate) => paths.includes(candidate) || resolvable.includes(candidate));
	return checkModuleBoundaries({ sourcePaths: paths, ...graph }, manifest)
		.filter((violation) => violation.kind.startsWith('foundation-'))
		.map(({ kind, file }) => ({ kind, file }));
}

describe('ui foundation guard', () => {
	it('accepts primitives inside ui and consumers of a family barrel', () => {
		expect(
			foundationFindings([
				...BUTTON,
				{
					path: 'src/features/alpha/Form.svelte',
					content: '<script lang="ts">import { Button } from \'$lib/components/ui/button\';</script><Button />'
				},
				{
					path: 'src/lib/components/patterns/toolbar/toolbar.svelte',
					content: '<script lang="ts">import { Button } from \'$lib/components/ui/button/index.js\';</script>'
				},
				{
					path: 'src/lib/components/patterns/toolbar/index.ts',
					content: "export { default } from './toolbar.svelte';"
				},
				{ path: 'src/lib/components/public/Nav.svelte', content: '<nav></nav>' }
			])
		).toEqual([]);
	});

	it('rejects bits-ui outside components/ui, including from patterns', () => {
		expect(
			foundationFindings([
				{ path: 'src/features/alpha/Menu.svelte', content: "<script>import { Accordion } from 'bits-ui';</script>" },
				{
					path: 'src/lib/components/patterns/menu/menu.svelte',
					content: "<script>import { mergeProps } from 'bits-ui/utils';</script>"
				}
			])
		).toEqual([
			{ kind: 'foundation-package', file: 'src/features/alpha/Menu.svelte' },
			{ kind: 'foundation-package', file: 'src/lib/components/patterns/menu/menu.svelte' }
		]);
	});

	it('rejects a consumer importing a family internal file, including another ui family', () => {
		expect(
			foundationFindings([
				...BUTTON,
				{
					path: 'src/features/alpha/Form.svelte',
					content: '<script lang="ts">import type { Props } from \'$lib/components/ui/button/button.svelte\';</script>'
				},
				{
					path: 'src/lib/components/ui/calendar/calendar.svelte',
					content: '<script lang="ts">import Button from \'../button/button.svelte\';</script>'
				}
			])
		).toEqual([
			{ kind: 'foundation-private', file: 'src/features/alpha/Form.svelte' },
			{ kind: 'foundation-private', file: 'src/lib/components/ui/calendar/calendar.svelte' }
		]);
	});

	it('rejects ui and patterns imports of feature, server and provider code', () => {
		expect(
			foundationFindings([
				{ path: 'src/features/alpha/index.ts', content: 'export const rule = 1;' },
				{ path: 'src/lib/server/db.ts', content: 'export const db = 1;' },
				{
					path: 'src/lib/components/ui/card/card.svelte',
					content: '<script lang="ts">import { rule } from \'$features/alpha\';</script>'
				},
				{
					path: 'src/lib/components/patterns/shell/shell.svelte',
					content: '<script lang="ts">import { db } from \'$lib/server/db\';</script>'
				},
				{ path: 'src/lib/components/ui/card/env.ts', content: "export { PUBLIC_URL } from '$env/static/public';" }
			])
		).toEqual([
			{ kind: 'foundation-layer', file: 'src/lib/components/patterns/shell/shell.svelte' },
			{ kind: 'foundation-layer', file: 'src/lib/components/ui/card/card.svelte' },
			{ kind: 'foundation-layer', file: 'src/lib/components/ui/card/env.ts' }
		]);
	});

	it('rejects raw provider user and session types in shared controls', () => {
		expect(
			foundationFindings([
				{
					path: 'src/lib/components/ui/avatar/avatar.svelte',
					content:
						'<script lang="ts">import type { User } from \'@supabase/supabase-js\'; let { user }: { user: User } = $props();</script>'
				},
				{
					path: 'src/lib/components/patterns/shell/shell.svelte',
					content:
						'<script lang="ts">let { session }: { session: App.PageData[\'session\'] } = $props();</script><p>App.Locals</p>'
				},
				{
					path: 'src/lib/components/ui/avatar/types.ts',
					content: "export type Owner = import('@supabase/supabase-js').User;"
				},
				{
					path: 'src/features/alpha/Account.svelte',
					content: '<script lang="ts">let { user }: { user: App.Locals[\'user\'] } = $props();</script>'
				}
			])
		).toEqual([
			{ kind: 'foundation-provider-type', file: 'src/lib/components/patterns/shell/shell.svelte' },
			{ kind: 'foundation-provider-type', file: 'src/lib/components/ui/avatar/avatar.svelte' },
			{ kind: 'foundation-provider-type', file: 'src/lib/components/ui/avatar/types.ts' }
		]);
	});

	it('rejects a shared component layer beside ui, patterns and public', () => {
		expect(
			foundationFindings([
				{ path: 'src/lib/components/forms/input/input.svelte', content: '<input />' },
				{ path: 'src/lib/components/BannerStack.svelte', content: '<div></div>' }
			])
		).toEqual([{ kind: 'foundation-placement', file: 'src/lib/components/forms/input/input.svelte' }]);
	});

	it('rejects provider types re-exported through a shared helper', () => {
		expect(
			foundationFindings([
				{ path: 'src/lib/hooks/session.ts', content: "export type { User, Session } from '@supabase/supabase-js';" },
				{ path: 'src/lib/hooks/account.ts', content: "export type { User } from './session';" },
				{ path: 'src/lib/hooks/theme.ts', content: 'export const theme = 1;' },
				{
					path: 'src/lib/components/patterns/account/account.svelte',
					content:
						"<script lang=\"ts\">import type { User } from '$lib/hooks/account'; import { theme } from '$lib/hooks/theme'; let { user }: { user: User } = $props();</script>"
				}
			])
		).toEqual([{ kind: 'foundation-provider-type', file: 'src/lib/components/patterns/account/account.svelte' }]);
	});

	it('rejects session types derived from generated route data', () => {
		expect(
			foundationFindings([
				{
					path: 'src/lib/hooks/session.ts',
					content: "import type { LayoutData } from '../../routes/$types'; export type Session = LayoutData['session'];"
				},
				{ path: 'src/routes/+layout.server.ts', content: 'export const load = () => ({});' },
				{
					path: 'src/lib/components/patterns/account/account.svelte',
					content:
						'<script lang="ts">import type { Session } from \'$lib/hooks/session\'; let { session }: { session: Session } = $props();</script>'
				}
			])
		).toEqual([{ kind: 'foundation-provider-type', file: 'src/lib/components/patterns/account/account.svelte' }]);
	});

	it('rejects a patterns family that duplicates a ui primitive family', () => {
		expect(
			foundationFindings([
				...BUTTON,
				{ path: 'src/lib/components/patterns/button/index.ts', content: "export { default } from './button.svelte';" },
				{ path: 'src/lib/components/patterns/button/button.svelte', content: '<button><slot /></button>' }
			])
		).toEqual([{ kind: 'foundation-placement', file: 'src/lib/components/patterns/button/index.ts' }]);
	});

	it('leaves a malformed shared component to the source-graph finding', () => {
		const sources = [
			{ path: 'src/lib/components/ui/card/card.svelte', content: '<script lang="ts">let x = ;</script><div' }
		];
		const graph = buildImportGraph(sources, () => false);
		expect(
			checkModuleBoundaries({ sourcePaths: ['src/lib/components/ui/card/card.svelte'], ...graph }, manifest)
				.filter(({ kind }) => kind === 'source-graph' || kind.startsWith('foundation-'))
				.map(({ kind, file }) => ({ kind, file }))
		).toEqual([{ kind: 'source-graph', file: 'src/lib/components/ui/card/card.svelte' }]);
	});
});
