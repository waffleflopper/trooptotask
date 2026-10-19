<script lang="ts">
	import type { Personnel } from '$features/personnel/contracts';
	import { Badge as UiBadge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import * as DataTable from '$lib/components/ui/data-table';
	import { WorkspaceToolbar, type ToolbarItem } from '$lib/components/patterns/workspace-toolbar';
	import { useDataTable, type ColumnDef, type DataTableSelectionState } from '$lib/components/ui/data-table';
	import { rosterAvailabilityRow, type BulkRosterAvailability } from '$features/calendar/utils/bulkRosterAvailability';
	import BulkStepHeading from './BulkStepHeading.svelte';
	import { AvailabilityStrip } from '$lib/components/patterns/calendar-bars';

	/**
	 * Roster Picker — the fixed-purpose grouped multi-select over the Roster used by bulk
	 * Calendar workflows. It owns the table configuration, search, whole-Group toggles, and
	 * select-shown/clear affordances; callers supply grouped roster rows and a selection and
	 * read selected people back from that selection. Columns and cells are not configurable.
	 *
	 * With an `availability` projection the picker also shows each person's existing entries,
	 * disables the people the projection blocks, and offers "Select available". Every way of
	 * selecting a person checks eligibility here, because the selection state does not.
	 * `disabled` freezes the selection, for example while it is being saved.
	 */
	interface GroupData {
		group: string;
		personnel: Personnel[];
	}

	interface Props {
		personnelByGroup: GroupData[];
		selection: DataTableSelectionState<Personnel>;
		tone?: 'accent' | 'destructive';
		availability?: BulkRosterAvailability;
		disabled?: boolean;
	}

	let { personnelByGroup, selection, tone = 'accent', availability, disabled = false }: Props = $props();

	const hintIdPrefix = $props.id();

	const allPersonnel = $derived(personnelByGroup.flatMap((g) => g.personnel));

	function mosOrDutyRole(person: Personnel): string {
		return person.mos.trim() || person.clinicRole.trim() || 'N/A';
	}

	const columns: ColumnDef<Personnel>[] = [
		{ key: 'select', header: '', value: () => '', searchable: false, sortable: false },
		{ key: 'rank', header: 'Rank', value: (p) => p.rank },
		{
			key: 'name',
			header: 'Name',
			value: (p) => `${p.lastName}, ${p.firstName}`,
			searchValue: (p) => `${p.lastName} ${p.firstName}`
		},
		{ key: 'mos', header: 'MOS / Duty Role', value: mosOrDutyRole }
	];
	const availabilityColumn: ColumnDef<Personnel> = {
		key: 'availability',
		header: 'Availability',
		value: () => '',
		searchable: false,
		sortable: false,
		align: 'right',
		maxWidth: 'none'
	};
	const tableColumns = $derived(availability ? [...columns, availabilityColumn] : columns);

	function isBlocked(person: Personnel): boolean {
		return availability ? rosterAvailabilityRow(availability, person.id).blocked : false;
	}

	const table = useDataTable<Personnel>({
		data: () => allPersonnel,
		columns: () => tableColumns,
		disabledRow: isBlocked,
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

	function setSelected(person: Personnel, selected?: boolean) {
		if (disabled) return;
		const next = selected ?? !selection.isSelected(person, 0);
		if (next && isBlocked(person)) return;
		selection.toggleRow(person, 0, next);
	}

	function selectShown() {
		for (const p of visiblePersonnel()) setSelected(p, true);
	}

	function selectAvailable() {
		if (!availability) return;
		for (const p of visiblePersonnel()) {
			if (rosterAvailabilityRow(availability, p.id).kind === 'available') setSelected(p, true);
		}
	}

	function selectNone() {
		if (!disabled) selection.clear();
	}

	const toolbarItems = $derived<ToolbarItem[]>([
		availability
			? { kind: 'action', id: 'select-available', label: 'Select available', onclick: selectAvailable, disabled }
			: { kind: 'action', id: 'select-shown', label: 'Select shown', onclick: selectShown, disabled },
		{ kind: 'action', id: 'clear', label: 'Clear', onclick: selectNone, disabled }
	]);

	const groupStates = $derived(
		new Map(
			table.groups.map((group) => {
				const enabled = group.rows.filter((p) => !isBlocked(p));
				const selected = enabled.filter((p) => selection.isSelected(p, 0)).length;
				const state: 'none' | 'some' | 'all' = selected === 0 ? 'none' : selected === enabled.length ? 'all' : 'some';
				return [group.key, { state, enabled, selected, total: group.rows.length }] as const;
			})
		)
	);

	function toggleGroup(groupKey: string) {
		const group = groupStates.get(groupKey);
		if (!group) return;
		const shouldSelect = group.state !== 'all';
		for (const p of group.enabled) setSelected(p, shouldSelect);
	}

	const selectedCount = $derived(
		availability
			? allPersonnel.filter((p) => selection.isSelected(p, 0) && !isBlocked(p)).length
			: selection.selectedCount
	);

	function hintId(person: Personnel): string {
		return `${hintIdPrefix}-hint-${person.id}`;
	}
</script>

<Card.Root>
	<Card.Header>
		<BulkStepHeading eyebrow="Step 2" {tone} title="Who" />
		<p class="text-sm text-muted-foreground">{selectedCount} of {table.totalRows} selected</p>
		<WorkspaceToolbar
			ariaLabel="Roster picker controls"
			items={toolbarItems}
			search={{
				label: 'Search by name, rank, MOS, or role...',
				placeholder: 'Search by name, rank, MOS, or role...',
				value: table.search,
				onValueChange: (value) => table.setSearch(value)
			}}
		/>
	</Card.Header>

	<DataTable.DataTable
		columns={tableColumns}
		{table}
		compact
		emptyMessage="No personnel available"
		onRowClick={(person) => setSelected(person)}
		headerCell={availability ? availabilityHeader : undefined}
	>
		{#snippet groupHeader(ctx)}
			{@const group = groupStates.get(ctx.key)}
			<DataTable.SelectionCheckbox
				checked={group?.state === 'all'}
				indeterminate={group?.state === 'some'}
				disabled={disabled || group?.enabled.length === 0}
				ariaLabel={`Select ${ctx.label} group`}
				onCheckedChange={() => toggleGroup(ctx.key)}
			/>
			<Button type="button" variant="ghost" onclick={ctx.toggle}>
				{ctx.collapsed ? 'Expand' : 'Collapse'}
				{ctx.label}
				<UiBadge variant="outline">{ctx.count}</UiBadge>
			</Button>
			{#if availability && group}
				<span class="ml-auto font-mono text-xs tracking-[0.08em] text-muted-foreground uppercase">
					{group.selected} of {group.total}
				</span>
			{/if}
		{/snippet}

		{#snippet cell(row, col)}
			{#if col.key === 'select'}
				{@const projected = availability ? rosterAvailabilityRow(availability, row.id) : null}
				<DataTable.SelectionCheckbox
					checked={selection.isSelected(row, 0) && !projected?.blocked}
					disabled={disabled || projected?.blocked}
					describedBy={projected?.hint ? hintId(row) : undefined}
					ariaLabel={`Select ${row.rank} ${row.lastName}, ${row.firstName}`}
					onCheckedChange={(checked) => setSelected(row, checked)}
				/>
			{:else if col.key === 'availability' && availability}
				{@const projected = rosterAvailabilityRow(availability, row.id)}
				{#if projected.hint}
					<div class="flex items-center justify-end gap-3">
						<span
							id={hintId(row)}
							class={[
								'max-w-80 min-w-48 text-right font-mono text-[10px] leading-snug tracking-[0.06em] text-balance uppercase',
								projected.blocked ? 'text-danger-foreground' : 'text-warning-foreground'
							]}
						>
							{projected.hint}
						</span>
						{#if availability.window}
							<AvailabilityStrip days={availability.window.days} layout={projected.bars} />
						{/if}
					</div>
				{:else if availability.window}
					<AvailabilityStrip days={availability.window.days} layout={projected.bars} />
				{/if}
			{:else}
				{String(col.value(row) ?? '')}
			{/if}
		{/snippet}
	</DataTable.DataTable>
</Card.Root>

{#snippet availabilityHeader(column: ColumnDef<Personnel>)}
	{#if column.key === 'availability' && availability}
		{#if availability.window}
			<div class="flex justify-end">
				<div
					class="grid shrink-0 font-mono text-[10px] leading-tight font-semibold tracking-normal text-muted-foreground"
					style:grid-template-columns="repeat({availability.window.days}, minmax(0, 1fr))"
					style:width="{availability.window.days * 1.625}rem"
				>
					{#each availability.headings as heading (heading.key)}
						<span class="flex flex-col items-center" title={heading.label} aria-label={heading.label}>
							<span aria-hidden="true">{heading.weekday}</span>
							<span aria-hidden="true" class="text-foreground">{heading.day}</span>
						</span>
					{/each}
				</div>
			</div>
		{:else}
			<span class="inline-flex h-8 items-center">{column.header}</span>
		{/if}
	{:else if column.sortable === false}
		<span aria-label={column.headerAriaLabel} class="inline-flex h-8 items-center">{column.header}</span>
	{:else}
		<DataTable.SortableHeader {table} {column} />
	{/if}
{/snippet}
