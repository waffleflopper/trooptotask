<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import { AlertTriangle, Calendar, CheckCircle2, Info, Printer, Save, X } from '@lucide/svelte';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { DatePicker } from '$lib/components/ui/date-picker';
	import * as Tabs from '$lib/components/ui/tabs';
	import SearchCombobox from '$lib/components/ui/SearchCombobox.svelte';
	import SkeletonGrid from '$lib/components/ui/SkeletonGrid.svelte';
	import { Textarea } from '$lib/components/ui/textarea';
	import * as OperationalMatrix from '$lib/components/ui/operational-matrix';
	import type { OperationalMatrixColumn, OperationalMatrixRow } from '$lib/components/ui/operational-matrix';
	import { printDutyRosterForBrowser } from '$features/duty-roster/export/dutyRosterBrowserExport';
	import {
		buildDutyRosterPreviewReviewModel,
		type DutyRosterPreviewReviewModel
	} from '$features/duty-roster/workspace/dutyRosterPreviewReview';
	import type { DutyRosterTemplatePreview } from '$features/duty-roster/templates/dutyRosterTemplatePreview';
	import type { DutyRosterGenerateWorkspaceModel } from '$features/duty-roster/workspace/dutyRosterWorkspaceReadModel';

	let { generate }: { generate: DutyRosterGenerateWorkspaceModel } = $props();

	let previewMode = $state<'list' | 'matrix'>('list');
	let generatingPreview = $state(false);
	let activePreviewDate = $state<string | null>(null);
	let selectedPreviewAssignees = $state<Record<string, string>>({});
	let startDateOverride = $state('');
	let endDateOverride = $state('');

	type Da6MatrixCell = NonNullable<DutyRosterPreviewReviewModel['matrix']['rows'][number]['cells'][number]>;
	type Da6MatrixRow = OperationalMatrixRow & { meta: { cells: Da6MatrixCell[] } };
	type Da6MatrixColumn = OperationalMatrixColumn & { meta: { date: string } };

	const selectedTemplate = $derived(generate.selectedTemplate);
	const actionForm = $derived(generate.actionForm);
	const preview = $derived(generate.preview);
	const generateAction = $derived(generate.generateAction);
	const manualPreviewAction = $derived(generate.manualPreviewAction);
	const acceptPreviewAction = $derived(generate.acceptPreviewAction);
	const applyPreviewAction = $derived(generate.applyPreviewAction);
	const historyPath = $derived(generate.historyPath);
	const countReadModel = $derived(generate.countReadModel);
	const acceptedRuns = $derived(generate.acceptedRuns);
	const generateStartDate = $derived(generate.generateStartDate);
	const generateEndDate = $derived(generate.generateEndDate);
	const startDateValue = $derived(startDateOverride || generateStartDate);
	const endDateValue = $derived(endDateOverride || generateEndDate);
	const canGenerate = $derived(generate.canGenerate);
	const previewReview: DutyRosterPreviewReviewModel | null = $derived(
		preview ? buildDutyRosterPreviewReviewModel({ preview, selectedAssigneeIds: selectedPreviewAssignees }) : null
	);
	const activePreviewRow = $derived(previewReview?.rows.find((row) => row.date === activePreviewDate) ?? null);
	const previewMetrics = $derived(
		previewReview?.rows.reduce(
			(metrics, row) => ({
				assignedCount: metrics.assignedCount + (row.finalAssignee ? 1 : 0),
				manualCount: metrics.manualCount + (row.manualSelection ? 1 : 0),
				requiresActionCount: metrics.requiresActionCount + (row.finalAssignee ? 0 : 1),
				warningCount: metrics.warningCount + row.liveWarnings.length
			}),
			{ assignedCount: 0, manualCount: 0, requiresActionCount: 0, warningCount: 0 }
		) ?? { assignedCount: 0, manualCount: 0, requiresActionCount: 0, warningCount: 0 }
	);
	const previewAssignedCount = $derived(previewMetrics.assignedCount);
	const previewManualCount = $derived(previewMetrics.manualCount);
	const previewRequiresActionCount = $derived(previewMetrics.requiresActionCount);
	const previewWarningCount = $derived(previewMetrics.warningCount);
	const previewIsCommitReady = $derived(previewRequiresActionCount === 0 && previewWarningCount === 0);
	const recentAcceptedRuns = $derived(acceptedRuns.slice(0, 3));

	const previewMatrixColumns = $derived<Da6MatrixColumn[]>(
		(previewReview?.matrix.columns ?? []).map((column) => ({
			id: column.date,
			label: dayMonthLabel(column.date),
			meta: { date: column.date }
		}))
	);
	const previewMatrixRows = $derived<Da6MatrixRow[]>(
		(previewReview?.matrix.rows ?? []).map((row) => ({
			id: row.personnelId,
			label: row.soldierLabel,
			meta: { cells: row.cells }
		}))
	);

	function handleGenerateEnhance() {
		generatingPreview = true;

		return async ({ update }: { update: () => Promise<void> }) => {
			await update();
			generatingPreview = false;
		};
	}

	function printDraftPreview(preview: DutyRosterTemplatePreview): void {
		printDutyRosterForBrowser({ templatePreview: preview, statusLabel: 'Draft' });
	}

	function openManualChange(row: DutyRosterPreviewReviewModel['rows'][number]): void {
		activePreviewDate = row.date;
		selectedPreviewAssignees = {
			...selectedPreviewAssignees,
			[row.date]: row.editAssigneeId
		};
	}

	function dateParts(date: string): { weekday: string; label: string } {
		const [year, month, day] = date.split('-').map(Number);
		const value = new Date(Date.UTC(year, month - 1, day));
		const weekday = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'UTC' }).format(value).toUpperCase();
		const label = new Intl.DateTimeFormat('en-US', {
			day: '2-digit',
			month: 'short',
			year: 'numeric',
			timeZone: 'UTC'
		})
			.format(value)
			.toUpperCase();

		return { weekday, label };
	}

	function dayMonthLabel(date: string): string {
		const [year, month, day] = date.split('-').map(Number);
		const value = new Date(Date.UTC(year, month - 1, day));
		const parts = new Intl.DateTimeFormat('en-US', {
			day: '2-digit',
			month: 'short',
			timeZone: 'UTC'
		}).formatToParts(value);
		const dayPart = parts.find((part) => part.type === 'day')?.value ?? date.slice(-2);
		const monthPart = parts.find((part) => part.type === 'month')?.value.toUpperCase() ?? '';

		return `${dayPart}-${monthPart}`;
	}

	function previewMatrixCell(row: Da6MatrixRow, column: Da6MatrixColumn): Da6MatrixCell | undefined {
		return row.meta.cells.find((cell) => cell.date === column.meta.date);
	}
