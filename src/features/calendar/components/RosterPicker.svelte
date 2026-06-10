<script lang="ts">
	import type { Personnel } from '$lib/types';
	import { Badge as UiBadge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import * as DataTable from '$lib/components/ui/data-table';
	import { useDataTable, type ColumnDef, type DataTableSelectionState } from '$lib/components/ui/data-table';

	/**
	 * Roster Picker — the fixed-purpose grouped multi-select over the Roster used by bulk
	 * Calendar workflows. It owns the table configuration, search, whole-Group toggles, and
	 * select-shown/clear affordances; callers supply grouped roster rows and a selection and
	 * read selected people back from that selection. Columns and cells are not configurable.
	 */
	interface GroupData {
		group: string;
		personnel: Personnel[];
	}

	interface Props {
		personnelByGroup: GroupData[];
		selection: DataTableSelectionState<Personnel>;
		eyebrow?: string;
		title?: string;
		copy?: string;
		tone?: 'accent' | 'destructive';
	}

	let {
		personnelByGroup,
		selection,
		eyebrow = 'Step 2',
		title = 'Choose personnel',
		copy = 'Search by name, select an entire group, or click individual rows.',
		tone = 'accent'
	}: Props = $props();

	const allPersonnel = $derived(personnelByGroup.flatMap((g) => g.personnel));

	function mosOrDutyRole(person: Personnel): string {
		return person.mos.trim() || person.clinicRole.trim() || 'N/A';
	}

	const columns: ColumnDef<Personnel>[] = [
		{ key: 'select', header: '', value: () => '', searchable: false },
		{ key: 'rank', header: 'Rank', value: (p) => p.rank },
		{
			key: 'name',
			header: 'Name',
			value: (p) => `${p.lastName}, ${p.firstName}`,
			searchValue: (p) => `${p.lastName} ${p.firstName}`
		},
		{ key: 'mos', header: 'MOS / Duty Role', value: mosOrDutyRole }
	];

	const table = useDataTable<Personnel>({
		data: () => allPersonnel,
		columns,
		groupBy: {
			key: (p) => p.groupName || 'Unassigned'
		},
		filterFn: (p, query) => {
			const q = query.toLowerCase();
			return (
				p.lastName.toLowerCase().includes(q) ||
				p.firstName.toLowerCase().includes(q) ||
				p.rank.toLowerCase().includes(q) ||
				p.mos.toLowerCase().includes(q) ||
				p.clinicRole.toLowerCase().includes(q)
			);
		}
	});

	function visiblePersonnel(): Personnel[] {
		const grouped = table.groups.flatMap((g) => g.rows);
		return grouped.length > 0 ? grouped : table.rows;
	}

	function selectVisible() {
		for (const p of visiblePersonnel()) selection.toggleRow(p, 0, true);
	}

	function selectNone() {
		selection.clear();
	}

	function getGroupSelectionState(groupKey: string): 'none' | 'some' | 'all' {
		const group = table.groups.find((g) => g.key === groupKey);
		if (!group || group.rows.length === 0) return 'none';
		const count = group.rows.filter((p) => selection.isSelected(p, 0)).length;
		if (count === 0) return 'none';
		if (count === group.rows.length) return 'all';
		return 'some';
	}

	function toggleGroup(groupKey: string) {
		const group = table.groups.find((g) => g.key === groupKey);
		if (!group) return;
		const shouldSelect = getGroupSelectionState(groupKey) !== 'all';
		for (const p of group.rows) selection.toggleRow(p, 0, shouldSelect);
	}
</script>

<div class="selection-card">
	<div class="pane-heading selection-heading">
		<span class="pane-eyebrow" data-tone={tone}>{eyebrow}</span>
		<h2 class="pane-title">{title}</h2>
		<p class="pane-copy">{copy}</p>
	</div>

	<div class="personnel-section">
		<DataTable.DataTable
			{columns}
			{table}
			compact
			showSearch
			searchPlaceholder="Search by name, rank, MOS, or role..."
			emptyMessage="No personnel available"
			onRowClick={(person) => selection.toggleRow(person, 0)}
		>
			{#snippet toolbar()}
				<DataTable.BulkActions selectedCount={selection.selectedCount} totalCount={table.totalRows}>
					<Button type="button" variant="outline" size="sm" onclick={selectVisible}>Select shown</Button>
					<Button type="button" variant="outline" size="sm" onclick={selectNone}>Clear</Button>
				</DataTable.BulkActions>
			{/snippet}

			{#snippet groupHeader(ctx)}
				{@const selState = getGroupSelectionState(ctx.key)}
				<DataTable.SelectionCheckbox
					checked={selState === 'all'}
					indeterminate={selState === 'some'}
					ariaLabel={`Select ${ctx.label} group`}
					onCheckedChange={() => toggleGroup(ctx.key)}
				/>
				<Button type="button" variant="ghost" onclick={ctx.toggle}>
					{ctx.collapsed ? 'Expand' : 'Collapse'}
					{ctx.label}
					<UiBadge variant="outline">{ctx.count}</UiBadge>
				</Button>
			{/snippet}

			{#snippet cell(row, col)}
				{#if col.key === 'select'}
					<DataTable.SelectionCheckbox
						checked={selection.isSelected(row, 0)}
						ariaLabel={`Select ${row.rank} ${row.lastName}, ${row.firstName}`}
						onCheckedChange={() => selection.toggleRow(row, 0)}
					/>
				{:else}
					{String(col.value(row) ?? '')}
				{/if}
			{/snippet}
		</DataTable.DataTable>
	</div>
</div>

<style>
	.selection-card {
		display: flex;
		flex-direction: column;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--card);
	}

	.pane-heading {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.selection-heading {
		padding: 1.5rem;
		border-bottom: 1px solid var(--border);
		background: var(--muted);
	}

	.pane-eyebrow {
		font-size: 0.6875rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--accent);
	}

	.pane-eyebrow[data-tone='destructive'] {
		color: var(--destructive);
	}

	.pane-title {
		font-family: 'Barlow Condensed', sans-serif;
		font-size: 1.25rem;
		font-weight: 400;
		line-height: 1.1;
	}

	.pane-copy {
		font-size: 0.75rem;
		color: var(--muted-foreground);
	}

	.personnel-section {
		padding: 0;
	}

	@media (max-width: 640px) {
		.selection-heading {
			padding: 1rem;
		}
	}
</style>
