<script lang="ts" module>
	import type { ColumnDef } from '$lib/components/ui/data-table';
	import type { TrainingBriefingDetailRow } from '../contracts';
	import { formatDisplayDate } from '$lib/utils/dates';

	const PAGE_SIZES = [25, 100] as const;

	const COLUMNS: ColumnDef<TrainingBriefingDetailRow>[] = [
		{ key: 'rank', header: 'Rank', value: (row) => row.rank, sortable: false },
		{ key: 'name', header: 'Name', value: (row) => row.name, sortable: false },
		{ key: 'group', header: 'Group', value: (row) => row.groupName, sortable: false },
		{ key: 'type', header: 'Training type', value: (row) => row.typeName, sortable: false },
		{ key: 'status', header: 'Status today', value: (row) => row.label, sortable: false, width: '8.5rem' },
		{
			key: 'expiration',
			header: 'Expiration date',
			value: (row) => formatDisplayDate(row.expirationDate),
			sortable: false
		},
		{
			key: 'lapses',
			header: 'Lapses in horizon',
			value: (row) => (row.lapsesInHorizon ? 'Yes' : 'No'),
			sortable: false
		}
	];
</script>

<script lang="ts">
	import * as DataTable from '$lib/components/ui/data-table';
	import type { DataTableState } from '$lib/components/ui/data-table';
	import * as ReportWorkspace from '$lib/components/ui/report-workspace';
	import * as ToggleGroup from '$lib/components/ui/toggle-group';
	import type { BriefingScope } from '../contracts';
	import type { BriefingDetailState } from '../read-model/trainingBriefingSession.svelte';
	import TrainingStatusCell from './TrainingStatusCell.svelte';

	interface Props {
		id: string;
		detail: Exclude<BriefingDetailState, { status: 'idle' }>;
		horizonEndLabel: string;
		scopeLabel: (scope: BriefingScope) => string;
		onPage: (page: number) => void;
		onPageSize: (pageSize: number) => void;
		onRetry: () => void;
	}

	let { id, detail, horizonEndLabel, scopeLabel, onPage, onPageSize, onRetry }: Props = $props();

	const shown = $derived(detail.detail);

	let pager: HTMLButtonElement | null = null;

	function showPage(page: number): void {
		pager = document.activeElement instanceof HTMLButtonElement ? document.activeElement : null;
		onPage(page);
	}

	$effect(() => {
		if (!shown || !pager) return;
		const active = document.activeElement;
		if ((pager.disabled || !pager.isConnected) && (active === pager || active === document.body))
			document.getElementById(id)?.focus();
		pager = null;
	});
	const summary = $derived.by(() => {
		if (!shown) return null;
		const count = shown.totalRows;
		return `${scopeLabel(shown.scope)}: ${count} ${count === 1 ? 'requirement' : 'requirements'} not ready or lapsing by ${horizonEndLabel}.`;
	});
	const range = $derived.by(() => {
		if (!shown || shown.rows.length === 0) return null;
		const first = (shown.page - 1) * shown.pageSize + 1;
		return `Rows ${first}–${first + shown.rows.length - 1} of ${shown.totalRows}`;
	});
	const pending = $derived.by(() => {
		if (detail.status !== 'loading') return '';
		if (!shown) return 'Loading affected soldiers';
		return detail.request.pageSize === shown.pageSize
			? `Loading page ${detail.request.page}`
			: `Loading ${detail.request.pageSize} rows per page`;
	});

	const table = $derived.by((): DataTableState<TrainingBriefingDetailRow> => {
		const rows = shown?.rows ?? [];
		return {
			columns: COLUMNS,
			rows,
			allRows: rows,
			groups: [],
			totalRows: shown?.totalRows ?? 0,
			totalPages: shown?.totalPages ?? 1,
			sortKey: null,
			sortDirection: 'asc',
			toggleSort: () => {},
			search: '',
			setSearch: () => {},
			page: shown?.page ?? detail.request.page,
			pageSize: shown?.pageSize ?? detail.request.pageSize,
			setPage: showPage,
			setPageSize: onPageSize,
			toggleGroup: () => {},
			expandAll: () => {},
			collapseAll: () => {},
			getRowKey: (row) => `${row.personId}:${row.typeId}`,
			isRowDisabled: () => false
		};
	});
</script>

<ReportWorkspace.Section
	{id}
	tabindex={-1}
	variant="briefing"
	eyebrow={scopeLabel((shown ?? detail.request).scope)}
	title="Affected soldiers"
	class="outline-none"
	aria-busy={detail.status === 'loading'}
>
	{#snippet actions()}
		<div class="flex items-center gap-2 print:hidden">
			<span class="font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground">Rows per page</span>
			<ToggleGroup.Root
				type="single"
				size="sm"
				bind:value={
					() => String(detail.request.pageSize),
					(value) => {
						if (value) onPageSize(Number(value));
					}
				}
				aria-label="Rows per page"
			>
				{#each PAGE_SIZES as size (size)}
					<ToggleGroup.Item value={String(size)} aria-label={`${size} rows per page`}>{size}</ToggleGroup.Item>
				{/each}
			</ToggleGroup.Root>
		</div>
	{/snippet}

	<div class="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-sm">
		<p role="status" aria-live="polite">
			{#if summary}{summary}{/if}
			{#if pending}<span class="text-muted-foreground print:hidden">{summary ? ' ' : ''}{pending}</span>{/if}
		</p>
		{#if range}
			<p class="font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground">{range}</p>
		{/if}
	</div>

	{#if detail.status === 'error'}
		<div class="mb-3">
			<ReportWorkspace.State
				state="error"
				title="Unable to load affected soldiers"
				description={shown ? `${detail.message} Showing the page that loaded before.` : detail.message}
				role="alert"
				{onRetry}
			/>
		</div>
	{/if}

	{#if shown || detail.status === 'loading'}
		<DataTable.DataTable
			{table}
			ariaLabel="Affected soldiers"
			emptyMessage="No affected requirements."
			loading={!shown && detail.status === 'loading'}
			density="dense"
			stickyHeader={false}
		>
			{#snippet cell(row, column)}
				{#if column.key === 'status'}
					<TrainingStatusCell status={row.status} label={row.label} />
				{:else}
					{column.value(row)}
				{/if}
			{/snippet}
		</DataTable.DataTable>
	{/if}
</ReportWorkspace.Section>
