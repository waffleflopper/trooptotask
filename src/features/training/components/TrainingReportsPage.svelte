<script lang="ts" module>
	import type { BriefingRowsBy } from '../contracts';
	import { BRIEFING_BAND_TIER } from '../utils/briefingBandTier';

	const TOTAL_ROW_ID = 'total';
	const BRIEFING_ID = 'training-briefing';
	const DETAIL_ID = 'training-affected-soldiers';
</script>

<script lang="ts">
	import { onDestroy, onMount, tick, untrack } from 'svelte';
	import { replaceState } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { Button } from '$lib/components/ui/button';
	import * as OperationalMatrix from '$lib/components/ui/operational-matrix';
	import type { OperationalMatrixColumn, OperationalMatrixRow } from '$lib/components/ui/operational-matrix';
	import * as PageShell from '$lib/components/patterns/page-shell';
	import * as ReadinessBand from '$lib/components/patterns/readiness-band/index.js';
	import { readinessBandTone } from '$lib/components/patterns/readiness-band/index.js';
	import { ReportForecastChart } from '$lib/components/patterns/report-chart';
	import * as ReportWorkspace from '$lib/components/patterns/report-workspace';
	import {
		WorkspaceToolbar,
		type ToolbarItem,
		type WorkspaceToolbarProps
	} from '$lib/components/patterns/workspace-toolbar';
	import { showSubGroups, showSubGroupsToggle } from '$lib/stores/showSubGroups.svelte';
	import { downloadBlob } from '$lib/utils/downloadBlob';
	import { filenameFromContentDisposition } from '$lib/utils/workbook';
	import {
		DEFAULT_TRAINING_BRIEFING_INPUT,
		TRAINING_BRIEFING_HORIZONS,
		type BriefingGridRow,
		type BriefingReadiness,
		type BriefingScope,
		type TrainingBriefingHorizon,
		type TrainingBriefingReportData,
		type TrainingBriefingReportInput
	} from '../contracts';
	import { TrainingBriefingSession } from '../read-model/trainingBriefingSession.svelte';
	import { TrainingPrintCycle } from '../read-model/trainingPrintCycle.svelte';
	import { BRIEFING_ROWS_BY_LABELS as ROWS_BY_LABEL } from '../utils/briefingFilterLabels';
	import TrainingAffectedSoldiersSection from './TrainingAffectedSoldiersSection.svelte';
	import TrainingFocusSection from './TrainingFocusSection.svelte';
	import TrainingPrintBrief from './TrainingPrintBrief.svelte';
	import TrainingTypeRiskSection from './TrainingTypeRiskSection.svelte';

	interface Props {
		orgId: string;
		initialReport: TrainingBriefingReportData;
		fetch?: typeof fetch;
	}

	let { orgId, initialReport, fetch: fetchImpl = (input, init) => fetch(input, init) }: Props = $props();

	const session = untrack(
		() =>
			new TrainingBriefingSession({
				orgId,
				initialReport,
				fetch: fetchImpl,
				replaceQuery: (query) => {
					if (window.location.search.replace(/^\?/, '') === query) return;
					const path = resolve('/org/[orgId]/training/reports', { orgId: page.params.orgId ?? orgId });
					replaceState(query ? `${path}?${query}` : path, page.state);
				}
			})
	);
	$effect(() => {
		const report = initialReport;
		untrack(() => session.receive(report));
	});
	const printCycle = new TrainingPrintCycle(() => ({
		report: session.report,
		detail: session.detail.status === 'idle' ? null : session.detail.detail
	}));
	onMount(() => {
		session.syncQuery();
		const printMedia = window.matchMedia('print');
		const onPrintMediaChange = () => {
			if (printMedia.matches) printCycle.capture();
			else printCycle.release();
		};
		printMedia.addEventListener('change', onPrintMediaChange);
		return () => printMedia.removeEventListener('change', onPrintMediaChange);
	});
	onDestroy(() => {
		printCycle.dispose();
		session.dispose();
	});

	let exporting = $state(false);
	let exportError = $state<string | null>(null);

	const report = $derived(session.report);
	const selected = $derived(session.selected);
	const briefing = $derived(report.briefing);
	const options = $derived(report.filterOptions);
	const bottomLine = $derived(briefing.bottomLine);
	const grid = $derived(briefing.grid);
	const loading = $derived(session.request.status === 'loading');
	const horizonEndLabel = $derived(bottomLine.horizonEndLabel);

	const activeFilterCount = $derived(
		(selected.viewId ? 1 : 0) +
			(selected.groupId ? 1 : 0) +
			(selected.rank ? 1 : 0) +
			selected.mos.length +
			selected.roles.length +
			selected.typeIds.length
	);
	const hasNonDefault = $derived(
		activeFilterCount > 0 ||
			selected.horizonDays !== DEFAULT_TRAINING_BRIEFING_INPUT.horizonDays ||
			selected.rowsBy !== DEFAULT_TRAINING_BRIEFING_INPUT.rowsBy
	);

	const viewOptions = $derived([
		{ value: '', label: 'All training' },
		...options.views.map((view) => ({ value: view.id, label: view.name }))
	]);
	const groupOptions = $derived([
		{ value: '', label: 'All groups' },
		...options.groups.map((group) => ({ value: group.id, label: group.name }))
	]);
	const rankOptions = $derived([
		{ value: '', label: 'All ranks' },
		...options.ranks.map((rank) => ({ value: rank, label: rank }))
	]);
	const mosOptions = $derived(options.mos.map((mos) => ({ value: mos, label: mos })));
	const roleOptions = $derived(options.roles.map((role) => ({ value: role, label: role })));
	const typeOptions = $derived(options.types.map((type) => ({ value: type.id, label: type.name })));

	const forecastPoints = $derived(
		briefing.forecast.points.map((point) => ({ date: point.date, label: point.label, percent: point.percent ?? 0 }))
	);
	const forecastBars = $derived(
		briefing.forecast.buckets.map((bucket, index) => ({
			start: briefing.forecast.points[index].date,
			end: bucket.endDate,
			count: bucket.lapses,
			emphasized: bucket.inCliff
		}))
	);
	const forecastBand = $derived.by(() => {
		const cliff = briefing.forecast.cliff;
		const first = briefing.forecast.buckets.findIndex((bucket) => bucket.inCliff);
		if (!cliff?.highlighted || first === -1) return null;
		return {
			start: briefing.forecast.points[first].date,
			end: cliff.endDate,
			label: cliff.label,
			caption: cliff.caption
		};
	});

	type MatrixRow = OperationalMatrixRow & { source: BriefingGridRow; level: number; subGroupRow: boolean };
	type MatrixColumn = OperationalMatrixColumn & { typeId: string };

	const matrixRow = (source: BriefingGridRow, level = 0, subGroupRow = false): MatrixRow => ({
		id: source.key === null ? TOTAL_ROW_ID : `row:${source.key}`,
		label: source.label,
		source,
		level,
		subGroupRow
	});
	const hasSubGroupRows = $derived(grid.sets.some((set) => set.below.length > 0));
	const matrixRows = $derived<MatrixRow[]>([
		...grid.sets.flatMap((set) => [
			matrixRow(set.top),
			...(showSubGroups.current ? set.below.map((row) => matrixRow(row, row.level, true)) : [])
		]),
		matrixRow(grid.total)
	]);
	const matrixColumns = $derived<MatrixColumn[]>(
		grid.columns.map((column) => ({ id: column.typeId, label: column.name, typeId: column.typeId }))
	);
	const openScope = $derived(session.detail.status === 'idle' ? null : session.detail.request.scope);
	const selectedCell = $derived.by(() => {
		if (openScope?.kind !== 'cell') return null;
		return { rowId: openScope.rowKey === null ? TOTAL_ROW_ID : `row:${openScope.rowKey}`, columnId: openScope.typeId };
	});

	function scopeLabel(scope: BriefingScope): string {
		if (scope.kind === 'focus')
			return briefing.focus.areas.find((area) => area.key === scope.key)?.title ?? 'Focus area';
		const row = grid.sets.flatMap((set) => [set.top, ...set.below]).find((candidate) => candidate.key === scope.rowKey);
		const column = grid.columns.find((candidate) => candidate.typeId === scope.typeId);
		return `${row?.label ?? 'Total'}, ${column?.name ?? ''}`;
	}

	async function focusSection(id: string): Promise<void> {
		await tick();
		document.getElementById(id)?.focus();
	}

	function openDetail(scope: BriefingScope): void {
		session.requestDetail(scope);
		void focusSection(DETAIL_ID);
	}

	function retryDetail(): void {
		session.retryDetail();
		void focusSection(DETAIL_ID);
	}

	function retryBriefing(): void {
		session.retry();
		void focusSection(BRIEFING_ID);
	}

	function update(changes: Partial<TrainingBriefingReportInput>): void {
		session.select({ ...selected, ...changes });
	}

	function clearFilters(): void {
		session.select(DEFAULT_TRAINING_BRIEFING_INPUT);
		void focusSection(BRIEFING_ID);
	}

	const toolbarItems = $derived.by<ToolbarItem[]>(() => {
		const items: ToolbarItem[] = [
			{
				kind: 'view',
				id: 'horizon',
				label: 'Forecast horizon',
				options: TRAINING_BRIEFING_HORIZONS.map((days) => ({
					value: String(days),
					label: `${days} D`,
					ariaLabel: `${days} days`
				})),
				value: String(selected.horizonDays),
				onValueChange: (value) => update({ horizonDays: Number(value) as TrainingBriefingHorizon })
			},
			{
				kind: 'select',
				id: 'view',
				label: 'View',
				ariaLabel: 'Filter by view',
				options: viewOptions,
				value: selected.viewId ?? '',
				defaultValue: '',
				onValueChange: (value) => update({ viewId: value || null, typeIds: [] })
			},
			{
				kind: 'select',
				id: 'group',
				label: 'Group',
				ariaLabel: 'Filter by group',
				options: groupOptions,
				value: selected.groupId ?? '',
				defaultValue: '',
				onValueChange: (value) => update({ groupId: value || null })
			},
			{
				kind: 'select',
				id: 'rank',
				label: 'Rank',
				ariaLabel: 'Filter by rank',
				options: rankOptions,
				value: selected.rank ?? '',
				defaultValue: '',
				onValueChange: (value) => update({ rank: value || null })
			},
			{
				kind: 'multiSelect',
				id: 'mos',
				label: 'MOS',
				ariaLabel: 'Filter by MOS',
				options: mosOptions,
				values: selected.mos,
				onValuesChange: (mos) => update({ mos })
			},
			{
				kind: 'multiSelect',
				id: 'roles',
				label: 'Duty role',
				ariaLabel: 'Filter by duty role',
				options: roleOptions,
				values: selected.roles,
				onValuesChange: (roles) => update({ roles })
			},
			{
				kind: 'multiSelect',
				id: 'types',
				label: 'Types',
				ariaLabel: 'Filter by training type',
				options: typeOptions,
				values: selected.typeIds,
				onValuesChange: (typeIds) => update({ typeIds })
			}
		];
		if (hasNonDefault)
			items.push({ kind: 'action', id: 'clear-filters', label: 'Clear filters', onclick: clearFilters });
		items.push({
			kind: 'action',
			id: 'export-excel',
			label: exporting ? 'Exporting...' : 'Export Excel',
			onclick: exportExcel,
			icon: 'download',
			loading: exporting,
			disabled: bottomLine.soldierCount === 0
		});
		return items;
	});

	const toolbarPrimary = $derived<WorkspaceToolbarProps['primary']>({
		kind: 'action',
		id: 'print-brief',
		label: 'Print brief',
		onclick: () => printCycle.print(() => window.print()),
		icon: 'printer'
	});

	const rowsByItems = $derived<ToolbarItem[]>([
		{
			kind: 'view',
			id: 'rows-by',
			label: 'Rows by',
			options: Object.entries(ROWS_BY_LABEL).map(([value, label]) => ({ value, label })),
			value: selected.rowsBy,
			onValueChange: (value) => update({ rowsBy: value as BriefingRowsBy })
		},
		...(hasSubGroupRows
			? [
					{
						kind: 'action',
						id: 'hot-spot-display',
						label: 'Display',
						icon: 'sliders',
						menuItems: [showSubGroupsToggle()]
					} satisfies ToolbarItem
				]
			: [])
	]);

	function tone(readiness: BriefingReadiness): string {
		return readinessBandTone[BRIEFING_BAND_TIER[readiness.band]];
	}

	function soldierLabel(count: number): string {
		return `${count} ${count === 1 ? 'soldier' : 'soldiers'}`;
	}

	function percentLabel(readiness: BriefingReadiness): string {
		return readiness.percent === null ? '—' : `${readiness.percent}%`;
	}

	function cellLabel(row: BriefingGridRow, typeName: string, index: number, selected: boolean): string {
		const cell = row.cells[index];
		if (cell.today.percent === null) return `${row.label}, ${typeName}: no applicable requirements`;
		const drop = cell.dropAlert ? `, drops ${cell.drop} points by ${horizonEndLabel}` : '';
		return `${row.label}, ${typeName}: ${cell.today.percent}% ready today${drop}${selected ? ', selected' : ''}`;
	}

	function retryExport(): void {
		void exportExcel();
		void focusSection(BRIEFING_ID);
	}

	async function exportExcel(): Promise<void> {
		if (exporting) return;
		exporting = true;
		exportError = null;
		try {
			const response = await fetchImpl(session.exportHref);
			if (!response.ok) throw new Error(`The workbook could not be exported (${response.status}).`);
			downloadBlob(
				await response.blob(),
				filenameFromContentDisposition(response.headers.get('Content-Disposition'), 'training-report.xlsx')
			);
		} catch (error) {
			exportError = error instanceof Error ? error.message : 'The workbook could not be exported.';
		} finally {
			exporting = false;
		}
	}