</script>

<h2 id="template-view-heading" class="sr-only">Generate Duty Roster preview</h2>

{#if actionForm?.generateError}
	<p class="form-error settings-error" role="alert">{actionForm.generateError}</p>
{/if}

<div class="generate-workspace" class:generate-workspace--preview={Boolean(preview)}>
	{#if !preview}
		<div class="generate-setup-grid">
			<div class="generate-setup-column">
				<section class="generation-panel generation-panel--setup" aria-labelledby="generation-setup-heading">
					<h3 id="generation-setup-heading">Generation Setup</h3>
					<p>Configure the run dates below. Generate creates a preview only and does not affect official history.</p>
					<form
						id="generate-preview-form"
						class="generate-form"
						method="POST"
						action={generateAction}
						use:enhance={handleGenerateEnhance}
					>
						<input type="hidden" name="templateId" value={selectedTemplate.id} />
						<div class="generate-form__fields">
							<label>
								<span>Start date</span>
								<input type="hidden" name="startDate" value={startDateValue} />
								<DatePicker
									id="generate-start-date"
									value={startDateValue}
									placeholder="Select start date"
									aria-label="Start date"
									onValueChange={(value) => (startDateOverride = value)}
								/>
							</label>
							<label>
								<span>End date</span>
								<input type="hidden" name="endDate" value={endDateValue} />
								<DatePicker
									id="generate-end-date"
									value={endDateValue}
									placeholder="Select end date"
									aria-label="End date"
									onValueChange={(value) => (endDateOverride = value)}
								/>
							</label>
						</div>
						<p id="generate-date-help" class="field-hint">
							Start date must be today or later, and the end date must be on or after the start date.
						</p>
						<div class="generate-callout" role="note">
							<Info size={20} aria-hidden="true" />
							<span>
								Generate builds a preview roster using current pools, rules, and settings. No history is written until
								you accept the run.
							</span>
						</div>
					</form>
				</section>

				<section class="generation-panel generation-panel--snapshot" aria-labelledby="pool-snapshot-heading">
					<h3 id="pool-snapshot-heading">
						Pool Snapshot <span>(as of now)</span>
					</h3>
					<div class="pool-snapshot-grid">
						<div>
							<span>Pool Size</span>
							<strong>{countReadModel?.rows.length ?? 0}</strong>
							<small>Soldiers</small>
						</div>
						<div>
							<span>Current Count Source</span>
							<strong>{countReadModel?.sourceLabel ?? 'DA6 roster order'}</strong>
							<small>{countReadModel?.sourceDescription ?? 'Preview uses the current roster order.'}</small>
						</div>
						<div>
							<span>Accepted Runs</span>
							<strong>{countReadModel?.acceptedRunCount ?? 0}</strong>
							<small>Available to this count model</small>
						</div>
						<div>
							<span>Corrections</span>
							<strong>{countReadModel?.countingCorrectionCount ?? 0}</strong>
							<small>Counting toward future DA6</small>
						</div>
					</div>
				</section>

				<div class="generation-actions" aria-label="Generation actions">
					<Button variant="outline" type="reset" form="generate-preview-form" disabled={generatingPreview}>
						Reset
					</Button>
					<Button
						class="generate-primary-action"
						type="submit"
						form="generate-preview-form"
						disabled={!canGenerate || generatingPreview}
					>
						{generatingPreview ? 'Generating...' : 'Generate Preview'}
					</Button>
				</div>
				<p class="preview-lock-note">
					<Info size={16} aria-hidden="true" /> Preview only. Nothing is saved until you accept.
				</p>
			</div>

			<div class="generate-side-column">
				<section class="generation-panel generation-panel--rules" aria-labelledby="generation-rules-heading">
					<h3 id="generation-rules-heading">Rules at a Glance</h3>
					<div class="rules-section">
						<h4>DA6 Selection</h4>
						<ul>
							<li>Soldiers are selected from {selectedTemplate.shortCode ?? selectedTemplate.name} pool.</li>
							<li>Lowest DA6 value is chosen first.</li>
							<li>Ties are broken by earliest last-run date, then by name.</li>
							<li>Soldiers on exclusion status are skipped.</li>
						</ul>
					</div>
					<div class="rules-section">
						<h4>A / D Treatment</h4>
						<dl>
							<div>
								<dt>A</dt>
								<dd>Authorized absence. Removed from consideration.</dd>
							</div>
							<div>
								<dt>D</dt>
								<dd>Other duty. Counted as a run for DA6 purposes.</dd>
							</div>
						</dl>
					</div>
					<div class="rules-section">
						<h4>On Accept</h4>
						<p>Updates history, DA6 values, and assignment counts.</p>
					</div>
					<div class="rules-section">
						<h4>On Apply to Calendar</h4>
						<p>Creates Calendar events for the roster date range after accepting the preview.</p>
					</div>
				</section>

				<section class="generation-panel generation-panel--history" aria-labelledby="recent-history-heading">
					<div class="recent-history-heading">
						<h3 id="recent-history-heading">Recent History</h3>
						<a href={resolve(historyPath as `/org/${string}/duty-rosters/${string}/${string}`)}>View All</a>
					</div>
					{#if recentAcceptedRuns.length > 0}
						<div class="recent-history-list">
							{#each recentAcceptedRuns as run (run.id)}
								<a
									href={resolve(
										`${historyPath}/${run.id}` as `/org/${string}/duty-rosters/${string}/history/${string}`
									)}
									class="recent-history-row"
								>
									<span>{dayMonthLabel(run.startDate)} to {dayMonthLabel(run.endDate)}</span>
									<strong>{run.status === 'invalidated' ? 'Invalidated' : 'Accepted'}</strong>
									<small>{dateParts(run.acceptedAt.slice(0, 10)).label}</small>
								</a>
							{/each}
						</div>
					{:else}
						<p>No accepted runs yet.</p>
					{/if}
				</section>
			</div>
		</div>
	{:else}
		<div class="generate-main">
			{#if generatingPreview}
				<div class="preview-loading" aria-label="Generating Duty Roster preview">
					<SkeletonGrid rows={4} columns={3} />
				</div>
			{/if}

			<div class="run-header" aria-label="Generated preview summary">
				<div>
					<p class="preview-kicker">
						Preview <span>{dayMonthLabel(generateStartDate)} to {dayMonthLabel(generateEndDate)}</span>
						<span>{preview.rosterRows.length} duty dates</span>
					</p>
				</div>
				<div class="preview-output-actions" aria-label="Draft preview and official run actions">
					<div class="preview-action-group preview-action-group--draft" aria-label="Draft output">
						<span>Draft</span>
						<Button variant="outline" type="button" onclick={() => printDraftPreview(preview)}>
							<Printer size={16} aria-hidden="true" />
							Print Draft
						</Button>
					</div>
					<div class="preview-action-group preview-action-group--official" aria-label="Official run actions">
						<span>Official Run</span>
						<form class="accept-preview-form" method="POST" action={acceptPreviewAction}>
							<input type="hidden" name="preview" value={previewReview?.previewPayload ?? ''} />
							<Button variant="outline" type="submit">
								<CheckCircle2 size={16} aria-hidden="true" />
								Accept Run
							</Button>
							<Button variant="outline" type="submit" name="intent" value="print">
								<Printer size={16} aria-hidden="true" />
								Accept Run + Print
							</Button>
							<Button type="submit" formaction={applyPreviewAction}>
								<Calendar size={16} aria-hidden="true" />
								Accept + Apply to Calendar
							</Button>
						</form>
					</div>
				</div>
			</div>

			<div class="preview-toolbar">
				<Tabs.Root bind:value={previewMode}>
					<Tabs.List aria-label="Preview review mode">
						<Tabs.Trigger value="list">List View</Tabs.Trigger>
						<Tabs.Trigger value="matrix">DA6 Matrix</Tabs.Trigger>
					</Tabs.List>
				</Tabs.Root>
				<p>
					<Info size={15} aria-hidden="true" /> Accept Run writes official DA6 history. Accept + Apply to Calendar also creates
					Calendar events.
				</p>
			</div>

			<section class="preview-readiness-band" aria-labelledby="preview-readiness-heading">
				<div
					class="preview-commit-card"
					class:preview-commit-card--ready={previewIsCommitReady}
					class:preview-commit-card--blocked={!previewIsCommitReady}
				>
					<span>Commit Readiness</span>
					<h3 id="preview-readiness-heading">{previewIsCommitReady ? 'Ready to accept' : 'Review before accepting'}</h3>
					<p>
						{#if previewIsCommitReady}
							No unassigned dates or warnings remain. Official run actions can be used with confidence.
						{:else}
							Resolve unassigned dates and review warnings before writing official DA6 history.
						{/if}
					</p>
				</div>
				<div class="preview-run-summary" aria-label="Run summary">
					<div>
						<span>Run Window</span>
						<strong>{dayMonthLabel(generateStartDate)} to {dayMonthLabel(generateEndDate)}</strong>
					</div>
					<div>
						<span>Duty Dates</span>
						<strong>{preview.rosterRows.length}</strong>
					</div>
					<div>
						<span>Automatic</span>
						<strong>{previewAssignedCount}</strong>
					</div>
					<div>
						<span>Manual</span>
						<strong>{previewManualCount}</strong>
					</div>
				</div>
				<div class="preview-unresolved-counts" aria-label="Unresolved review counts">
					<div>
						<span>Requires Action</span>
						<strong>{previewRequiresActionCount}</strong>
					</div>
					<div>
						<span>Warnings</span>
						<strong>{previewWarningCount}</strong>
					</div>
				</div>
			</section>

			{#if actionForm?.manualError}
				<p class="form-error settings-error" role="alert">{actionForm.manualError}</p>
			{/if}

			{#if previewMode === 'list'}
				<div class="preview-review-layout">
					<section aria-labelledby="preview-list-heading" class="preview-list-section">
						<h4 id="preview-list-heading" class="sr-only">Preview list</h4>
						<div class="preview-list" role="table" aria-label="Generated Duty Roster preview">
							<div class="preview-row preview-head" role="row">
								<span role="columnheader">Date</span>
								<span role="columnheader">Assignment</span>
								<span role="columnheader">Review</span>
								<span role="columnheader">Action</span>
							</div>
							{#each previewReview?.rows ?? [] as row (row.date)}
								{@const parts = dateParts(row.date)}
								<div class="preview-row" class:preview-row--active={row.date === activePreviewDate} role="row">
									<span class="preview-date-cell" role="cell">
										<strong>{parts.weekday}</strong>
										<small>{parts.label}</small>
									</span>
									<div class="preview-selection" role="cell">
										{#if row.finalAssignee}
											<strong
												>{row.finalAssignee.rank} {row.finalAssignee.lastName}, {row.finalAssignee.firstName}</strong
											>
										{:else}
											{row.unfilledReason}
										{/if}
										{#if row.manualSelection && row.generatedAssignee}
											<small>
												Generated {row.generatedAssignee.rank}
												{row.generatedAssignee.lastName}, {row.generatedAssignee.firstName}
											</small>
										{/if}
									</div>
									<span class="preview-review-cell" role="cell">
										{#if row.liveWarnings.length > 0}
											<Badge variant="danger">Review</Badge>
											<details class="preview-warning-details">
												<summary>
													<AlertTriangle size={15} aria-hidden="true" />
													{row.liveWarnings.length}
													{row.liveWarnings.length === 1 ? 'warning' : 'warnings'}
												</summary>
												<ul aria-label={`Warnings for ${parts.weekday} ${parts.label}`}>
													{#each row.liveWarnings as warning (warning)}
														<li>{warning}</li>
													{/each}
												</ul>
											</details>
										{:else if row.manualSelection}
											<Badge variant="warning">Manual</Badge>
											<small>Changed</small>
										{:else if !row.finalAssignee}
											<Badge variant="danger">Requires action</Badge>
											<small>No selection</small>
										{:else}
											<Badge variant="success">Ready</Badge>
											<small>No changes</small>
										{/if}
									</span>
									<div class="preview-action-cell" role="cell">
										<Button
											variant="link"
											size="sm"
											type="button"
											aria-label={`${row.liveWarnings.length > 0 ? 'Review warning and change assignment' : 'Change assignment'} for ${parts.weekday} ${parts.label}`}
											onclick={() => openManualChange(row)}
										>
											{row.liveWarnings.length > 0 ? 'Review' : 'Change'}
										</Button>
									</div>
								</div>
							{/each}
						</div>
					</section>

					<aside
						class="manual-change-panel"
						class:manual-change-panel--active={activePreviewRow}
						aria-labelledby="manual-change-heading"
					>
						{#if activePreviewRow}
							{@const activeParts = dateParts(activePreviewRow.date)}
							<div class="manual-change-panel__header">
								<div>
									<h3 id="manual-change-heading">Change Assignment</h3>
									<p>{activeParts.weekday} {activeParts.label}</p>
								</div>
								<Button
									variant="ghost"
									size="icon-sm"
									type="button"
									aria-label="Close change assignment"
									onclick={() => (activePreviewDate = null)}
								>
									<X size={16} aria-hidden="true" />
								</Button>
							</div>
							<div class="manual-original">
								<span>Current Selection</span>
								<strong>
									{#if activePreviewRow.finalAssignee}
										{activePreviewRow.finalAssignee.rank}
										{activePreviewRow.finalAssignee.lastName}, {activePreviewRow.finalAssignee.firstName}
									{:else}
										No final selection
									{/if}
								</strong>
							</div>
							<div class="manual-original">
								<span>Generated Selection</span>
								<strong>
									{#if activePreviewRow.generatedAssignee}
										{activePreviewRow.generatedAssignee.rank}
										{activePreviewRow.generatedAssignee.lastName}, {activePreviewRow.generatedAssignee.firstName}
									{:else}
										No generated selection
									{/if}
								</strong>
							</div>
							{#if activePreviewRow.manualSelection?.reason}
								<div class="manual-original">
									<span>Saved Reason</span>
									<p>{activePreviewRow.manualSelection.reason}</p>
								</div>
							{/if}
							<form class="manual-preview-form" method="POST" action={manualPreviewAction}>
								<input type="hidden" name="preview" value={previewReview?.previewPayload ?? ''} />
								<input type="hidden" name="date" value={activePreviewRow.date} />
								<input type="hidden" name="startDate" value={generateStartDate} />
								<input type="hidden" name="endDate" value={generateEndDate} />
								<input
									type="hidden"
									name="assigneeId"
									value={selectedPreviewAssignees[activePreviewRow.date] ?? activePreviewRow.editAssigneeId}
								/>
								<label>
									<span>Select Replacement Soldier</span>
									<SearchCombobox
										options={previewReview?.selectionOptions ?? []}
										value={selectedPreviewAssignees[activePreviewRow.date] ?? activePreviewRow.editAssigneeId}
										ariaLabel={`Select Soldier for ${activeParts.weekday} ${activeParts.label}`}
										placeholder="Search by name..."
										clearable={false}
										onchange={(value) => {
											selectedPreviewAssignees = { ...selectedPreviewAssignees, [activePreviewRow.date]: value };
										}}
									/>
								</label>
								<div class="warning-summary" role="region" aria-live="polite" aria-labelledby="warning-summary-heading">
									<span>Warning Summary</span>
									{#if activePreviewRow.liveWarnings.length > 0}
										<p id="warning-summary-heading" class="warning-summary__lede">
											Review these warnings before saving a manual change.
										</p>
										{#each activePreviewRow.liveWarnings as warning (warning)}
											<p><AlertTriangle size={15} aria-hidden="true" /> {warning}</p>
										{/each}
									{:else}
										<p id="warning-summary-heading">
											<CheckCircle2 size={15} aria-hidden="true" /> No warnings for selected replacement.
										</p>
									{/if}
								</div>
								{#if activePreviewRow.liveWarnings.length > 0}
									<label>
										<span>Reason</span>
										<Textarea
											name="reason"
											placeholder="Enter reason for this manual change..."
											required
											value={activePreviewRow.manualSelection?.reason ?? ''}
										/>
									</label>
								{:else}
									<input type="hidden" name="reason" value="" />
								{/if}
								<Button type="submit">
									<Save size={16} aria-hidden="true" />
									Save Manual Change
								</Button>
								<Button variant="outline" type="button" onclick={() => (activePreviewDate = null)}>Cancel</Button>
							</form>
							<p class="manual-change-note">
								<Info size={15} aria-hidden="true" /> Archived or missing personnel cannot be selected.
							</p>
						{:else}
							<h3 id="manual-change-heading">Change Assignment</h3>
							<p class="manual-change-empty">Select Review or Change on a preview row to review replacements.</p>
						{/if}
					</aside>
				</div>
			{/if}

			{#if previewMode === 'matrix'}
				<div class="da6-preview-layout">
					<section aria-labelledby="preview-matrix-heading">
						<h4 id="preview-matrix-heading" class="sr-only">DA6 matrix</h4>
						<OperationalMatrix.Root rows={previewMatrixRows} columns={previewMatrixColumns} readOnly>
							<OperationalMatrix.Viewport ariaLabel="DA6 preview matrix viewport" class="rounded-lg border bg-card">
								<OperationalMatrix.Table
									ariaLabel="DA6 preview matrix"
									class="min-w-max table-fixed text-sm [&_[data-matrix-cell]]:h-10 [&_[data-matrix-cell]]:w-10 [&_[data-matrix-cell]]:border [&_[data-matrix-cell]]:border-border [&_[data-matrix-cell]]:p-0 [&_[data-matrix-column-header]]:border [&_[data-matrix-column-header]]:border-border [&_[data-matrix-column-header]]:bg-muted/70 [&_[data-slot=operational-matrix-cell-content]]:grid [&_[data-slot=operational-matrix-cell-content]]:h-10 [&_[data-slot=operational-matrix-cell-content]]:place-items-center"
								>
									<OperationalMatrix.Header>
										<OperationalMatrix.HeaderRow>
											<OperationalMatrix.CornerCell
												sticky
												class="sticky left-0 top-0 z-30 min-w-40 bg-muted px-3 text-left"
											>
												Rank / Name
											</OperationalMatrix.CornerCell>
											{#each previewMatrixColumns as column (column.id)}
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
										{#each previewMatrixRows as row (row.id)}
											<OperationalMatrix.Row {row} class="bg-card hover:bg-muted/20">
												<OperationalMatrix.RowHeader
													{row}
													sticky
													class="sticky left-0 z-10 min-w-40 border bg-card px-3 py-2 text-left font-medium"
												>
													{row.label}
												</OperationalMatrix.RowHeader>
												{#each previewMatrixColumns as column (column.id)}
													{@const cell = previewMatrixCell(row, column)}
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
					</section>
					<aside class="da6-side-panel" aria-label="DA6 preview details">
						<section>
							<h3>DA6 Legend</h3>
							<dl class="legend-list">
								<div>
									<dt>X</dt>
									<dd>Assigned duty</dd>
								</div>
								<div>
									<dt>1-10</dt>
									<dd>DA6 count</dd>
								</div>
								<div>
									<dt>A</dt>
									<dd>Authorized absence</dd>
								</div>
								<div>
									<dt>D</dt>
									<dd>Other duty</dd>
								</div>
								<div>
									<dt>U</dt>
									<dd>Unavailable</dd>
								</div>
							</dl>
							<p>Highlighted cells flag assigned duty, authorized absence, and chargeable duty conflicts.</p>
						</section>
						<section>
							<h3>Run Summary</h3>
							<dl class="run-summary-list">
								<div>
									<dt>Template</dt>
									<dd>{selectedTemplate.shortCode ?? selectedTemplate.name}</dd>
								</div>
								<div>
									<dt>Pool</dt>
									<dd>{countReadModel?.sourceLabel ?? 'DA6 roster order'}</dd>
								</div>
								<div>
									<dt>Dates</dt>
									<dd>{dayMonthLabel(generateStartDate)} to {dayMonthLabel(generateEndDate)}</dd>
								</div>
								<div>
									<dt>Rosters</dt>
									<dd>{preview.rosterRows.length} days</dd>
								</div>
								<div>
									<dt>Soldiers in Pool</dt>
									<dd>{preview.da6.rows.length}</dd>
								</div>
								<div>
									<dt>Assigned</dt>
									<dd>{previewAssignedCount}</dd>
								</div>
								<div>
									<dt>Unassigned</dt>
									<dd>{previewRequiresActionCount}</dd>
								</div>
							</dl>
						</section>
						<section>
							<h3>Warnings</h3>
							<p class="warning-count"><AlertTriangle size={16} aria-hidden="true" /> {previewWarningCount}</p>
						</section>
						<section>
							<h3>Print</h3>
							<Button variant="ghost" size="sm" type="button" onclick={() => printDraftPreview(preview)}>
								<Printer size={16} aria-hidden="true" />
								Print DA6 draft
							</Button>
						</section>
					</aside>
				</div>
			{/if}
		</div>
	{/if}
</div>
