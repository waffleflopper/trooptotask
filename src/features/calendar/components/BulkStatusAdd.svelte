<script lang="ts">
	import type { Personnel, StatusType } from '$lib/types';
	import { formatDate } from '$lib/utils/dates';
	import { toastStore } from '$lib/stores/toast.svelte';
	import { CalendarStatusBadge } from '$lib/components/ui/calendar-status-badge';
	import { Badge as UiBadge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import * as DataTable from '$lib/components/ui/data-table';
	import { useDataTable, type ColumnDef } from '$lib/components/ui/data-table';
	import { DatePicker } from '$lib/components/ui/date-picker';
	import * as Field from '$lib/components/ui/field';
	import { Input } from '$lib/components/ui/input';
	import { NativeSelect } from '$lib/components/ui/native-select';
	import { Spinner } from '$lib/components/ui/spinner';
	import { SvelteSet } from 'svelte/reactivity';

	interface GroupData {
		group: string;
		personnel: Personnel[];
	}

	interface Props {
		personnelByGroup: GroupData[];
		statusTypes: StatusType[];
		onApply: (
			personnelIds: string[],
			statusTypeId: string,
			startDate: string,
			endDate: string,
			note: string | null
		) => Promise<void>;
		onComplete: () => void;
	}

	let { personnelByGroup, statusTypes, onApply, onComplete }: Props = $props();

	const todayStr = formatDate(new Date());
	let selectedStatusId = $state('');
	let startDate = $state(todayStr);
	let endDate = $state(todayStr);
	const selectedIds = new SvelteSet<string>();
	let isSubmitting = $state(false);
	let note = $state('');
	let step = $state<'select' | 'confirm'>('select');

	const allPersonnel = $derived(personnelByGroup.flatMap((g) => g.personnel));

	// ---- DataTable setup ----
	const columns: ColumnDef<Personnel>[] = [
		{ key: 'select', header: '', value: () => '', searchable: false },
		{ key: 'rank', header: 'Rank', value: (p) => p.rank },
		{
			key: 'name',
			header: 'Name',
			value: (p) => `${p.lastName}, ${p.firstName}`,
			searchValue: (p) => `${p.lastName} ${p.firstName}`
		},
		{ key: 'mos', header: 'MOS / Duty Role', value: (p) => p.mos || p.clinicRole }
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

	// ---- Selection logic ----
	function togglePerson(id: string) {
		if (selectedIds.has(id)) selectedIds.delete(id);
		else selectedIds.add(id);
	}

	function getVisiblePersonnelIds(): string[] {
		const groupedIds = table.groups.flatMap((g) => g.rows.map((p) => p.id));
		return groupedIds.length > 0 ? groupedIds : table.rows.map((p) => p.id);
	}

	function selectVisible() {
		for (const id of getVisiblePersonnelIds()) selectedIds.add(id);
	}

	function selectNone() {
		selectedIds.clear();
	}

	function getGroupSelectionState(groupKey: string): 'none' | 'some' | 'all' {
		const group = table.groups.find((g) => g.key === groupKey);
		if (!group || group.rows.length === 0) return 'none';
		const count = group.rows.filter((p) => selectedIds.has(p.id)).length;
		if (count === 0) return 'none';
		if (count === group.rows.length) return 'all';
		return 'some';
	}

	function toggleGroup(groupKey: string) {
		const group = table.groups.find((g) => g.key === groupKey);
		if (!group) return;
		const state = getGroupSelectionState(groupKey);
		if (state === 'all') {
			for (const p of group.rows) selectedIds.delete(p.id);
		} else {
			for (const p of group.rows) selectedIds.add(p.id);
		}
	}

	// ---- Validation ----
	const dateError = $derived.by(() => {
		if (startDate && endDate && startDate > endDate) return 'End date must be on or after start date';
		return null;
	});

	const dayCount = $derived.by(() => {
		if (!startDate || !endDate || startDate > endDate) return 0;
		const start = new Date(startDate);
		const end = new Date(endDate);
		return Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
	});

	const isValid = $derived(selectedStatusId && startDate && endDate && startDate <= endDate && selectedIds.size > 0);
	const selectedStatus = $derived(statusTypes.find((s) => s.id === selectedStatusId));
	const selectedPersonnel = $derived(
		allPersonnel
			.filter((p) => selectedIds.has(p.id))
			.sort((a, b) => (a.groupName || '').localeCompare(b.groupName || '') || a.lastName.localeCompare(b.lastName))
	);

	$effect(() => {
		if (!selectedStatusId && statusTypes.length > 0) {
			selectedStatusId = statusTypes[0].id;
		}
	});

	function formatDateDisplay(dateStr: string): string {
		const date = new Date(dateStr + 'T00:00:00');
		return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
	}

	function handleReview() {
		if (!isValid) return;
		step = 'confirm';
	}

	function handleBack() {
		step = 'select';
	}

	async function handleSubmit() {
		if (!isValid || isSubmitting) return;
		isSubmitting = true;
		try {
			await onApply([...selectedIds], selectedStatusId, startDate, endDate, note.trim() || null);
			const count = selectedIds.size;
			toastStore.success(`Applied status to ${count} ${count === 1 ? 'person' : 'people'}`);
			selectedIds.clear();
			step = 'select';
			onComplete();
		} finally {
			isSubmitting = false;
		}
	}
</script>

<div class="bulk-add-panel">
	{#if step === 'select'}
		<div class="bulk-workspace">
			<aside class="controls-column">
				<section class="controls-card">
					<div class="pane-heading">
						<span class="pane-eyebrow">Step 1</span>
						<h2 class="pane-title">Define the status change</h2>
						<p class="pane-copy">Set the status and date range first, then choose who it should apply to.</p>
					</div>

					<div class="config-grid">
						<Field.Root>
							<Field.Label for="statusType">Status Type</Field.Label>
							<NativeSelect id="statusType" bind:value={selectedStatusId}>
								{#each statusTypes as status (status.id)}
									<option value={status.id}>{status.name}</option>
								{/each}
							</NativeSelect>
							{#if selectedStatus}
								<div class="status-summary-support">
									<CalendarStatusBadge statusType={selectedStatus}>{selectedStatus.name}</CalendarStatusBadge>
									<span class="status-summary-hint">Selected status</span>
								</div>
							{/if}
						</Field.Root>

						<div class="date-grid">
							<Field.Root>
								<Field.Label for="startDate">Start Date</Field.Label>
								<DatePicker id="startDate" bind:value={startDate} placeholder="Select start date" />
							</Field.Root>

							<Field.Root>
								<Field.Label for="endDate">End Date</Field.Label>
								<DatePicker id="endDate" bind:value={endDate} placeholder="Select end date" />
								{#if dayCount > 0}
									<div class="status-summary-support">
										<span class="day-count-number">{dayCount}</span>
										<span class="status-summary-hint">{dayCount === 1 ? 'day selected' : 'days selected'}</span>
									</div>
								{/if}
							</Field.Root>
						</div>

						{#if dateError}
							<div id="date-error" class="date-error" role="alert">{dateError}</div>
						{/if}

						<Field.Root>
							<Field.Label for="bulkNote">Note</Field.Label>
							<Input
								id="bulkNote"
								type="text"
								bind:value={note}
								maxlength={200}
								placeholder="Optional note (e.g., JRTC rotation)"
							/>
						</Field.Root>
					</div>

					<div class="summary-card" aria-live="polite">
						<h3 class="summary-heading">Ready to apply</h3>
						{#if selectedIds.size > 0 && selectedStatus && !dateError}
							<div class="summary-line">
								<CalendarStatusBadge statusType={selectedStatus}>{selectedStatus.name}</CalendarStatusBadge>
								<span class="summary-copy">
									<strong>{selectedIds.size}</strong>
									{selectedIds.size === 1 ? 'person' : 'people'}
									selected
								</span>
							</div>
							<p class="summary-copy">
								{#if startDate === endDate}
									{formatDateDisplay(startDate)}
								{:else}
									{formatDateDisplay(startDate)} to {formatDateDisplay(endDate)}
								{/if}
							</p>
						{:else if selectedIds.size === 0}
							<p class="summary-copy muted">Choose at least one person from the list to enable the bulk update.</p>
						{:else if dateError}
							<p class="summary-copy error">{dateError}</p>
						{/if}
					</div>

					<Button class="apply-button" disabled={!isValid} onclick={handleReview}>Review & Confirm</Button>
				</section>
			</aside>

			<section class="selection-column">
				<div class="selection-card">
					<div class="pane-heading selection-heading">
						<span class="pane-eyebrow">Step 2</span>
						<h2 class="pane-title">Choose personnel</h2>
						<p class="pane-copy">Search by name, select an entire group, or click individual rows.</p>
					</div>

					<div class="personnel-section">
						<DataTable.DataTable
							{columns}
							{table}
							compact
							showSearch
							searchPlaceholder="Search by name, rank, MOS, or role..."
							emptyMessage="No personnel available"
							onRowClick={(person) => togglePerson(person.id)}
						>
							{#snippet toolbar()}
								<DataTable.BulkActions selectedCount={selectedIds.size} totalCount={table.totalRows}>
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
										checked={selectedIds.has(row.id)}
										ariaLabel={`Select ${row.rank} ${row.lastName}, ${row.firstName}`}
										onCheckedChange={() => togglePerson(row.id)}
									/>
								{:else}
									{String(col.value(row) ?? '')}
								{/if}
							{/snippet}
						</DataTable.DataTable>
					</div>
				</div>
			</section>
		</div>
	{:else}
		<div class="confirm-stage">
			<section class="confirm-card">
				<div class="pane-heading confirm-heading">
					<span class="pane-eyebrow">Review</span>
					<h2 class="pane-title">Confirm status change</h2>
					<p class="pane-copy">
						Review exactly who will be affected before applying. Nothing changes until you confirm.
					</p>
				</div>

				<div class="confirm-criteria">
					{#if selectedStatus}
						<CalendarStatusBadge statusType={selectedStatus}>{selectedStatus.name}</CalendarStatusBadge>
					{/if}
					<UiBadge variant="outline">{selectedIds.size} {selectedIds.size === 1 ? 'person' : 'people'}</UiBadge>
					<UiBadge variant="outline">
						{startDate === endDate
							? formatDateDisplay(startDate)
							: `${formatDateDisplay(startDate)} to ${formatDateDisplay(endDate)}`}
					</UiBadge>
					{#if note.trim()}
						<UiBadge variant="outline">Note: {note.trim()}</UiBadge>
					{/if}
				</div>

				<div class="confirm-content">
					<div class="personnel-list">
						{#each selectedPersonnel as person (person.id)}
							<div class="personnel-item">
								<span class="person-rank">{person.rank}</span>
								<span class="person-name">{person.lastName}, {person.firstName}</span>
								{#if person.groupName}
									<span class="person-group">{person.groupName}</span>
								{/if}
							</div>
						{/each}
					</div>
				</div>

				<div class="confirm-footer">
					<Button variant="outline" onclick={handleBack} disabled={isSubmitting}>Back</Button>
					<div class="confirm-footer-fill"></div>
					<Button disabled={isSubmitting} onclick={handleSubmit}>
						{#if isSubmitting}
							<Spinner />
							Applying...
						{:else}
							Confirm Apply
						{/if}
					</Button>
				</div>
			</section>
		</div>
	{/if}
</div>

<style>
	.bulk-add-panel {
		padding: 0;
	}

	.bulk-workspace {
		display: grid;
		grid-template-columns: minmax(320px, 380px) minmax(0, 1fr);
		gap: 1.5rem;
		align-items: start;
	}

	.controls-column,
	.selection-column {
		min-width: 0;
	}

	.controls-column {
		align-self: start;
		position: sticky;
		top: calc(var(--app-shell-header-height, 56px) + 1.5rem);
	}

	.controls-card,
	.selection-card {
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--card);
	}

	.controls-card {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
		padding: 1.5rem;
	}

	.selection-card {
		display: flex;
		flex-direction: column;
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

	.config-grid {
		display: grid;
		gap: 1rem;
	}

	.date-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 1rem;
		align-items: start;
	}

	.day-count-number {
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--accent);
	}

	.date-error {
		color: var(--destructive);
		font-size: 0.75rem;
		padding: 0.25rem 0.5rem;
		background: color-mix(in srgb, var(--destructive) 12%, transparent);
		border-radius: var(--radius);
	}

	.summary-card {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding: 1rem;
		border-radius: var(--radius);
		background: var(--muted);
		border: 1px solid var(--border);
	}

	.summary-heading {
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--muted-foreground);
	}

	.summary-line {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.summary-copy {
		font-size: 0.75rem;
		color: var(--foreground);
	}

	.summary-copy strong {
		font-weight: 700;
	}

	.summary-copy.muted {
		color: var(--muted-foreground);
	}

	.summary-copy.error {
		color: var(--destructive);
	}

	.personnel-section {
		padding: 0;
	}

	.personnel-section :global(.data-table) {
		border: none;
		border-radius: 0;
		overflow: visible;
	}

	.person-rank {
		font-weight: 600;
		color: var(--accent);
	}

	/* Confirm stage */
	.confirm-stage {
		padding: 0.5rem 0;
	}

	.confirm-card {
		max-width: 980px;
		margin: 0 auto;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--card);
		overflow: hidden;
	}

	.confirm-heading {
		padding: 1.5rem;
		border-bottom: 1px solid var(--border);
		background: var(--muted);
	}

	.confirm-criteria {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.5rem;
		padding: 1rem 1.5rem;
		border-bottom: 1px solid var(--border);
		background: var(--muted);
	}

	.confirm-content {
		padding: 1.5rem;
		min-height: 120px;
	}

	.personnel-list {
		max-height: 320px;
		overflow-y: auto;
		border: 1px solid var(--border);
		border-radius: var(--radius);
	}

	.personnel-item {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.5rem 1rem;
		font-size: 0.75rem;
		border-bottom: 1px solid var(--border);
	}

	.personnel-item:last-child {
		border-bottom: none;
	}

	.person-name {
		flex: 1;
		font-weight: 500;
	}

	.person-group {
		color: var(--muted-foreground);
		font-family: 'IBM Plex Mono', monospace;
		font-size: 0.6875rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}

	.confirm-footer {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 1rem 1.5rem;
		border-top: 1px solid var(--border);
		background: var(--card);
	}

	.confirm-footer-fill {
		flex: 1;
	}

	@media (max-width: 1100px) {
		.bulk-add-panel {
			padding: 0;
		}

		.bulk-workspace {
			grid-template-columns: 1fr;
		}

		.controls-column {
			position: static;
		}
	}

	@media (max-width: 640px) {
		.controls-card,
		.selection-heading {
			padding: 1rem;
		}

		.date-grid {
			grid-template-columns: 1fr;
		}

		.confirm-heading,
		.confirm-content,
		.confirm-criteria,
		.confirm-footer {
			padding-left: 1rem;
			padding-right: 1rem;
		}

		.confirm-footer {
			align-items: flex-start;
		}

		.personnel-item {
			flex-wrap: wrap;
			gap: 0.25rem;
		}
	}
</style>
