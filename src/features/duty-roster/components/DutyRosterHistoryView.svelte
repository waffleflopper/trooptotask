<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import {
		Calendar,
		Database,
		Eye,
		List,
		Printer,
		RefreshCw,
		Save,
		ShieldCheck,
		Trash2,
		Wrench,
		X
	} from '@lucide/svelte';
	import SearchCombobox from '$lib/components/ui/SearchCombobox.svelte';
	import { Badge, type BadgeVariant } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import * as Field from '$lib/components/ui/field';
	import { Input } from '$lib/components/ui/input';
	import * as OperationalMatrix from '$lib/components/ui/operational-matrix';
	import type { OperationalMatrixColumn, OperationalMatrixRow } from '$lib/components/ui/operational-matrix';
	import * as Select from '$lib/components/ui/select';
	import * as Tabs from '$lib/components/ui/tabs';
	import { printDutyRosterForBrowser } from '$features/duty-roster/export/dutyRosterBrowserExport';
	import type {
		DutyRosterTemplate,
		DutyRosterTemplateAcceptedRun
	} from '$features/duty-roster/templates/dutyRosterTemplates';
	import {
		type DutyRosterWorkspaceActionForm,
		type DutyRosterWorkspaceReadModel
	} from '$features/duty-roster/workspace/dutyRosterWorkspaceReadModel';
	import {
		buildDutyRosterAcceptedRunReviewModel,
		correctionKey,
		type DutyRosterAcceptedRunReviewModel
	} from '$features/duty-roster/workspace/dutyRosterPreviewReview';

	let {
		basePath,
		selectedTemplate,
		actionForm,
		acceptedRuns,
		historyPage,
		historyDetailRun,
		latestHistoryRunId,
		historyMode,
		applyAcceptedRunAction,
		invalidateAcceptedRunAction,
		correctAcceptedRunAction
	}: {
		basePath: string;
		selectedTemplate: DutyRosterTemplate;
		actionForm: DutyRosterWorkspaceActionForm | null;
		acceptedRuns: DutyRosterTemplateAcceptedRun[];
		historyPage: DutyRosterWorkspaceReadModel['historyPage'];
		historyDetailRun: DutyRosterTemplateAcceptedRun | null;
		latestHistoryRunId: string | null;
		historyMode: DutyRosterWorkspaceReadModel['historyMode'];
		applyAcceptedRunAction: string;
		invalidateAcceptedRunAction: string;
		correctAcceptedRunAction: string;
	} = $props();

	let confirmingInvalidationRunId = $state<string | null>(null);
	let selectedCorrectionAssignees = $state<Record<string, string>>({});
	let historySearch = $state('');
	let historyStateFilter = $state<'all' | 'accepted' | 'invalidated' | 'applied' | 'not-applied'>('all');
	let selectedCorrectionKey = $state<string | null>(null);

	const historyStateOptions: Array<{ value: typeof historyStateFilter; label: string }> = [
		{ value: 'all', label: 'All' },
		{ value: 'accepted', label: 'Accepted' },
		{ value: 'invalidated', label: 'Invalidated' },
		{ value: 'applied', label: 'Applied' },
		{ value: 'not-applied', label: 'Not applied runs' }
	];

	type AcceptedDa6MatrixCell = NonNullable<DutyRosterAcceptedRunReviewModel['matrix']['rows'][number]['cells'][number]>;
	type AcceptedDa6MatrixRow = OperationalMatrixRow & { meta: { cells: AcceptedDa6MatrixCell[] } };
	type AcceptedDa6MatrixColumn = OperationalMatrixColumn & { meta: { date: string } };

	function historyDetailHref(run: DutyRosterTemplateAcceptedRun, mode: 'roster' | 'da6'): string {
		const detailPath = `${basePath}/${selectedTemplate.slug}/history/${run.id}`;
		return mode === 'da6' ? `${detailPath}?mode=da6` : detailPath;
	}

	function historyListHref(): string {
		return `${basePath}/${selectedTemplate.slug}/history`;
	}

	function historyPageHref(page: number): string {
		const listHref = historyListHref();
		return page <= 1 ? listHref : `${listHref}?page=${page}`;
	}

	function selectedCorrectionAssigneeId(runId: string, date: string): string {
		return selectedCorrectionAssignees[correctionKey(runId, date)] ?? '';
	}

	function selectedCorrectionOverrideWarning(): string | null {
		if (!selectedCorrectionRow) return null;
		const assigneeId = selectedCorrectionAssigneeId(selectedCorrectionRow.run.id, selectedCorrectionRow.date);
		return selectedCorrectionRow.correctionOverrideWarnings[assigneeId] ?? null;
	}

	function openCorrection(runId: string, date: string): void {
		selectedCorrectionKey = correctionKey(runId, date);
	}

	function closeCorrection(): void {
		selectedCorrectionKey = null;
	}

	function printAcceptedRun(run: DutyRosterTemplateAcceptedRun): void {
		printDutyRosterForBrowser({
			acceptedSnapshot: buildDutyRosterAcceptedRunReviewModel({
				run,
				isLatestRun: run.id === latestHistoryRunId
			}).snapshot,
			statusLabel: 'Official'
		});
	}

	function formatDutyDate(value: string): string {
		const [year, month, day] = value.split('-').map(Number);
		if (!year || !month || !day) return value;
		return new Intl.DateTimeFormat('en-US', {
			weekday: 'short',
			day: '2-digit',
			month: 'short',
			timeZone: 'UTC'
		})
			.format(new Date(Date.UTC(year, month - 1, day)))
			.toUpperCase();
	}

	function formatDate(value: string | null | undefined): string {
		if (!value) return '-';
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return value;
		return new Intl.DateTimeFormat('en-US', {
			day: '2-digit',
			month: 'short',
			year: 'numeric',
			timeZone: 'UTC'
		})
			.format(date)
			.toUpperCase();
	}

	function formatDateTime(value: string | null | undefined): string {
		if (!value) return '-';
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return value;
		const dateText = new Intl.DateTimeFormat('en-US', {
			day: '2-digit',
			month: 'short',
			year: 'numeric',
			timeZone: 'UTC'
		})
			.format(date)
			.toUpperCase();
		const timeText = new Intl.DateTimeFormat('en-US', {
			hour: '2-digit',
			minute: '2-digit',
			hour12: false
		}).format(date);
		return `${dateText} ${timeText}`;
	}

	function soldierName(display: { rank: string; lastName: string; firstName: string } | null | undefined): string {
		return display ? `${display.rank} ${display.lastName}, ${display.firstName}` : 'Unfilled';
	}

	function soldierGroup(display: { groupName?: string | null } | null | undefined): string {
		return display?.groupName ?? '';
	}

	function runStatusLabel(run: DutyRosterTemplateAcceptedRun): string {
		if (run.status === 'invalidated') return 'Invalidated';
		return 'Official';
	}

	function runStatusVariant(run: DutyRosterTemplateAcceptedRun): BadgeVariant {
		if (run.status === 'invalidated') return 'danger';
		if (run.appliedAt && !run.calendarAssignmentsEdited) return 'success';
		if (run.appliedAt && run.calendarAssignmentsEdited) return 'warning';
		return 'secondary';
	}

	function acceptedByLabel(run: DutyRosterTemplateAcceptedRun): string {
		return run.acceptedByDisplayName ?? 'Unknown';
	}

	function calendarStateLabel(run: DutyRosterTemplateAcceptedRun): string {
		if (!run.appliedAt) return 'Not applied';
		return run.calendarAssignmentsEdited ? 'Needs sync' : 'Applied';
	}

	function runMatchesHistoryFilter(run: DutyRosterTemplateAcceptedRun): boolean {
		const query = historySearch.trim().toLowerCase();
		const haystack = [
			run.templateName,
			run.startDate,
			run.endDate,
			run.acceptedAt,
			acceptedByLabel(run),
			runStatusLabel(run)
		]
			.join(' ')
			.toLowerCase();

		if (query && !haystack.includes(query)) return false;
		if (historyStateFilter === 'all') return true;
		if (historyStateFilter === 'accepted') return run.status === 'accepted';
		if (historyStateFilter === 'invalidated') return run.status === 'invalidated';
		if (historyStateFilter === 'applied') return run.status === 'accepted' && Boolean(run.appliedAt);
		return run.status === 'accepted' && !run.appliedAt;
	}

	function resetHistoryFilters(): void {
		historySearch = '';
		historyStateFilter = 'all';
	}

	const historyStateFilterLabel = $derived(
		historyStateOptions.find((option) => option.value === historyStateFilter)?.label ?? 'All'
	);
	const filteredAcceptedRuns = $derived(acceptedRuns.filter(runMatchesHistoryFilter));
	const latestRun = $derived(
		historyPage ? (acceptedRuns.find((run) => run.id === latestHistoryRunId) ?? null) : (acceptedRuns[0] ?? null)
	);
	const acceptedRunCount = $derived(acceptedRuns.filter((run) => run.status === 'accepted').length);
	const pendingCorrectionCount = $derived(acceptedRuns.reduce((total, run) => total + run.corrections.length, 0));
	const detailReview = $derived(
		historyDetailRun
			? buildDutyRosterAcceptedRunReviewModel({
					run: historyDetailRun,
					isLatestRun: historyDetailRun.id === latestHistoryRunId
				})
			: null
	);
	const selectedCorrectionRow = $derived(
		detailReview?.rows.find((row) => correctionKey(row.run.id, row.date) === selectedCorrectionKey) ?? null
	);
	const acceptedMatrixColumns = $derived<AcceptedDa6MatrixColumn[]>(
		(detailReview?.matrix.columns ?? []).map((column) => ({
			id: column.date,
			label: formatDutyDate(column.date),
			meta: { date: column.date }
		}))
	);
	const acceptedMatrixRows = $derived<AcceptedDa6MatrixRow[]>(
		(detailReview?.matrix.rows ?? []).map((row) => ({
			id: row.personnelId,
			label: row.soldierLabel,
			meta: { cells: row.cells }
		}))
	);

	function acceptedMatrixCell(
		row: AcceptedDa6MatrixRow,
		column: AcceptedDa6MatrixColumn
	): AcceptedDa6MatrixCell | undefined {
		return row.meta.cells.find((cell) => cell.date === column.meta.date);
	}
