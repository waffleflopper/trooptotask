import { describe, expect, it } from 'vitest';
import { auditEmptyTitleLevels, renderRows } from './empty-title-levels';

const IMPORTS = `<script lang="ts">
	import * as Empty from '$lib/components/ui/empty';
	import * as DataTable from '$lib/components/ui/data-table';
	import * as ReportWorkspace from '$lib/components/patterns/report-workspace';
	import * as Card from '$lib/components/ui/card';
</script>`;

function audit(markup: string) {
	return auditEmptyTitleLevels([{ path: 'src/routes/x/+page.svelte', content: `${IMPORTS}\n${markup}` }]);
}

describe('empty title levels', () => {
	it('reads the rendered level and the nearest preceding heading, with the default level when none is given', () => {
		const [row] = audit('<h1>Page</h1>\n<Empty.Title>Nothing</Empty.Title>');

		expect(row).toMatchObject({ caller: 'Empty.Title', level: 2, status: 'ok', enclosing: { level: 1, via: '<h1>' } });
	});

	it('flags a title that skips a level and one that is not below its section heading', () => {
		const rows = audit(
			'<h1>Page</h1>\n<Empty.Title level={4}>Deep</Empty.Title>\n<Card.Title>Card</Card.Title>\n<Empty.Title>Flat</Empty.Title>'
		);

		expect(rows.map((row) => [row.level, row.enclosing?.level, row.status])).toEqual([
			[4, 1, 'skips'],
			[2, 3, 'misfit']
		]);
	});

	it('ignores a heading that lives in the other branch of an if block', () => {
		const [row] = audit('<h1>Page</h1>{#if open}<h3>Detail</h3>{:else}<Empty.Title>Pick one</Empty.Title>{/if}');

		expect(row).toMatchObject({ level: 2, status: 'ok', enclosing: { level: 1 } });
	});

	it('reports the data table default, a forwarded prop, and a report state only when it has no data', () => {
		const rows = audit(
			[
				'<DataTable.DataTable data={[]} columns={[]} />',
				'<DataTable.DataTable data={[]} columns={[]} emptyLevel={4} />',
				'<DataTable.DataTable data={[]} columns={[]} {emptyLevel} />',
				'<ReportWorkspace.State state="no-data" title="None" />',
				'<ReportWorkspace.State state="loading" title="Wait" />',
				'<ReportWorkspace.State state="no-data" level={2} title="None" />'
			].join('\n')
		);

		expect(rows.map((row) => [row.caller, row.level, row.status])).toEqual([
			['DataTable.DataTable', 3, 'inherited'],
			['DataTable.DataTable', 4, 'inherited'],
			['DataTable.DataTable', 'prop', 'plumbing'],
			['ReportWorkspace.State', 4, 'inherited'],
			['ReportWorkspace.State', 2, 'inherited']
		]);
	});

	it('renders one table row per caller', () => {
		expect(renderRows(audit('<h1>Page</h1><Empty.Title>None</Empty.Title>'))).toContain(
			'| `src/routes/x/+page.svelte:7` `Empty.Title` | h2 | h1 `<h1>` (line 7) | ok |'
		);
	});
});
