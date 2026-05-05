<script lang="ts">
	import SearchSelect from '$lib/components/ui/SearchSelect.svelte';
	import Badge from '$lib/components/ui/Badge.svelte';
	import DataTable from '$lib/components/ui/data-table/DataTable.svelte';
	import { printDutyRosterForBrowser } from '$features/duty-roster/export/dutyRosterBrowserExport';
	import type {
		DutyRosterTemplate,
		DutyRosterTemplateAcceptedRun
	} from '$features/duty-roster/templates/dutyRosterTemplates';
	import {
		acceptedCellDisplay,
		acceptedHistoryRows,
		acceptedSnapshot,
		calendarActionState,
		correctionKey,
		correctionPersonName,
		issueLabel,
		issueTitle,
		personnelOptionItems,
		type DutyRosterWorkspaceActionForm,
		type DutyRosterWorkspaceReadModel
	} from '$features/duty-roster/workspace/dutyRosterWorkspaceReadModel';

	let {
		basePath,
		selectedTemplate,
		actionForm,
		acceptedRuns,
		historyDetailRun,
		latestHistoryRunId,
		historyMode,
		acceptedHistoryColumns,
		applyAcceptedRunAction,
		invalidateAcceptedRunAction,
		correctAcceptedRunAction
	}: {
		basePath: string;
		selectedTemplate: DutyRosterTemplate;
		actionForm: DutyRosterWorkspaceActionForm | null;
		acceptedRuns: DutyRosterTemplateAcceptedRun[];
		historyDetailRun: DutyRosterTemplateAcceptedRun | null;
		latestHistoryRunId: string | null;
		historyMode: DutyRosterWorkspaceReadModel['historyMode'];
		acceptedHistoryColumns: DutyRosterWorkspaceReadModel['acceptedHistoryColumns'];
		applyAcceptedRunAction: string;
		invalidateAcceptedRunAction: string;
		correctAcceptedRunAction: string;
	} = $props();

	let editingCorrections = $state<Record<string, boolean>>({});
	let confirmingInvalidationRunId = $state<string | null>(null);
	let selectedCorrectionAssignees = $state<Record<string, string>>({});

	function historyDetailHref(run: DutyRosterTemplateAcceptedRun, mode: 'roster' | 'da6'): string {
		const detailPath = `${basePath}/${selectedTemplate.slug}/history/${run.id}`;
		return mode === 'da6' ? `${detailPath}?mode=da6` : detailPath;
	}

	function isCorrectionOpen(runId: string, date: string): boolean {
		return Boolean(editingCorrections[correctionKey(runId, date)]);
	}

	function selectedCorrectionAssigneeId(runId: string, date: string): string {
		return selectedCorrectionAssignees[correctionKey(runId, date)] ?? '';
	}

	function printAcceptedRun(run: DutyRosterTemplateAcceptedRun): void {
		printDutyRosterForBrowser({ acceptedSnapshot: acceptedSnapshot(run), statusLabel: 'Official' });
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
{:else}
	{#if historyDetailRun}
		{@const detailRunInvalidated = historyDetailRun.status === 'invalidated'}
		{@const detailCalendarState = calendarActionState(historyDetailRun)}
		{@const detailCanInvalidate = !detailRunInvalidated && historyDetailRun.id === latestHistoryRunId}
		<section class="history-detail-banner card card-flat" aria-label="Official Duty Roster record">
			<a class="btn btn-secondary btn-sm" href={`${basePath}/${selectedTemplate.slug}/history`}> Back to History </a>
			<div class="history-detail-banner__identity">
				<div class="history-detail-banner__title-row">
					<h4>Run {historyDetailRun.startDate} to {historyDetailRun.endDate}</h4>
					{#if detailRunInvalidated}
						<span class="chip chip-error">Invalidated</span>
					{/if}
				</div>
			</div>
			<div class="history-detail-banner__controls">
				<div class="view-switch admin-segmented" role="group" aria-label="History detail review mode">
					<a class:active={historyMode === 'list'} href={historyDetailHref(historyDetailRun, 'roster')}> Roster </a>
					<a class:active={historyMode === 'matrix'} href={historyDetailHref(historyDetailRun, 'da6')}> DA6 Matrix </a>
				</div>
				<div class="accepted-detail-actions" aria-label="Official record actions">
					<button class="btn btn-secondary btn-sm" type="button" onclick={() => printAcceptedRun(historyDetailRun)}>
						Print Record
					</button>
					{#if !detailRunInvalidated && detailCalendarState !== 'applied'}
						<form class="accept-preview-form" method="POST" action={applyAcceptedRunAction}>
							<input type="hidden" name="runId" value={historyDetailRun.id} />
							<button class="btn btn-primary btn-sm" type="submit">
								{detailCalendarState === 'reapply' ? 'Re-apply to Calendar' : 'Apply to Calendar'}
							</button>
						</form>
					{/if}
					{#if detailCanInvalidate}
						<button
							class="btn btn-danger btn-sm"
							type="button"
							aria-expanded={confirmingInvalidationRunId === historyDetailRun.id}
							onclick={() =>
								(confirmingInvalidationRunId =
									confirmingInvalidationRunId === historyDetailRun.id ? null : historyDetailRun.id)}
						>
							Invalidate run
						</button>
					{/if}
				</div>
			</div>
		</section>
		{#if detailCanInvalidate && confirmingInvalidationRunId === historyDetailRun.id}
			<section class="invalidation-confirm" aria-labelledby="invalidation-confirm-heading">
				<div>
					<p class="eyebrow">Invalidation Review</p>
					<h4 id="invalidation-confirm-heading">Remove this official run from Calendar</h4>
					<p>
						Run {historyDetailRun.startDate} to {historyDetailRun.endDate} will be marked invalidated. Linked Calendar assignments
						for this run will be removed. This action is only available for the latest accepted run.
					</p>
				</div>
				<form class="invalidation-confirm__actions" method="POST" action={invalidateAcceptedRunAction}>
					<input type="hidden" name="runId" value={historyDetailRun.id} />
					<button class="btn btn-danger btn-sm" type="submit">Confirm invalidation</button>
					<button class="btn btn-secondary btn-sm" type="button" onclick={() => (confirmingInvalidationRunId = null)}>
						Keep run
					</button>
				</form>
			</section>
		{/if}
	{/if}
	<div class="history-list">
		{#each historyDetailRun ? [historyDetailRun] : acceptedRuns as run (run.id)}
			{@const snapshot = acceptedSnapshot(run)}
			{@const isInvalidated = run.status === 'invalidated'}
			{@const calendarState = calendarActionState(run)}
			<div
				class="history-run card card-flat"
				class:history-run--detail={historyDetailRun}
				aria-label={`${run.templateName} accepted run`}
			>
				{#if !historyDetailRun}
					<a class="history-run__header" href={historyDetailHref(run, 'roster')}>
						<div>
							<h4>
								Run {run.startDate} to {run.endDate}
							</h4>
							<p>{run.startDate} to {run.endDate}</p>
						</div>
						<div class="accepted-record-state">
							<div class="run-lifecycle" aria-label="Official record lifecycle">
								<span class="run-lifecycle__step run-lifecycle__step--complete">Draft</span>
								<span
									class="run-lifecycle__step"
									class:run-lifecycle__step--complete={!isInvalidated}
									class:run-lifecycle__step--invalid={isInvalidated}
								>
									{isInvalidated ? 'Invalidated' : 'Official'}
								</span>
								<span
									class="run-lifecycle__step"
									class:run-lifecycle__step--complete={!isInvalidated && calendarState === 'applied'}
									class:run-lifecycle__step--attention={!isInvalidated && calendarState === 'reapply'}
								>
									{#if isInvalidated}
										Closed
									{:else if calendarState === 'applied'}
										Applied
									{:else if calendarState === 'reapply'}
										Needs sync
									{:else}
										Not applied
									{/if}
								</span>
							</div>
							<span class="open-record-note">Open official record</span>
						</div>
					</a>
				{/if}
				{#if historyDetailRun}
					{#if run.calendarAssignmentsEdited && !isInvalidated}
						<p class="history-warning admin-alert admin-alert--warning">
							Calendar assignments linked to this run changed after apply. Re-applying may overwrite linked Calendar
							assignments, and invalidation will remove the run footprint after confirmation.
						</p>
					{/if}

					{#if historyMode === 'list'}
						<div class="accepted-history-table">
							<DataTable
								data={acceptedHistoryRows(run, snapshot, isInvalidated)}
								columns={acceptedHistoryColumns}
								ariaLabel="Accepted Duty Roster list"
								emptyMessage="No accepted Duty Roster rows are available."
								rowKey={(row) => row.id}
								compact
								stickyHeader
							>
								{#snippet cell(tableRow, col)}
									{#if col.key === 'date'}
										<span class="cell-date">{tableRow.finalRow.date}</span>
									{:else if col.key === 'assigned'}
										<div class="preview-selection">
											{#if tableRow.finalRow.finalDisplay}
												<strong
													>{tableRow.finalRow.finalDisplay.rank}
													{tableRow.finalRow.finalDisplay.lastName}, {tableRow.finalRow.finalDisplay.firstName}</strong
												>
											{:else}
												Unfilled
											{/if}
											{#if tableRow.finalRow.assignmentSource === 'manual' && tableRow.finalRow.generatedDisplay}
												<small>
													Generated: {tableRow.finalRow.generatedDisplay.rank}
													{tableRow.finalRow.generatedDisplay.lastName}, {tableRow.finalRow.generatedDisplay.firstName}
												</small>
											{/if}
											{#if tableRow.correction?.replacementDisplay}
												<small>
													Actual: {tableRow.correction.replacementDisplay.rank}
													{tableRow.correction.replacementDisplay.lastName}, {tableRow.correction.replacementDisplay
														.firstName}
												</small>
											{/if}
										</div>
									{:else if col.key === 'source'}
										{#if tableRow.correction}
											<Badge label="CORRECTED" variant="outlined" />
										{:else if tableRow.finalRow.assignmentSource === 'manual'}
											<Badge label="MANUAL" color="var(--color-warning-bg)" textColor="var(--color-warning-text)" />
										{:else}
											<Badge label="Generated" variant="outlined" />
										{/if}
									{:else if col.key === 'warnings'}
										<div class="preview-selection">
											{#if tableRow.finalRow.warnings.length}
												<span
													class="issue-badge chip chip-warning"
													title={issueTitle(tableRow.finalRow.warnings)}
													aria-label={`Issue explanation: ${issueTitle(tableRow.finalRow.warnings)}`}
												>
													{issueLabel(tableRow.finalRow.warnings)}
												</span>
												<ul class="manual-warnings" aria-label={`Accepted warnings for ${tableRow.finalRow.date}`}>
													{#each tableRow.finalRow.warnings as warning (warning.code)}
														<li>{warning.message}</li>
													{/each}
												</ul>
											{/if}
										</div>
									{:else if col.key === 'review'}
										<div class="preview-selection review-state-cell">
											{#if tableRow.correction}
												<div class="correction-summary">
													<strong>Correction</strong>
													<small>
														{correctionPersonName(
															tableRow.correction.replacementDisplay,
															tableRow.correction.replacementAssigneeId
														)}
														performed duty for
														{correctionPersonName(
															tableRow.correction.originalDisplay,
															tableRow.correction.originalAssigneeId
														)}.
													</small>
													<small>Reason: {tableRow.correction.reason}</small>
													<small
														>{tableRow.correction.countsTowardFuture
															? 'Counts toward future DA6 runs.'
															: 'Non-counting because this run is invalidated.'}</small
													>
												</div>
											{/if}
											{#if tableRow.finalRow.reason}
												<small>Reason: {tableRow.finalRow.reason}</small>
											{/if}
											{#if !tableRow.isInvalidated && tableRow.finalRow.finalAssigneeId && historyDetailRun && !isCorrectionOpen(tableRow.run.id, tableRow.finalRow.date)}
												<button
													class="btn btn-secondary btn-sm change-assignment-button"
													type="button"
													onclick={() =>
														(editingCorrections = {
															...editingCorrections,
															[correctionKey(tableRow.run.id, tableRow.finalRow.date)]: true
														})}
												>
													Change Assignment
												</button>
											{:else if !tableRow.isInvalidated && tableRow.finalRow.finalAssigneeId && historyDetailRun}
												<form class="correction-form" method="POST" action={correctAcceptedRunAction}>
													<input type="hidden" name="runId" value={tableRow.run.id} />
													<input type="hidden" name="runRowDate" value={tableRow.finalRow.date} />
													<input
														type="hidden"
														name="replacementAssigneeId"
														value={selectedCorrectionAssigneeId(tableRow.run.id, tableRow.finalRow.date)}
													/>
													<label>
														<span>Actual Soldier</span>
														<SearchSelect
															options={personnelOptionItems(
																tableRow.snapshot.selectionPersonnel,
																tableRow.finalRow.finalAssigneeId
															)}
															value={selectedCorrectionAssigneeId(tableRow.run.id, tableRow.finalRow.date)}
															ariaLabel={`Actual Soldier for ${tableRow.finalRow.date}`}
															placeholder="Search Soldier"
															clearable={false}
															compact
															onchange={(value) => {
																selectedCorrectionAssignees = {
																	...selectedCorrectionAssignees,
																	[correctionKey(tableRow.run.id, tableRow.finalRow.date)]: value
																};
															}}
														/>
													</label>
													<label>
														<span>Reason</span>
														<input class="input" name="reason" placeholder="Reason for correction" required />
													</label>
													<div class="inline-edit-actions">
														<button class="btn btn-primary btn-sm" type="submit">Save</button>
														<button
															class="btn btn-secondary btn-sm"
															type="button"
															onclick={() =>
																(editingCorrections = {
																	...editingCorrections,
																	[correctionKey(tableRow.run.id, tableRow.finalRow.date)]: false
																})}
														>
															Cancel
														</button>
													</div>
												</form>
											{:else if tableRow.isInvalidated && tableRow.run.corrections.some((item) => item.runRowDate === tableRow.finalRow.date)}
												<small>Correction trail is locked with this invalidated run.</small>
											{/if}
										</div>
									{:else}
										{String(col.value(tableRow) ?? '')}
									{/if}
								{/snippet}
							</DataTable>
						</div>
					{/if}

					{#if historyDetailRun && historyMode === 'matrix'}
						<div class="matrix-scroll">
							<table class="da6-matrix" aria-label="Accepted DA6 matrix">
								<thead>
									<tr>
										<th scope="col">Soldier</th>
										{#each snapshot.da6.columns as column (column.date)}
											<th scope="col">{column.date}</th>
										{/each}
									</tr>
								</thead>
								<tbody>
									{#each snapshot.da6.rows as row (row.personnelId)}
										<tr>
											<th scope="row">{row.display.rank} {row.display.lastName}</th>
											{#each row.cells as cell (cell.date)}
												<td class:assigned={cell.assigned}>{acceptedCellDisplay(cell)}</td>
											{/each}
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
					{/if}
				{/if}
			</div>
		{/each}
	</div>
{/if}
