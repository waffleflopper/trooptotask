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
	{ path: 'src/features/calendar/test-support/DatePickerStub.svelte', content: '<input type="date" />' },
	{ path: 'src/features/calendar/calendarRows.ts', content: 'export const rows = [];' }
];

const GROUP_HEADER = 'src/features/calendar/components/GroupHeader.svelte';

function inventory(exceptions = {}) {
	const paths = SOURCES.map((source) => source.path);
	const { edges } = buildImportGraph(SOURCES, (candidate) => paths.includes(candidate));
	return buildInventory(SOURCES, edges, exceptions);
}

const dispositionOf = (file: string, exceptions = {}) =>
	inventory(exceptions).rows.find((row) => row.file === file)?.disposition;

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
					hexLiterals: 0,
					disposition: { kind: 'test support' }
				},
				{
					file: 'src/features/calendar/components/GroupHeader.svelte',
					area: 'app',
					packet: '10-03',
					families: [],
					controls: { '[role=button]': 1, table: 1 },
					styleBlocks: 0,
					cssVariables: {},
					hexLiterals: 0,
					disposition: { kind: 'open' }
				},
				{
					file: 'src/features/calendar/test-support/DatePickerStub.svelte',
					area: 'app',
					packet: '10-03',
					families: [],
					controls: { input: 1 },
					styleBlocks: 0,
					cssVariables: {},
					hexLiterals: 0,
					disposition: { kind: 'test support' }
				},
				{
					file: 'src/hooks.client.svelte',
					area: 'app',
					packet: 'unclassified',
					families: [],
					controls: {},
					styleBlocks: 0,
					cssVariables: {},
					hexLiterals: 0,
					disposition: { kind: 'complete' }
				},
				{
					file: 'src/lib/components/public/PublicSiteNav.svelte',
					area: 'public',
					packet: '10-08',
					families: [],
					controls: {},
					styleBlocks: 0,
					cssVariables: {},
					hexLiterals: 0,
					disposition: { kind: 'complete' }
				},
				{
					file: 'src/lib/components/ui/button/button.svelte',
					area: 'shared',
					packet: 'foundation',
					families: [],
					controls: {},
					styleBlocks: 0,
					cssVariables: {},
					hexLiterals: 0,
					disposition: { kind: 'complete' }
				},
				{
					file: 'src/routes/admin/+page.svelte',
					area: 'admin',
					packet: '10-07',
					families: [],
					controls: { select: 1 },
					styleBlocks: 0,
					cssVariables: {},
					hexLiterals: 0,
					disposition: { kind: 'open' }
				},
				{
					file: 'src/routes/auth/reset-password/+page.svelte',
					area: 'app',
					packet: '10-01',
					families: ['ui/button'],
					controls: { button: 1, input: 1 },
					styleBlocks: 1,
					cssVariables: { '--brass': 1 },
					hexLiterals: 1,
					disposition: { kind: 'open' }
				}
			],
			unusedExceptions: []
		});
	});

	it('shows a row as native only while its candidates match the recorded signature', () => {
		const reason = 'Virtualized group rows need a native row element.';
		expect(
			dispositionOf(GROUP_HEADER, { [GROUP_HEADER]: { covers: { table: 1, '[role=button]': 1 }, reason } })
		).toEqual({ kind: 'native', reason });
		expect(
			dispositionOf(GROUP_HEADER, { [GROUP_HEADER]: { covers: { table: 2, '[role=button]': 1 }, reason } })
		).toEqual({ kind: 'open' });
		expect(dispositionOf(GROUP_HEADER, { [GROUP_HEADER]: { covers: { table: 1 }, reason } })).toEqual({ kind: 'open' });
	});

	it('classifies test harnesses by path whatever their candidates', () => {
		expect(dispositionOf('src/features/calendar/test-support/DatePickerStub.svelte')).toEqual({ kind: 'test support' });
		expect(dispositionOf('src/features/calendar/calendarRows.test.ts')).toEqual({ kind: 'test support' });
	});

	it('reports a recorded exception whose row no longer has candidates', () => {
		const exceptions = { 'src/routes/admin/+page.svelte': { covers: { select: 1 }, reason: 'Posts natively.' } };
		expect(
			inventory({ ...exceptions, 'src/hooks.client.svelte': { covers: { button: 1 }, reason: 'Gone.' } })
		).toMatchObject({ unusedExceptions: ['src/hooks.client.svelte'] });
	});

	it('renders the same report on every run and keeps unclassified rows visible', () => {
		const first = renderInventory(inventory());
		expect(renderInventory(inventory())).toBe(first);
		expect(first).toContain('Open rows: 3. Unclassified rows: 1. Unused native exceptions: 0.');
		expect(first).toContain('| `src/routes/admin/+page.svelte` | admin | · | `select`×1 | · | · | · | **OPEN** |');
		expect(first).toContain('## unclassified');
		expect(first).toContain('`src/hooks.client.svelte`');
		expect(first).toContain('| `ui/button` | 2 | 0 | 0 | 0 | `10-01`×1, `10-03`×1 |');
	});
});
