import { describe, expect, it } from 'vitest';
import { buildImportGraph } from './module-imports';
import { buildInventory, renderInventory } from './ui-inventory';

const SOURCES = [
	{ path: 'src/lib/components/ui/button/index.ts', content: "export { default as Button } from './button.svelte';" },
	{ path: 'src/lib/components/ui/button/button.svelte', content: '<button><slot /></button>' },
	{
		path: 'src/routes/auth/reset-password/+page.svelte',
		content: `<script lang="ts">import { Button } from '$lib/components/ui/button';</script>
<Button>Save</Button>
<button type="button" class="link">Back to sign in</button>
<input type="hidden" name="token" />
<input type="email" />
<style>.link { color: var(--brass); border: 1px solid #c0ffee; }</style>`
	},
	{
		path: 'src/features/calendar/components/GroupHeader.svelte',
		content: '<div role="button" tabindex="0">Alpha</div><table><tbody></tbody></table>'
	},
	{
		path: 'src/features/calendar/calendarRows.test.ts',
		content: "import { Button } from '$lib/components/ui/button';"
	},
	{ path: 'src/routes/admin/+page.svelte', content: '<select><option>One</option></select>' },
	{
		path: 'src/lib/components/public/PublicSiteNav.svelte',
		content: '{#each [] as item}<a href="#top">{item}</a>{/each}'
	},
	{ path: 'src/hooks.client.svelte', content: '<p>stray</p>' },
	{ path: 'src/features/calendar/calendarRows.ts', content: 'export const rows = [];' }
];

function inventory() {
	const paths = SOURCES.map((source) => source.path);
	const { edges } = buildImportGraph(SOURCES, (candidate) => paths.includes(candidate));
	return buildInventory(SOURCES, edges);
}

describe('ui inventory', () => {
	it('lists every Svelte file and family importer with its packet, area and candidates', () => {
		expect(inventory()).toEqual({
			families: ['ui/button'],
			rows: [
				{
					file: 'src/features/calendar/calendarRows.test.ts',
					area: 'app',
					packet: '10-03',
					families: ['ui/button'],
					controls: {},
					styleBlocks: 0,
					cssVariables: {},
					hexLiterals: 0
				},
				{
					file: 'src/features/calendar/components/GroupHeader.svelte',
					area: 'app',
					packet: '10-03',
					families: [],
					controls: { '[role=button]': 1, table: 1 },
					styleBlocks: 0,
					cssVariables: {},
					hexLiterals: 0
				},
				{
					file: 'src/hooks.client.svelte',
					area: 'app',
					packet: 'unclassified',
					families: [],
					controls: {},
					styleBlocks: 0,
					cssVariables: {},
					hexLiterals: 0
				},
				{
					file: 'src/lib/components/public/PublicSiteNav.svelte',
					area: 'public',
					packet: '10-08',
					families: [],
					controls: {},
					styleBlocks: 0,
					cssVariables: {},
					hexLiterals: 0
				},
				{
					file: 'src/lib/components/ui/button/button.svelte',
					area: 'shared',
					packet: 'foundation',
					families: [],
					controls: {},
					styleBlocks: 0,
					cssVariables: {},
					hexLiterals: 0
				},
				{
					file: 'src/routes/admin/+page.svelte',
					area: 'admin',
					packet: '10-07',
					families: [],
					controls: { select: 1 },
					styleBlocks: 0,
					cssVariables: {},
					hexLiterals: 0
				},
				{
					file: 'src/routes/auth/reset-password/+page.svelte',
					area: 'app',
					packet: '10-01',
					families: ['ui/button'],
					controls: { button: 1, input: 1 },
					styleBlocks: 1,
					cssVariables: { '--brass': 1 },
					hexLiterals: 1
				}
			]
		});
	});

	it('renders the same report on every run and keeps unclassified rows visible', () => {
		const first = renderInventory(inventory());
		expect(renderInventory(inventory())).toBe(first);
		expect(first).toContain('Unclassified rows: 1.');
		expect(first).toContain('## unclassified');
		expect(first).toContain('`src/hooks.client.svelte`');
		expect(first).toContain('| `ui/button` | 2 | 0 | 0 | 0 | `10-01`×1, `10-03`×1 |');
	});
});