</script>

<svelte:window onbeforeprint={() => printCycle.capture()} onafterprint={() => printCycle.release()} />

{#if printCycle.data}
	<div class="hidden print:block" data-print-report="training">
		<TrainingPrintBrief report={printCycle.data.report} detail={printCycle.data.detail} />
	</div>
{/if}

<div class="flex flex-col gap-6 p-4 md:p-6 print:hidden">
	<PageShell.Header
		title="Training Reports"
		subtitle={`${report.organizationName} · ${soldierLabel(bottomLine.soldierCount)} · as of ${bottomLine.asOfLabel}`}
	>
		{#snippet meta()}
			<span class="text-sm text-muted-foreground" role="status" aria-live="polite">
				{loading ? 'Updating briefing' : ''}
			</span>
		{/snippet}
	</PageShell.Header>

	<WorkspaceToolbar ariaLabel="Training report controls" items={toolbarItems} primary={toolbarPrimary} />

	{#if session.request.status === 'error'}
		<ReportWorkspace.State
			state="error"
			title="Unable to update the briefing"
			description={`${session.request.message} Showing the last briefing that loaded.`}
			role="alert"
			onRetry={retryBriefing}
		/>
	{/if}
	{#if exportError}
		<ReportWorkspace.State
			state="error"
			title="Unable to export the workbook"
			description={exportError}
			role="alert"
			onRetry={retryExport}
		/>
	{/if}

	<ReportWorkspace.Root
		id={BRIEFING_ID}
		tabindex={-1}
		ariaLabel="Training readiness briefing"
		aria-busy={loading}
		class="outline-none"
	>
		{#if options.types.length === 0}
			<ReportWorkspace.State
				state="no-data"
				level={2}
				title={report.input.viewId ? 'This view has no required training types.' : 'No training types configured.'}
				description={report.input.viewId ? 'Choose another view.' : 'Create training types first.'}
			/>
		{:else if bottomLine.today.percent === null}
			<ReportWorkspace.State
				state="no-data"
				level={2}
				title={activeFilterCount > 0 ? 'No applicable requirements for these filters.' : 'No applicable requirements.'}
				description={activeFilterCount > 0
					? 'No soldier in this selection is required to hold the selected training.'
					: 'No soldier is required to hold the configured training.'}
			>
				{#if hasNonDefault}
					<Button type="button" variant="secondary" size="sm" onclick={clearFilters}>Clear filters</Button>
				{/if}
			</ReportWorkspace.State>
		{:else}
			<div class="flex flex-col gap-10">
				<div class="grid gap-12 lg:grid-cols-[21.25rem_minmax(0,1fr)]">
					<ReportWorkspace.Section variant="briefing" title="Bottom line">
						<div class="flex flex-wrap items-end gap-x-5 gap-y-3">
							<div>
								<p class="font-heading text-[104px] leading-[88px] font-extrabold tracking-[-0.02em]">
									{percentLabel(bottomLine.today)}
								</p>
								<p class="mt-2 font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground">Ready today</p>
								<p class="font-mono text-[11px] text-muted-foreground">counted per training</p>
							</div>
							<div>
								<p class={['font-heading text-[48px] leading-[44px] font-bold', tone(bottomLine.horizon)]}>
									<span aria-hidden="true">→</span>
									<span class="sr-only"
										>{bottomLine.horizon.percent === bottomLine.today.percent ? 'stays at' : 'falls to'}</span
									>
									{percentLabel(bottomLine.horizon)}
								</p>
								<p class="mt-2 font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
									By {horizonEndLabel}
								</p>
							</div>
						</div>
						<p class="mt-6 font-serif text-[17px] leading-[26px]">{bottomLine.sentence}</p>
						<dl class="mt-6 border-t border-border text-sm" aria-label="Requirement counts">
							<div class="flex h-9 items-center justify-between border-b border-border">
								<dt>Ready</dt>
								<dd class="font-mono font-semibold">{bottomLine.today.ready}</dd>
							</div>
							<div class="flex h-9 items-center justify-between border-b border-border">
								<dt class="flex items-center gap-2">
									<span class="size-2 rounded-[1px] bg-destructive" aria-hidden="true"></span>Not ready, expired
								</dt>
								<dd class="font-mono font-semibold text-destructive">{bottomLine.expired}</dd>
							</div>
							<div class="flex h-9 items-center justify-between border-b border-border text-muted-foreground">
								<dt>Not ready, not recorded</dt>
								<dd class="font-mono">{bottomLine.notRecorded}</dd>
							</div>
							<div class="flex h-9 items-center justify-between border-b border-border">
								<dt class="flex items-center gap-2">
									<span class="size-2 rounded-[1px] bg-warning" aria-hidden="true"></span>Lapse by {horizonEndLabel}
								</dt>
								<dd class="font-mono font-semibold">{bottomLine.lapsing}</dd>
							</div>
						</dl>
					</ReportWorkspace.Section>

					<ReportWorkspace.Section
						variant="briefing"
						eyebrow={`Forecast · next ${report.input.horizonDays} days`}
						title={`${bottomLine.scopeName} readiness if no one renews`}
					>
						<div data-testid="training-briefing-forecast">
							<ReportForecastChart
								points={forecastPoints}
								bars={forecastBars}
								goal={{ value: briefing.forecast.goalPercent, label: `Goal ${briefing.forecast.goalPercent}%` }}
								band={forecastBand}
								xTicks={briefing.forecast.axisTicks}
								endTone={tone(bottomLine.horizon)}
								ariaLabel={`Forecast readiness and weekly lapses through ${horizonEndLabel}`}
							/>
						</div>
					</ReportWorkspace.Section>
				</div>

				<ReportWorkspace.Section
					variant="briefing"
					eyebrow="Where · hot spots"
					title={`${ROWS_BY_LABEL[grid.rowsBy]} by training type`}
					description={`% ready today. Color shows distance from the ${briefing.forecast.goalPercent}% goal. ▼ marks a drop of ${grid.dropAlertPoints}+ points by ${horizonEndLabel}.`}
				>
					{#snippet actions()}
						<ReadinessBand.Legend
							palette="semantic"
							ariaLabel={`Readiness bands for a ${briefing.forecast.goalPercent}% goal`}
							items={grid.legend.map((item) => ({ tier: BRIEFING_BAND_TIER[item.band], label: item.label }))}
							dropLabel={`▼ ${grid.dropAlertPoints}+`}
						/>
					{/snippet}

					<div class="mb-3 flex items-center gap-2">
						<span class="font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground">Rows by</span>
						<div class="min-w-0 flex-1">
							<WorkspaceToolbar ariaLabel="Hot-spot grid controls" items={rowsByItems} />
						</div>
					</div>

					<OperationalMatrix.Root rows={matrixRows} columns={matrixColumns} {selectedCell}>
						<OperationalMatrix.Viewport ariaLabel="Hot-spot grid">
							<OperationalMatrix.Table
								ariaLabel={`${ROWS_BY_LABEL[grid.rowsBy]} by training type readiness`}
								class="min-w-max border-separate border-spacing-[2px] [&_[data-slot=operational-matrix-cell-trigger]]:block [&_[data-slot=operational-matrix-cell-trigger]]:w-full [&_[data-slot=operational-matrix-cell-trigger]]:rounded-[2px] [&_[data-slot=operational-matrix-cell-trigger]]:outline-none [&_[data-slot=operational-matrix-cell-trigger]]:focus-visible:relative [&_[data-slot=operational-matrix-cell-trigger]]:focus-visible:z-20 [&_[data-slot=operational-matrix-cell-trigger]]:focus-visible:ring-2 [&_[data-slot=operational-matrix-cell-trigger]]:focus-visible:ring-foreground [&_[data-slot=operational-matrix-cell-trigger]]:focus-visible:ring-offset-4 [&_[data-slot=operational-matrix-cell-trigger]]:focus-visible:ring-offset-background [&_[data-selected]_[data-slot=operational-matrix-cell-trigger]]:outline-2 [&_[data-selected]_[data-slot=operational-matrix-cell-trigger]]:outline-offset-2 [&_[data-selected]_[data-slot=operational-matrix-cell-trigger]]:outline-dashed [&_[data-selected]_[data-slot=operational-matrix-cell-trigger]]:outline-foreground"
							>
								<OperationalMatrix.Header>
									<OperationalMatrix.HeaderRow>
										<OperationalMatrix.CornerCell
											class="w-[170px] pb-2 text-left font-mono text-[11px] font-normal uppercase tracking-[0.08em] text-muted-foreground"
										>
											{ROWS_BY_LABEL[grid.rowsBy]}
										</OperationalMatrix.CornerCell>
										{#each matrixColumns as column (column.id)}
											<OperationalMatrix.ColumnHeader
												{column}
												class="min-w-24 px-1 pb-2 text-center font-mono text-[11px] font-normal uppercase tracking-[0.08em] text-muted-foreground"
											/>
										{/each}
										<th
											scope="col"
											class="w-24 pb-2 text-right font-mono text-[11px] font-normal uppercase tracking-[0.08em] text-muted-foreground"
											>Today</th
										>
										<th
											scope="col"
											class="w-24 pb-2 text-right font-mono text-[11px] font-normal uppercase tracking-[0.08em] text-muted-foreground"
											>{horizonEndLabel}</th
										>
									</OperationalMatrix.HeaderRow>
								</OperationalMatrix.Header>
								<OperationalMatrix.Body>
									{#each matrixRows as row (row.id)}
										{@const total = row.id === TOTAL_ROW_ID}
										<OperationalMatrix.Row
											{row}
											data-sub-group-row={row.subGroupRow || undefined}
											class={total ? '[&>*]:border-t-2 [&>*]:border-foreground [&>*]:pt-1.5' : undefined}
										>
											<OperationalMatrix.RowHeader
												{row}
												sticky
												class="sticky left-0 z-10 bg-background pr-3 text-left align-middle"
												style="padding-left: {row.level}rem"
											>
												<span class="block font-serif text-[15px] font-medium">{row.label}</span>
												<span class="block font-mono text-[11px] text-muted-foreground">
													{soldierLabel(row.source.soldierCount)}
												</span>
											</OperationalMatrix.RowHeader>
											{#each matrixColumns as column, index (column.id)}
												{@const cell = row.source.cells[index]}
												<OperationalMatrix.Cell
													{row}
													{column}
													readOnly={cell.today.applicable === 0}
													ariaLabel={cellLabel(
														row.source,
														column.label,
														index,
														selectedCell?.rowId === row.id && selectedCell.columnId === column.id
													)}
													onSelect={() => openDetail({ kind: 'cell', rowKey: row.source.key, typeId: column.typeId })}
													class="p-0"
												>
													<ReadinessBand.Cell
														palette="semantic"
														size="tile"
														tier={BRIEFING_BAND_TIER[cell.today.band]}
														percent={cell.today.percent}
														label={cell.today.percent === null ? '—' : String(cell.today.percent)}
														drop={cell.dropAlert ? cell.drop : null}
													/>
												</OperationalMatrix.Cell>
											{/each}
											<td class="text-right align-middle font-heading text-2xl font-bold">
												{percentLabel(row.source.today)}
											</td>
											<td class="text-right align-middle font-heading text-2xl font-bold">
												<span class={tone(row.source.horizon)}>{percentLabel(row.source.horizon)}</span>
											</td>
										</OperationalMatrix.Row>
									{/each}
								</OperationalMatrix.Body>
							</OperationalMatrix.Table>
						</OperationalMatrix.Viewport>
					</OperationalMatrix.Root>
				</ReportWorkspace.Section>

				<div class="grid gap-14 xl:grid-cols-[minmax(0,1fr)_30rem]">
					<TrainingTypeRiskSection risks={briefing.typeRisk} {horizonEndLabel} />
					<TrainingFocusSection
						focus={briefing.focus}
						detailId={DETAIL_ID}
						openKey={openScope?.kind === 'focus' ? openScope.key : null}
						onOpen={(key) => openDetail({ kind: 'focus', key })}
					/>
				</div>

				{#if session.detail.status !== 'idle'}
					<TrainingAffectedSoldiersSection
						id={DETAIL_ID}
						detail={session.detail}
						{horizonEndLabel}
						{scopeLabel}
						onPage={(page) => session.showDetailPage(page)}
						onPageSize={(pageSize) => session.setDetailPageSize(pageSize)}
						onRetry={retryDetail}
					/>
				{/if}
			</div>
		{/if}
	</ReportWorkspace.Root>
</div>