</script>

<h2 id="template-view-heading" class="sr-only">Accepted runs</h2>
{#if actionForm?.applyError}
	<p class="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive" role="alert">{actionForm.applyError}</p>
{/if}
{#if actionForm?.invalidateError}
	<p class="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive" role="alert">{actionForm.invalidateError}</p>
{/if}
{#if actionForm?.correctionError}
	<p class="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive" role="alert">{actionForm.correctionError}</p>
{/if}
{#if acceptedRuns.length === 0}
	<div class="grid place-items-center gap-2 px-5 py-12 text-center text-sm text-muted-foreground">
		<p class="font-medium text-foreground">History is empty</p>
		<p>History is empty until a DA6 run is accepted.</p>
	</div>
{:else if historyDetailRun}
	{#if detailReview}
		<section class="grid gap-0 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,20rem)]" aria-label="Accepted Duty Roster record">
			<div class="grid min-w-0 content-start gap-4">
				<header class="flex flex-wrap items-center gap-3 rounded-md border border-border bg-muted/30 px-4 py-3">
					<Button variant="outline" size="sm" href={historyListHref()}>Back to history</Button>
					<div class="flex flex-wrap items-center gap-2 text-xs text-muted-foreground" aria-label="Run status">
						<Badge variant={runStatusVariant(historyDetailRun)}>{runStatusLabel(historyDetailRun)}</Badge>
						{#if historyDetailRun.appliedAt}
							<span class="inline-flex items-center gap-1"><Calendar size={14} aria-hidden="true" /> Applied</span>
						{/if}
						<span class="inline-flex items-center gap-1" title={`Accepted by ${acceptedByLabel(historyDetailRun)}`}>
							<ShieldCheck size={14} aria-hidden="true" />
							<span>{acceptedByLabel(historyDetailRun)}</span>
						</span>
						<span class="inline-flex items-center gap-1">
							<Calendar size={14} aria-hidden="true" />
							{formatDate(historyDetailRun.startDate)} to {formatDate(historyDetailRun.endDate)}
						</span>
					</div>
					<div class="ml-auto flex items-center gap-2">
						<Tabs.Root value={historyMode}>
							<Tabs.List aria-label="History detail review mode">
								<Tabs.Trigger
									value="list"
									onclick={() =>
										void goto(
											resolve(
												historyDetailHref(
													historyDetailRun,
													'roster'
												) as `/org/${string}/duty-rosters/${string}/history/${string}`
											)
										)}
								>
									<span class="inline-flex items-center gap-1">
										<List size={14} aria-hidden="true" />
										List
									</span>
								</Tabs.Trigger>
								<Tabs.Trigger
									value="matrix"
									onclick={() =>
										void goto(
											resolve(
												historyDetailHref(
													historyDetailRun,
													'da6'
												) as `/org/${string}/duty-rosters/${string}/history/${string}?${string}`
											)
										)}
								>
									<span class="inline-flex items-center gap-1">
										<Database size={14} aria-hidden="true" />
										DA6
									</span>
								</Tabs.Trigger>
							</Tabs.List>
						</Tabs.Root>
						<Button variant="outline" size="sm" type="button" onclick={() => printAcceptedRun(historyDetailRun)}>
							<Printer size={14} aria-hidden="true" />
							Print
						</Button>
					</div>
				</header>

				{#if historyDetailRun.calendarAssignmentsEdited && !detailReview.isInvalidated}
					<p class="rounded-md border border-warning/50 bg-warning-muted px-4 py-3 text-xs text-warning-foreground">
						Calendar assignments linked to this run changed after apply. Re-applying may overwrite linked Calendar
						assignments, and invalidation will remove the run footprint after confirmation.
					</p>
				{/if}

				{#if historyMode === 'list'}
					<div class="min-w-0 overflow-x-auto">
						<table class="w-full text-sm" aria-label="Accepted Duty Roster list">
							<thead>
								<tr class="border-b border-border bg-muted/50">
									<th class="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Date</th>
									<th class="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Accepted Soldier</th>
									<th class="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Actual Served</th>
									<th class="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Correction</th>
									<th class="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Reason</th>
									<th class="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Calendar</th>
									<th class="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Audit</th>
								</tr>
							</thead>
							<tbody>
								{#each detailReview.rows as tableRow (tableRow.id)}
									{@const rowKey = correctionKey(tableRow.run.id, tableRow.date)}
									{@const actualDisplay = tableRow.correction?.replacementDisplay ?? tableRow.finalRow.finalDisplay}
									<tr
										class={[
											'border-b border-border transition-colors',
											selectedCorrectionKey === rowKey && 'bg-muted/50'
										]}
									>
										<td class="whitespace-nowrap px-3 py-2 text-xs font-medium">{formatDutyDate(tableRow.date)}</td>
										<td class="px-3 py-2">
											<span class="text-sm font-medium text-foreground">{soldierName(tableRow.finalRow.finalDisplay)}</span>
											<span class="block text-xs text-muted-foreground">{soldierGroup(tableRow.finalRow.finalDisplay)}</span>
										</td>
										<td class="px-3 py-2">
											<span class="text-sm font-medium text-foreground">{soldierName(actualDisplay)}</span>
											<span class="block text-xs text-muted-foreground">{soldierGroup(actualDisplay)}</span>
											{#if tableRow.correctionSummary}
												<span class="block text-xs text-muted-foreground">Actual: {tableRow.correctionSummary.replacementName}</span>
											{/if}
										</td>
										<td class="px-3 py-2">
											{#if tableRow.correction}
												<Badge variant="warning">Corrected</Badge>
											{:else}
												<span class="text-muted-foreground">-</span>
											{/if}
										</td>
										<td class="max-w-[12rem] px-3 py-2 text-xs text-muted-foreground">
											{tableRow.correctionSummary?.reason ?? tableRow.reasonText ?? '-'}
										</td>
										<td class="px-3 py-2">
											<span class="block text-xs font-medium">{historyDetailRun.appliedAt ? 'Calendar' : 'History'}</span>
											<span class="block text-xs text-muted-foreground">{detailReview.calendarStepLabel}</span>
										</td>
										<td class="px-3 py-2">
											{#if tableRow.canCorrect}
												<Button variant="outline" size="sm" type="button" onclick={() => openCorrection(tableRow.run.id, tableRow.date)}>
													<Eye size={14} aria-hidden="true" />
													Change
												</Button>
											{:else if tableRow.correctionLockedText}
												<span class="text-xs text-muted-foreground">{tableRow.correctionLockedText}</span>
											{:else}
												<span class="text-muted-foreground">-</span>
											{/if}
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
					<p class="px-3 text-xs text-muted-foreground">Showing 1-{detailReview.rows.length} of {detailReview.rows.length} entries</p>
				{:else}
					<OperationalMatrix.Root rows={acceptedMatrixRows} columns={acceptedMatrixColumns} readOnly>
						<OperationalMatrix.Viewport ariaLabel="Accepted DA6 matrix viewport" class="rounded-lg border bg-card">
							<OperationalMatrix.Table
								ariaLabel="Accepted DA6 matrix"
								class="min-w-max table-fixed text-sm [&_[data-matrix-cell]]:h-10 [&_[data-matrix-cell]]:w-10 [&_[data-matrix-cell]]:border [&_[data-matrix-cell]]:border-border [&_[data-matrix-cell]]:p-0 [&_[data-matrix-column-header]]:border [&_[data-matrix-column-header]]:border-border [&_[data-matrix-column-header]]:bg-muted/70 [&_[data-slot=operational-matrix-cell-content]]:grid [&_[data-slot=operational-matrix-cell-content]]:h-10 [&_[data-slot=operational-matrix-cell-content]]:place-items-center"
							>
								<OperationalMatrix.Header>
									<OperationalMatrix.HeaderRow>
										<OperationalMatrix.CornerCell sticky class="sticky left-0 top-0 z-30 min-w-40 bg-muted px-3 text-left">
											Soldier
										</OperationalMatrix.CornerCell>
										{#each acceptedMatrixColumns as column (column.id)}
											<OperationalMatrix.ColumnHeader {column} orientation="vertical" sticky class="sticky top-0 z-20 bg-muted" />
										{/each}
									</OperationalMatrix.HeaderRow>
								</OperationalMatrix.Header>
								<OperationalMatrix.Body>
									{#each acceptedMatrixRows as row (row.id)}
										<OperationalMatrix.Row {row} class="bg-card hover:bg-muted/20">
											<OperationalMatrix.RowHeader {row} sticky class="sticky left-0 z-10 min-w-40 border bg-card px-3 py-2 text-left font-medium">
												{row.label}
											</OperationalMatrix.RowHeader>
											{#each acceptedMatrixColumns as column (column.id)}
												{@const cell = acceptedMatrixCell(row, column)}
												<OperationalMatrix.Cell
													{row}
													{column}
													readOnly
													class={[
														cell?.tone === 'assigned' && 'bg-success-muted text-success-foreground',
														cell?.tone === 'warning' && 'bg-warning-muted text-warning-foreground',
														cell?.tone === 'danger' && 'bg-danger-muted text-danger-foreground'
													]}
												>
													<span class="font-mono text-xs font-semibold">{cell?.display ?? '-'}</span>
												</OperationalMatrix.Cell>
											{/each}
										</OperationalMatrix.Row>
									{/each}
								</OperationalMatrix.Body>
							</OperationalMatrix.Table>
						</OperationalMatrix.Viewport>
					</OperationalMatrix.Root>
				{/if}
			</div>

			<aside class="grid content-start gap-4 border-l border-border bg-muted/20 p-4" aria-label="Run correction controls">
				{#if selectedCorrectionRow}
					<div class="flex items-start justify-between gap-3">
						<div>
							<p class="text-xs font-medium text-muted-foreground">Record Correction</p>
							<h3 class="text-sm font-semibold text-foreground">{formatDate(selectedCorrectionRow.date)}</h3>
						</div>
						<Button variant="ghost" size="icon-sm" type="button" aria-label="Close correction panel" onclick={closeCorrection}>
							<X size={18} aria-hidden="true" />
						</Button>
					</div>
					<form class="grid gap-3" method="POST" action={correctAcceptedRunAction}>
						<input type="hidden" name="runId" value={selectedCorrectionRow.run.id} />
						<input type="hidden" name="runRowDate" value={selectedCorrectionRow.date} />
						<input type="hidden" name="replacementAssigneeId" value={selectedCorrectionAssigneeId(selectedCorrectionRow.run.id, selectedCorrectionRow.date)} />
						<div class="grid gap-1">
							<span class="text-xs text-muted-foreground">Originally Assigned</span>
							<div class="rounded-md border border-border bg-muted/30 px-3 py-2">
								<span class="text-sm font-medium text-foreground">{soldierName(selectedCorrectionRow.finalRow.finalDisplay)}</span>
								<span class="block text-xs text-muted-foreground">{soldierGroup(selectedCorrectionRow.finalRow.finalDisplay)}</span>
							</div>
						</div>
						{#if selectedCorrectionRow.correctionSummary}
							<p class="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
								Actual: {selectedCorrectionRow.correctionSummary.replacementName}
								performed duty for {selectedCorrectionRow.correctionSummary.originalName}.
								{selectedCorrectionRow.correctionSummary.countText}
							</p>
							{#if selectedCorrectionRow.correctionSummary.overrideText}
								<p class="rounded-md border border-warning/50 bg-warning-muted px-3 py-2 text-xs text-warning-foreground">
									{selectedCorrectionRow.correctionSummary.overrideText}
								</p>
							{/if}
						{/if}
						<Field.Root>
							<Field.Label>Soldier who actually served</Field.Label>
							<SearchCombobox
								options={selectedCorrectionRow.correctionOptions}
								value={selectedCorrectionAssigneeId(selectedCorrectionRow.run.id, selectedCorrectionRow.date)}
								ariaLabel={`Actual Soldier for ${selectedCorrectionRow.date}`}
								placeholder="Search Soldier"
								clearable={false}
								onchange={(value) => {
									selectedCorrectionAssignees = {
										...selectedCorrectionAssignees,
										[correctionKey(selectedCorrectionRow.run.id, selectedCorrectionRow.date)]: value
									};
								}}
							/>
						</Field.Root>
						{#if selectedCorrectionOverrideWarning()}
							<p class="rounded-md border border-warning/50 bg-warning-muted px-3 py-2 text-xs text-warning-foreground">{selectedCorrectionOverrideWarning()}</p>
						{/if}
						<Field.Root>
							<Field.Label for="duty-roster-correction-reason">Reason</Field.Label>
							<Input id="duty-roster-correction-reason" name="reason" placeholder="Reason for correction" required />
						</Field.Root>
						<p class="text-xs text-muted-foreground">
							Corrections update future counts and histories based on the Soldier who actually performed the duty.
						</p>
						{#if historyDetailRun.corrections.length}
							<div class="grid gap-2 border-t border-border pt-3">
								<p class="text-xs font-medium text-muted-foreground">Prior corrections</p>
								{#each historyDetailRun.corrections as correction (correction.id)}
									<div class="grid gap-0.5 rounded-md border border-border bg-card px-3 py-2">
										<span class="text-xs font-medium text-foreground">{formatDateTime(correction.correctedAt)}</span>
										<span class="text-xs text-muted-foreground">{soldierName(correction.originalDisplay)} to {soldierName(correction.replacementDisplay)}</span>
										<span class="text-xs text-muted-foreground">{correction.reason}</span>
										{#if correction.poolOverride}
											<span class="text-xs text-muted-foreground">Outside normal pool. Saved as an override.</span>
										{/if}
									</div>
								{/each}
							</div>
						{/if}
						<Button type="submit">
							<Save size={16} aria-hidden="true" />
							Save
						</Button>
						<Button variant="outline" type="button" onclick={closeCorrection}>Cancel</Button>
					</form>
				{:else}
					<div>
						<p class="text-xs font-medium text-muted-foreground">Run Controls</p>
						<h3 class="text-sm font-semibold text-foreground">Official record</h3>
					</div>
					<div class="grid gap-3">
						<p class="text-xs text-muted-foreground">Use Change Assignment on a roster row to record who actually served.</p>
						{#if !detailReview.isInvalidated && detailReview.calendarState !== 'applied'}
							<form method="POST" action={applyAcceptedRunAction}>
								<input type="hidden" name="runId" value={historyDetailRun.id} />
								<Button type="submit" class="w-full">
									<RefreshCw size={16} aria-hidden="true" />
									{detailReview.calendarState === 'reapply' ? 'Re-apply to Calendar' : 'Apply to Calendar'}
								</Button>
							</form>
						{/if}
						{#if detailReview.canInvalidate}
							<Button
								variant="destructive"
								type="button"
								aria-expanded={confirmingInvalidationRunId === historyDetailRun.id}
								onclick={() => (confirmingInvalidationRunId = confirmingInvalidationRunId === historyDetailRun.id ? null : historyDetailRun.id)}
							>
								<Trash2 size={16} aria-hidden="true" />
								Invalidate run
							</Button>
						{/if}
						{#if detailReview.canInvalidate && confirmingInvalidationRunId === historyDetailRun.id}
							<form class="grid gap-3 rounded-md border border-destructive/50 bg-destructive/5 p-3" method="POST" action={invalidateAcceptedRunAction}>
								<h4 class="text-xs font-semibold text-destructive">Remove this official run from Calendar</h4>
								<p class="text-xs text-muted-foreground">
									Run {historyDetailRun.startDate} to {historyDetailRun.endDate} will be marked invalidated. Linked Calendar
									assignments will be removed.
								</p>
								<input type="hidden" name="runId" value={historyDetailRun.id} />
								<Button variant="destructive" type="submit">Confirm invalidation</Button>
								<Button variant="outline" type="button" onclick={() => (confirmingInvalidationRunId = null)}>Keep run</Button>
							</form>
						{/if}
						{#if !detailReview.canInvalidate && detailReview.isInvalidated}
							<p class="text-xs text-muted-foreground">This run is invalidated and available for view only.</p>
						{:else if !detailReview.canInvalidate}
							<p class="text-xs text-muted-foreground">Only the latest accepted run can be invalidated.</p>
						{/if}
					</div>
				{/if}
			</aside>
		</section>
	{/if}
{:else}
	<section class="grid gap-4" aria-label="Accepted Duty Roster history">
		<p class="text-sm text-muted-foreground">
			Accepted runs are immutable history snapshots of the roster as it was generated. Official exports are produced from accepted history.
		</p>
		<div class="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Duty Roster history summary">
			<div class="grid gap-1 rounded-md border border-border bg-card p-3">
				<Calendar size={18} class="text-muted-foreground" aria-hidden="true" />
				<span class="text-xs text-muted-foreground">Latest accepted</span>
				<strong class="text-xs font-semibold text-foreground">{latestRun ? formatDateTime(latestRun.acceptedAt) : '-'}</strong>
			</div>
			<div class="grid gap-1 rounded-md border border-border bg-card p-3">
				<Database size={18} class="text-muted-foreground" aria-hidden="true" />
				<span class="text-xs text-muted-foreground">Accepted runs</span>
				<strong class="text-xs font-semibold text-foreground">{acceptedRunCount}</strong>
			</div>
			<div class="grid gap-1 rounded-md border border-border bg-card p-3">
				<Wrench size={18} class="text-muted-foreground" aria-hidden="true" />
				<span class="text-xs text-muted-foreground">Corrections</span>
				<strong class="text-xs font-semibold text-foreground">{pendingCorrectionCount}</strong>
			</div>
			<div class="grid gap-1 rounded-md border border-border bg-card p-3">
				<ShieldCheck size={18} class="text-muted-foreground" aria-hidden="true" />
				<span class="text-xs text-muted-foreground">Can invalidate</span>
				<strong class="text-xs font-semibold text-foreground">{latestRun?.status === 'accepted' ? 'Yes' : 'No'}</strong>
			</div>
		</div>

		<div class="grid gap-0 rounded-md border border-border bg-card">
			<div class="flex flex-wrap items-end gap-3 border-b border-border px-4 py-3">
				<label class="grid gap-1">
					<span class="sr-only">Search history</span>
					<Input type="search" placeholder="Search history..." bind:value={historySearch} class="w-48" />
				</label>
				<label class="grid gap-1">
					<span class="text-xs font-medium text-muted-foreground">State</span>
					<Select.Root type="single" bind:value={historyStateFilter}>
						<Select.Trigger class="w-40" aria-label="History state filter">
							{historyStateFilterLabel}
						</Select.Trigger>
						<Select.Content>
							{#each historyStateOptions as option (option.value)}
								<Select.Item value={option.value} label={option.label} />
							{/each}
						</Select.Content>
					</Select.Root>
				</label>
				<Button variant="outline" size="sm" type="button" onclick={resetHistoryFilters}>
					<RefreshCw size={14} aria-hidden="true" />
					Reset
				</Button>
			</div>

			<div class="min-w-0 overflow-x-auto">
				<table class="w-full text-sm" aria-label="Duty Roster accepted runs">
					<thead>
						<tr class="border-b border-border">
							<th class="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Run</th>
							<th class="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Calendar</th>
							<th class="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Corrections</th>
							<th class="px-4 py-2 text-left text-xs font-medium text-muted-foreground">State</th>
							<th class="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Actions</th>
						</tr>
					</thead>
					<tbody>
						{#each filteredAcceptedRuns as run (run.id)}
							<tr
								class={[
									'border-b border-border transition-colors',
									run.id === latestHistoryRunId && 'bg-muted/30'
								]}
							>
								<td class="px-4 py-2.5">
									<span class="block text-sm font-medium text-foreground">{formatDate(run.startDate)} to {formatDate(run.endDate)}</span>
									<span class="block text-xs text-muted-foreground">Accepted {formatDateTime(run.acceptedAt)}</span>
									{#if run.id === latestHistoryRunId}
										<Badge variant="info" class="mt-1 w-fit">Latest</Badge>
									{/if}
								</td>
								<td class="px-4 py-2.5">
									<span class="block text-xs font-medium text-foreground">{run.appliedAt ? 'Calendar' : 'History'}</span>
									<span class="block text-xs text-muted-foreground">{calendarStateLabel(run)}</span>
									<span class="block text-xs text-muted-foreground" title={acceptedByLabel(run)}>By {acceptedByLabel(run)}</span>
								</td>
								<td class="px-4 py-2.5 text-center text-sm font-medium text-foreground">{run.corrections.length}</td>
								<td class="px-4 py-2.5"><Badge variant={runStatusVariant(run)}>{runStatusLabel(run)}</Badge></td>
								<td class="px-4 py-2.5">
									<div class="flex items-center gap-1">
										<Button variant="outline" size="sm" href={historyDetailHref(run, 'roster')} aria-label={formatDate(run.startDate) + ' to ' + formatDate(run.endDate)}>
											<Eye size={14} aria-hidden="true" />
											Open
										</Button>
										{#if run.status === 'accepted'}
											<Button variant="outline" size="sm" type="button" onclick={() => printAcceptedRun(run)}>
												<Printer size={14} aria-hidden="true" />
												Print
											</Button>
										{/if}
									</div>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
			<div class="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3" aria-label="History pagination">
				<p class="text-xs text-muted-foreground">
					{#if historyPage}
						Page {historyPage.page}. Showing {filteredAcceptedRuns.length} of {acceptedRuns.length} loaded runs.
					{:else}
						Showing {filteredAcceptedRuns.length} of {acceptedRuns.length} loaded runs.
					{/if}
				</p>
				<div class="flex items-center gap-2">
					{#if historyPage?.previousPage}
						<Button variant="outline" size="sm" href={historyPageHref(historyPage.previousPage)}>Newer</Button>
					{:else}
						<Button variant="outline" size="sm" disabled>Newer</Button>
					{/if}
					{#if historyPage?.hasMore && historyPage.nextPage}
						<Button variant="outline" size="sm" href={historyPageHref(historyPage.nextPage)}>Older</Button>
					{:else}
						<Button variant="outline" size="sm" disabled>Older</Button>
					{/if}
				</div>
			</div>
		</div>
	</section>
{/if}
