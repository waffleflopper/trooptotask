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
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { NativeSelect } from '$lib/components/ui/native-select';
	import * as OperationalMatrix from '$lib/components/ui/operational-matrix';
	import type { OperationalMatrixColumn, OperationalMatrixRow } from '$lib/components/ui/operational-matrix';
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

	function runStatusClass(run: DutyRosterTemplateAcceptedRun): string {
		if (run.status === 'invalidated') return 'status-chip status-chip--danger';
		if (run.appliedAt && !run.calendarAssignmentsEdited) return 'status-chip status-chip--success';
		if (run.appliedAt && run.calendarAssignmentsEdited) return 'status-chip status-chip--warning';
		return 'status-chip';
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
	<p class="form-error settings-error" role="alert">{actionForm.applyError}</p>
{/if}
{#if actionForm?.invalidateError}
	<p class="form-error settings-error" role="alert">{actionForm.invalidateError}</p>
{/if}
{#if actionForm?.correctionError}
	<p class="form-error settings-error" role="alert">{actionForm.correctionError}</p>
{/if}
{#if acceptedRuns.length === 0}
	<div class="admin-empty">History is empty until a DA6 run is accepted.</div>
{:else if historyDetailRun}
	{#if detailReview}
		<section class="run-detail-workspace" aria-label="Accepted Duty Roster record">
			<div class="run-detail-main">
				<header class="run-record-bar">
					<Button variant="outline" size="sm" href={historyListHref()}>Back to history</Button>
					<div class="run-record-meta" aria-label="Run status">
						<span class={runStatusClass(historyDetailRun)}>{runStatusLabel(historyDetailRun)}</span>
						{#if historyDetailRun.appliedAt}
							<span><Calendar size={15} aria-hidden="true" /> Applied to Calendar</span>
						{/if}
						<span class="accepted-by-meta" title={`Accepted by ${acceptedByLabel(historyDetailRun)}`}>
							<ShieldCheck size={15} aria-hidden="true" />
							<span>Accepted by {acceptedByLabel(historyDetailRun)}</span>
						</span>
						<span
							><Calendar size={15} aria-hidden="true" />
							{formatDate(historyDetailRun.startDate)} to {formatDate(historyDetailRun.endDate)}</span
						>
					</div>
					<div class="run-record-actions">
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
										<List size={15} aria-hidden="true" />
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
										<Database size={15} aria-hidden="true" />
										DA6
									</span>
								</Tabs.Trigger>
							</Tabs.List>
						</Tabs.Root>
						<Button variant="outline" size="sm" type="button" onclick={() => printAcceptedRun(historyDetailRun)}>
							<Printer size={15} aria-hidden="true" />
							Print
						</Button>
					</div>
				</header>

				{#if historyDetailRun.calendarAssignmentsEdited && !detailReview.isInvalidated}
					<p class="history-warning admin-alert admin-alert--warning">
						Calendar assignments linked to this run changed after apply. Re-applying may overwrite linked Calendar
						assignments, and invalidation will remove the run footprint after confirmation.
					</p>
				{/if}

				{#if historyMode === 'list'}
					<div class="accepted-run-grid" role="table" aria-label="Accepted Duty Roster list">
						<div class="accepted-run-grid__row accepted-run-grid__head" role="row">
							<span role="columnheader">Date</span>
							<span role="columnheader">Accepted Soldier</span>
							<span role="columnheader">Actual Served</span>
							<span role="columnheader">Correction</span>
							<span role="columnheader">Reason</span>
							<span role="columnheader">Calendar</span>
							<span role="columnheader">Audit</span>
						</div>
						{#each detailReview.rows as tableRow (tableRow.id)}
							{@const rowKey = correctionKey(tableRow.run.id, tableRow.date)}
							{@const actualDisplay = tableRow.correction?.replacementDisplay ?? tableRow.finalRow.finalDisplay}
							<div
								class="accepted-run-grid__row"
								class:accepted-run-grid__row--selected={selectedCorrectionKey === rowKey}
								role="row"
							>
								<span class="run-date-cell" role="cell">{formatDutyDate(tableRow.date)}</span>
								<span class="soldier-cell" role="cell">
									<strong>{soldierName(tableRow.finalRow.finalDisplay)}</strong>
									<small>{soldierGroup(tableRow.finalRow.finalDisplay)}</small>
								</span>
								<span class="soldier-cell" role="cell">
									<strong>{soldierName(actualDisplay)}</strong>
									<small>{soldierGroup(actualDisplay)}</small>
									{#if tableRow.correctionSummary}
										<small>Actual: {tableRow.correctionSummary.replacementName}</small>
									{/if}
								</span>
								<span role="cell">
									{#if tableRow.correction}
										<span class="status-chip status-chip--warning">CORRECTED</span>
									{:else}
										<span class="muted-dash">-</span>
									{/if}
								</span>
								<span class="reason-cell" role="cell">
									{tableRow.correctionSummary?.reason ?? tableRow.reasonText ?? '-'}
									{#if tableRow.correctionSummary}
										<small>
											{tableRow.correctionSummary.replacementName} performed duty for
											{tableRow.correctionSummary.originalName}.
										</small>
										<small>{tableRow.correctionSummary.countText}</small>
										{#if tableRow.correctionSummary.overrideText}
											<small>{tableRow.correctionSummary.overrideText}</small>
										{/if}
									{/if}
								</span>
								<span class="calendar-cell" role="cell">
									<strong>{historyDetailRun.appliedAt ? 'Calendar' : 'History record'}</strong>
									<small>{detailReview.calendarStepLabel}</small>
								</span>
								<span role="cell">
									{#if tableRow.canCorrect}
										<Button
											variant="link"
											size="sm"
											type="button"
											onclick={() => openCorrection(tableRow.run.id, tableRow.date)}
										>
											<Eye size={15} aria-hidden="true" />
											Change Assignment
										</Button>
									{:else if tableRow.correctionLockedText}
										<small>{tableRow.correctionLockedText}</small>
									{:else}
										<span class="muted-dash">-</span>
									{/if}
								</span>
							</div>
						{/each}
					</div>
					<p class="history-count-note">Showing 1-{detailReview.rows.length} of {detailReview.rows.length} entries</p>
				{:else}
					<OperationalMatrix.Root rows={acceptedMatrixRows} columns={acceptedMatrixColumns} readOnly>
						<OperationalMatrix.Viewport ariaLabel="Accepted DA6 matrix viewport" class="rounded-lg border bg-card">
							<OperationalMatrix.Table
								ariaLabel="Accepted DA6 matrix"
								class="min-w-max table-fixed text-sm [&_[data-matrix-cell]]:h-10 [&_[data-matrix-cell]]:w-10 [&_[data-matrix-cell]]:border [&_[data-matrix-cell]]:border-border [&_[data-matrix-cell]]:p-0 [&_[data-matrix-column-header]]:border [&_[data-matrix-column-header]]:border-border [&_[data-matrix-column-header]]:bg-muted/70 [&_[data-slot=operational-matrix-cell-content]]:grid [&_[data-slot=operational-matrix-cell-content]]:h-10 [&_[data-slot=operational-matrix-cell-content]]:place-items-center"
							>
								<OperationalMatrix.Header>
									<OperationalMatrix.HeaderRow>
										<OperationalMatrix.CornerCell
											sticky
											class="sticky left-0 top-0 z-30 min-w-40 bg-muted px-3 text-left"
										>
											Soldier
										</OperationalMatrix.CornerCell>
										{#each acceptedMatrixColumns as column (column.id)}
											<OperationalMatrix.ColumnHeader
												{column}
												orientation="vertical"
												sticky
												class="sticky top-0 z-20 bg-muted"
											/>
										{/each}
									</OperationalMatrix.HeaderRow>
								</OperationalMatrix.Header>
								<OperationalMatrix.Body>
									{#each acceptedMatrixRows as row (row.id)}
										<OperationalMatrix.Row {row} class="bg-card hover:bg-muted/20">
											<OperationalMatrix.RowHeader
												{row}
												sticky
												class="sticky left-0 z-10 min-w-40 border bg-card px-3 py-2 text-left font-medium"
											>
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

			<aside class="record-correction-panel" aria-label="Run correction controls">
				{#if selectedCorrectionRow}
					<div class="record-correction-panel__header">
						<div>
							<p class="eyebrow">Record Correction</p>
							<h3>{formatDate(selectedCorrectionRow.date)}</h3>
						</div>
						<Button
							variant="ghost"
							size="icon-sm"
							type="button"
							aria-label="Close correction panel"
							onclick={closeCorrection}
						>
							<X size={20} aria-hidden="true" />
						</Button>
					</div>
					<form class="record-correction-form" method="POST" action={correctAcceptedRunAction}>
						<input type="hidden" name="runId" value={selectedCorrectionRow.run.id} />
						<input type="hidden" name="runRowDate" value={selectedCorrectionRow.date} />
						<input
							type="hidden"
							name="replacementAssigneeId"
							value={selectedCorrectionAssigneeId(selectedCorrectionRow.run.id, selectedCorrectionRow.date)}
						/>
						<div class="record-correction-field">
							<span>Originally Assigned Soldier</span>
							<div class="readonly-field">
								<strong>{soldierName(selectedCorrectionRow.finalRow.finalDisplay)}</strong>
								<small>{soldierGroup(selectedCorrectionRow.finalRow.finalDisplay)}</small>
							</div>
						</div>
						{#if selectedCorrectionRow.correctionSummary}
							<p class="correction-note">
								Actual: {selectedCorrectionRow.correctionSummary.replacementName}
								performed duty for {selectedCorrectionRow.correctionSummary.originalName}.
								{selectedCorrectionRow.correctionSummary.countText}
							</p>
							{#if selectedCorrectionRow.correctionSummary.overrideText}
								<p class="correction-note correction-note--warning">
									{selectedCorrectionRow.correctionSummary.overrideText}
								</p>
							{/if}
						{/if}
						<label>
							<span>Soldier Who Actually Served</span>
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
						</label>
						{#if selectedCorrectionOverrideWarning()}
							<p class="correction-note correction-note--warning">{selectedCorrectionOverrideWarning()}</p>
						{/if}
						<label>
							<span>Reason</span>
							<Input name="reason" placeholder="Reason for correction" required />
						</label>
						<p class="correction-note">
							Corrections update future counts and histories based on the Soldier who actually performed the duty.
						</p>
						{#if historyDetailRun.corrections.length}
							<div class="prior-corrections">
								<p>Prior corrections for this run</p>
								{#each historyDetailRun.corrections as correction (correction.id)}
									<div class="prior-correction-row">
										<strong>{formatDateTime(correction.correctedAt)}</strong>
										<span
											>{soldierName(correction.originalDisplay)} to {soldierName(correction.replacementDisplay)}</span
										>
										<small>{correction.reason}</small>
										{#if correction.poolOverride}
											<small>Outside normal pool. Saved as an override.</small>
										{/if}
									</div>
								{/each}
							</div>
						{/if}
						<Button class="correction-save-button" type="submit">
							<Save size={16} aria-hidden="true" />
							Save
						</Button>
						<Button class="correction-save-button" variant="outline" type="button" onclick={closeCorrection}
							>Cancel</Button
						>
					</form>
				{:else}
					<div class="record-correction-panel__header">
						<div>
							<p class="eyebrow">Run Controls</p>
							<h3>Official record</h3>
						</div>
					</div>
					<div class="run-control-stack">
						<p class="correction-note">Use Change Assignment on a roster row to record who actually served.</p>
						{#if !detailReview.isInvalidated && detailReview.calendarState !== 'applied'}
							<form method="POST" action={applyAcceptedRunAction}>
								<input type="hidden" name="runId" value={historyDetailRun.id} />
								<Button class="correction-save-button" type="submit">
									<RefreshCw size={16} aria-hidden="true" />
									{detailReview.calendarState === 'reapply' ? 'Re-apply to Calendar' : 'Apply to Calendar'}
								</Button>
							</form>
						{/if}
						{#if detailReview.canInvalidate}
							<Button
								class="correction-save-button"
								variant="destructive"
								type="button"
								aria-expanded={confirmingInvalidationRunId === historyDetailRun.id}
								onclick={() =>
									(confirmingInvalidationRunId =
										confirmingInvalidationRunId === historyDetailRun.id ? null : historyDetailRun.id)}
							>
								<Trash2 size={16} aria-hidden="true" />
								Invalidate run
							</Button>
						{/if}
						{#if detailReview.canInvalidate && confirmingInvalidationRunId === historyDetailRun.id}
							<form class="invalidation-confirm" method="POST" action={invalidateAcceptedRunAction}>
								<h4>Remove this official run from Calendar</h4>
								<p>
									Run {historyDetailRun.startDate} to {historyDetailRun.endDate} will be marked invalidated. Linked Calendar
									assignments for this run will be removed. This action is only available for the latest accepted run.
								</p>
								<input type="hidden" name="runId" value={historyDetailRun.id} />
								<Button class="correction-save-button" variant="destructive" type="submit">Confirm invalidation</Button>
								<Button
									class="correction-save-button"
									variant="outline"
									type="button"
									onclick={() => (confirmingInvalidationRunId = null)}
								>
									Keep run
								</Button>
							</form>
						{/if}
						{#if !detailReview.canInvalidate && detailReview.isInvalidated}
							<p class="correction-note">This run is invalidated and available for view only.</p>
						{:else if !detailReview.canInvalidate}
							<p class="correction-note">Only the latest accepted run can be invalidated.</p>
						{/if}
					</div>
				{/if}
			</aside>
		</section>
	{/if}
{:else}
	<section class="history-overview" aria-label="Accepted Duty Roster history">
		<p class="history-overview__lede">
			Accepted runs are immutable history snapshots of the roster as it was generated. Official exports are produced
			from accepted history.
		</p>
		<div class="history-stat-strip" aria-label="Duty Roster history summary">
			<div>
				<Calendar size={26} aria-hidden="true" />
				<span>Latest accepted run</span>
				<strong>{latestRun ? formatDateTime(latestRun.acceptedAt) : '-'}</strong>
			</div>
			<div>
				<Database size={26} aria-hidden="true" />
				<span>Loaded accepted runs</span>
				<strong>{acceptedRunCount}</strong>
			</div>
			<div>
				<Wrench size={26} aria-hidden="true" />
				<span>Corrections recorded</span>
				<strong>{pendingCorrectionCount}</strong>
			</div>
			<div>
				<ShieldCheck size={26} aria-hidden="true" />
				<span>Eligible for invalidation</span>
				<strong>{latestRun?.status === 'accepted' ? 'Yes' : 'No'}</strong>
			</div>
		</div>

		<div class="history-ledger">
			<div class="history-toolbar">
				<label class="history-search">
					<span class="sr-only">Search history</span>
					<Input type="search" placeholder="Search history..." bind:value={historySearch} />
				</label>
				<label class="history-filter">
					<span>State</span>
					<NativeSelect bind:value={historyStateFilter}>
						<option value="all">All</option>
						<option value="accepted">Accepted</option>
						<option value="invalidated">Invalidated</option>
						<option value="applied">Applied</option>
						<option value="not-applied">Not applied runs</option>
					</NativeSelect>
				</label>
				<Button variant="outline" size="sm" type="button" onclick={resetHistoryFilters}>
					<RefreshCw size={15} aria-hidden="true" />
					Reset filters
				</Button>
			</div>

			<div class="history-ledger-table" role="table" aria-label="Duty Roster accepted runs">
				<div class="history-ledger-table__row history-ledger-table__head" role="row">
					<span role="columnheader">Run</span>
					<span role="columnheader">Calendar</span>
					<span role="columnheader">Corrections</span>
					<span role="columnheader">State</span>
					<span role="columnheader">Actions</span>
				</div>
				{#each filteredAcceptedRuns as run (run.id)}
					<div
						class="history-ledger-table__row"
						class:history-ledger-table__row--latest={run.id === latestHistoryRunId}
						role="row"
					>
						<span class="run-name-cell" role="cell">
							<strong>{formatDate(run.startDate)} to {formatDate(run.endDate)}</strong>
							<small>Accepted {formatDateTime(run.acceptedAt)}</small>
							<span class="open-record-note">Open official record</span>
							{#if run.id === latestHistoryRunId}
								<span class="status-chip status-chip--info">Latest</span>
							{/if}
						</span>
						<span class="calendar-cell" role="cell">
							<strong>{run.appliedAt ? 'Calendar' : 'History record'}</strong>
							<small>{calendarStateLabel(run)}</small>
							<small class="accepted-by-cell" title={acceptedByLabel(run)}>Accepted by {acceptedByLabel(run)}</small>
						</span>
						<span class="corrections-cell" role="cell">
							<small>Corrections</small>
							<span class="correction-count">{run.corrections.length}</span>
						</span>
						<span role="cell"><span class={runStatusClass(run)}>{runStatusLabel(run)}</span></span>
						<span class="history-actions-cell" role="cell">
							<Button
								variant="link"
								size="sm"
								href={historyDetailHref(run, 'roster')}
								aria-label={formatDate(run.startDate) + ' to ' + formatDate(run.endDate)}
							>
								<Eye size={15} aria-hidden="true" />
								Open
							</Button>
							{#if run.status === 'accepted'}
								<Button variant="link" size="sm" type="button" onclick={() => printAcceptedRun(run)}>
									<Printer size={15} aria-hidden="true" />
									Print
								</Button>
							{/if}
						</span>
					</div>
				{/each}
			</div>
			<div class="history-pagination" aria-label="History pagination">
				<p class="history-count-note">
					{#if historyPage}
						Page {historyPage.page}. Showing {filteredAcceptedRuns.length} of {acceptedRuns.length} loaded runs.
					{:else}
						Showing {filteredAcceptedRuns.length} of {acceptedRuns.length} loaded runs.
					{/if}
				</p>
				<div class="history-pagination__actions">
					{#if historyPage?.previousPage}
						<Button variant="outline" size="sm" href={historyPageHref(historyPage.previousPage)}>Newer runs</Button>
					{:else}
						<Button variant="outline" size="sm" disabled>Newer runs</Button>
					{/if}
					{#if historyPage?.hasMore && historyPage.nextPage}
						<Button variant="outline" size="sm" href={historyPageHref(historyPage.nextPage)}>Older runs</Button>
					{:else}
						<Button variant="outline" size="sm" disabled>Older runs</Button>
					{/if}
				</div>
			</div>
		</div>
	</section>
{/if}
