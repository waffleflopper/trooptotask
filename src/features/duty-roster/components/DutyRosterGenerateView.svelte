<script lang="ts">
	import { AlertTriangle, Calendar, CheckCircle2, Info, Printer, Save, X } from '@lucide/svelte';
	import Badge from '$lib/components/ui/Badge.svelte';
	import SearchSelect from '$lib/components/ui/SearchSelect.svelte';
	import SkeletonGrid from '$lib/components/ui/SkeletonGrid.svelte';
	import { printDutyRosterForBrowser } from '$features/duty-roster/export/dutyRosterBrowserExport';
	import {
		buildDutyRosterPreviewReviewModel,
		issueLabel,
		type DutyRosterPreviewReviewModel
	} from '$features/duty-roster/workspace/dutyRosterPreviewReview';
	import type { DutyRosterTemplatePreview } from '$features/duty-roster/templates/dutyRosterTemplatePreview';
	import type { DutyRosterGenerateWorkspaceModel } from '$features/duty-roster/workspace/dutyRosterWorkspaceReadModel';

	let { generate }: { generate: DutyRosterGenerateWorkspaceModel } = $props();

	let previewMode = $state<'list' | 'matrix'>('list');
	let generatingPreview = $state(false);
	let activePreviewDate = $state<string | null>(null);
	let selectedPreviewAssignees = $state<Record<string, string>>({});

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
	const todayDate = $derived(generate.todayDate);
	const generateStartDate = $derived(generate.generateStartDate);
	const generateEndDate = $derived(generate.generateEndDate);
	const canGenerate = $derived(generate.canGenerate);
	const previewReview: DutyRosterPreviewReviewModel | null = $derived(
		preview ? buildDutyRosterPreviewReviewModel({ preview, selectedAssigneeIds: selectedPreviewAssignees }) : null
	);
	const activePreviewRow = $derived(previewReview?.rows.find((row) => row.date === activePreviewDate) ?? null);
	const previewAssignedCount = $derived(previewReview?.rows.filter((row) => row.finalAssignee).length ?? 0);
	const previewManualCount = $derived(previewReview?.rows.filter((row) => row.manualSelection).length ?? 0);
	const previewRequiresActionCount = $derived(previewReview?.rows.filter((row) => !row.finalAssignee).length ?? 0);
	const previewWarningCount = $derived(
		previewReview?.rows.reduce((total, row) => total + row.liveWarnings.length, 0) ?? 0
	);
	const recentAcceptedRuns = $derived(acceptedRuns.slice(0, 3));

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
						onsubmit={() => {
							generatingPreview = true;
						}}
					>
						<input type="hidden" name="templateId" value={selectedTemplate.id} />
						<div class="generate-form__fields">
							<label>
								<span>Start date</span>
								<input
									class="input"
									name="startDate"
									type="date"
									required
									min={todayDate}
									value={generateStartDate}
									aria-describedby="generate-date-help"
								/>
							</label>
							<label>
								<span>End date</span>
								<input
									class="input"
									name="endDate"
									type="date"
									required
									min={todayDate}
									value={generateEndDate}
									aria-describedby="generate-date-help"
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
					<button class="btn btn-secondary" type="reset" form="generate-preview-form" disabled={generatingPreview}>
						Reset
					</button>
					<button
						class="btn btn-primary generate-primary-action"
						type="submit"
						form="generate-preview-form"
						disabled={!canGenerate || generatingPreview}
					>
						{generatingPreview ? 'Generating...' : 'Generate Preview'}
					</button>
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
						<a href={historyPath}>View All</a>
					</div>
					{#if recentAcceptedRuns.length > 0}
						<div class="recent-history-list">
							{#each recentAcceptedRuns as run (run.id)}
								<a href={`${historyPath}/${run.id}`} class="recent-history-row">
									<span>{run.startDate} to {run.endDate}</span>
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
						Preview <span>{generateStartDate} to {generateEndDate}</span>
						<span>{preview.rosterRows.length} duty dates</span>
					</p>
				</div>
				<div class="preview-output-actions" aria-label="Draft and official output actions">
					<button class="btn btn-secondary" type="button" onclick={() => printDraftPreview(preview)}>
						<Printer size={16} aria-hidden="true" />
						Print Draft
					</button>
					<form class="accept-preview-form" method="POST" action={acceptPreviewAction}>
						<input type="hidden" name="preview" value={previewReview?.previewPayload ?? ''} />
						<button class="btn btn-secondary" type="submit">
							<CheckCircle2 size={16} aria-hidden="true" />
							Accept
						</button>
					</form>
					<form class="accept-preview-form" method="POST" action={acceptPreviewAction}>
						<input type="hidden" name="preview" value={previewReview?.previewPayload ?? ''} />
						<input type="hidden" name="intent" value="print" />
						<button class="btn btn-secondary" type="submit">
							<Printer size={16} aria-hidden="true" />
							Accept + Print
						</button>
					</form>
					<form class="accept-preview-form" method="POST" action={applyPreviewAction}>
						<input type="hidden" name="preview" value={previewReview?.previewPayload ?? ''} />
						<button class="btn btn-amber" type="submit">
							<Calendar size={16} aria-hidden="true" />
							Apply to Calendar
						</button>
					</form>
				</div>
			</div>

			<div class="preview-toolbar">
				<div class="view-switch admin-segmented" role="group" aria-label="Preview review mode">
					<button type="button" class:active={previewMode === 'list'} onclick={() => (previewMode = 'list')}>
						List View
					</button>
					<button type="button" class:active={previewMode === 'matrix'} onclick={() => (previewMode = 'matrix')}>
						DA6 Matrix
					</button>
				</div>
				<p><Info size={15} aria-hidden="true" /> Apply to Calendar will accept this run if it is still in preview.</p>
			</div>

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
								<span role="columnheader">Generated Soldier</span>
								<span role="columnheader">Final Selected Soldier</span>
								<span role="columnheader">Status / Marker</span>
								<span role="columnheader">Warnings</span>
								<span role="columnheader">Reason</span>
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
										{#if row.generatedAssignee}
											<strong
												>{row.generatedAssignee.rank}
												{row.generatedAssignee.lastName}, {row.generatedAssignee.firstName}</strong
											>
										{:else}
											{row.unfilledReason}
										{/if}
									</div>
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
												Generated: {row.generatedAssignee.rank}
												{row.generatedAssignee.lastName}, {row.generatedAssignee.firstName}
											</small>
										{/if}
									</div>
									<span role="cell">
										{#if row.manualSelection}
											<Badge label="MANUAL" color="var(--amber-light)" textColor="var(--amber-dark)" />
										{:else if !row.finalAssignee}
											<Badge label="REQUIRES ACTION" color="var(--danger-bg)" textColor="var(--danger)" />
										{:else}
											<Badge label="AUTOMATIC" color="var(--success-bg)" textColor="var(--success)" />
										{/if}
										<small>{row.manualSelection ? 'Changed' : row.finalAssignee ? 'No changes' : 'No selection'}</small>
									</span>
									<span class="preview-warning-cell" role="cell">
										{#if row.liveWarnings.length > 0}
											<AlertTriangle size={16} aria-hidden="true" />
											<span
												class="warning-tooltip"
												title={row.liveWarnings.join(' ')}
												aria-label={`Warning detail: ${row.liveWarnings.join(' ')}`}
											>
												{issueLabel(row.liveWarnings.map((message) => ({ message })))}
											</span>
										{:else}
											-
										{/if}
									</span>
									<span class="preview-reason-cell" role="cell">
										{row.manualSelection?.reason ?? (row.finalAssignee ? '-' : 'Reason required')}
									</span>
									<div class="preview-action-cell" role="cell">
										<button class="link-command" type="button" onclick={() => openManualChange(row)}> Change </button>
									</div>
								</div>
							{/each}
						</div>
						<div class="preview-summary-strip" aria-label="Preview totals">
							<div><strong>{preview.rosterRows.length}</strong><span>Total Dates</span></div>
							<div><strong>{previewAssignedCount}</strong><span>Automatic</span></div>
							<div><strong>{previewManualCount}</strong><span>Manual</span></div>
							<div><strong>{previewRequiresActionCount}</strong><span>Requires Action</span></div>
							<div><strong>{previewWarningCount}</strong><span>Warnings</span></div>
						</div>
					</section>

					<aside class="manual-change-panel" aria-labelledby="manual-change-heading">
						{#if activePreviewRow}
							{@const activeParts = dateParts(activePreviewRow.date)}
							<div class="manual-change-panel__header">
								<div>
									<h3 id="manual-change-heading">Change Assignment</h3>
									<p>{activeParts.weekday} {activeParts.label}</p>
								</div>
								<button
									class="btn-icon btn-sm"
									type="button"
									aria-label="Close change assignment"
									onclick={() => (activePreviewDate = null)}
								>
									<X size={16} aria-hidden="true" />
								</button>
							</div>
							<div class="manual-original">
								<span>Originally Generated</span>
								<strong>
									{#if activePreviewRow.generatedAssignee}
										{activePreviewRow.generatedAssignee.rank}
										{activePreviewRow.generatedAssignee.lastName}, {activePreviewRow.generatedAssignee.firstName}
									{:else}
										No generated selection
									{/if}
								</strong>
							</div>
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
									<SearchSelect
										options={previewReview?.selectionOptions ?? []}
										value={selectedPreviewAssignees[activePreviewRow.date] ?? activePreviewRow.editAssigneeId}
										ariaLabel={`Select Soldier for ${activePreviewRow.date}`}
										placeholder="Search by name..."
										clearable={false}
										onchange={(value) => {
											selectedPreviewAssignees = { ...selectedPreviewAssignees, [activePreviewRow.date]: value };
										}}
									/>
								</label>
								<div class="warning-summary">
									<span>Warning Summary</span>
									{#if activePreviewRow.liveWarnings.length > 0}
										{#each activePreviewRow.liveWarnings as warning (warning)}
											<p><AlertTriangle size={15} aria-hidden="true" /> {warning}</p>
										{/each}
									{:else}
										<p><CheckCircle2 size={15} aria-hidden="true" /> No warnings for selected replacement.</p>
									{/if}
								</div>
								{#if activePreviewRow.liveWarnings.length > 0}
									<label>
										<span>Reason</span>
										<textarea class="input" name="reason" placeholder="Enter reason for this manual change..." required
											>{activePreviewRow.manualSelection?.reason ?? ''}</textarea
										>
									</label>
								{:else}
									<input type="hidden" name="reason" value="" />
								{/if}
								<button class="btn btn-amber" type="submit">
									<Save size={16} aria-hidden="true" />
									Save Manual Change
								</button>
								<button class="btn btn-secondary" type="button" onclick={() => (activePreviewDate = null)}>
									Cancel
								</button>
							</form>
							<p class="manual-change-note">
								<Info size={15} aria-hidden="true" /> Archived or missing personnel cannot be selected.
							</p>
						{:else}
							<h3 id="manual-change-heading">Change Assignment</h3>
							<p class="manual-change-empty">Select Change on a preview row to review replacements.</p>
						{/if}
					</aside>
				</div>
			{/if}

			{#if previewMode === 'matrix'}
				<div class="da6-preview-layout">
					<section aria-labelledby="preview-matrix-heading">
						<h4 id="preview-matrix-heading" class="sr-only">DA6 matrix</h4>
						<div class="matrix-scroll">
							<table class="da6-matrix" aria-label="DA6 preview matrix">
								<thead>
									<tr>
										<th scope="col">Rank / Name</th>
										{#each previewReview?.matrix.columns ?? [] as column (column.date)}
											{@const columnParts = dateParts(column.date)}
											<th scope="col">
												<span>{columnParts.weekday}</span>
												<small>{columnParts.label.replace(/ 20\d{2}$/, '')}</small>
											</th>
										{/each}
									</tr>
								</thead>
								<tbody>
									{#each previewReview?.matrix.rows ?? [] as row (row.personnelId)}
										<tr>
											<th scope="row">{row.soldierLabel}</th>
											{#each row.cells as cell (cell.date)}
												<td class:assigned={cell.assigned}>{cell.display}</td>
											{/each}
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
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
							<p>Highlighted cells indicate the finally assigned Soldier for each date.</p>
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
									<dd>{generateStartDate} to {generateEndDate}</dd>
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
							<h3>Print / Export</h3>
							<button class="link-command link-command--icon" type="button" onclick={() => printDraftPreview(preview)}>
								<Printer size={16} aria-hidden="true" />
								Prints in DA6 format
							</button>
						</section>
					</aside>
				</div>
			{/if}
		</div>
	{/if}
</div>
