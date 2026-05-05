<script lang="ts">
	import Badge from '$lib/components/ui/Badge.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import SearchSelect from '$lib/components/ui/SearchSelect.svelte';
	import SkeletonGrid from '$lib/components/ui/SkeletonGrid.svelte';
	import { printDutyRosterForBrowser } from '$features/duty-roster/export/dutyRosterBrowserExport';
	import {
		buildDutyRosterPreviewReviewModel,
		issueLabel,
		issueTitle,
		type DutyRosterPreviewReviewModel
	} from '$features/duty-roster/workspace/dutyRosterPreviewReview';
	import type { DutyRosterTemplatePreview } from '$features/duty-roster/templates/dutyRosterTemplatePreview';
	import type { DutyRosterGenerateWorkspaceModel } from '$features/duty-roster/workspace/dutyRosterWorkspaceReadModel';

	let { generate }: { generate: DutyRosterGenerateWorkspaceModel } = $props();

	let previewMode = $state<'list' | 'matrix'>('list');
	let generatingPreview = $state(false);
	let editingPreviewRows = $state<Record<string, boolean>>({});
	let selectedPreviewAssignees = $state<Record<string, string>>({});

	const selectedTemplate = $derived(generate.selectedTemplate);
	const actionForm = $derived(generate.actionForm);
	const preview = $derived(generate.preview);
	const generateAction = $derived(generate.generateAction);
	const manualPreviewAction = $derived(generate.manualPreviewAction);
	const acceptPreviewAction = $derived(generate.acceptPreviewAction);
	const applyPreviewAction = $derived(generate.applyPreviewAction);
	const countReadModel = $derived(generate.countReadModel);
	const todayDate = $derived(generate.todayDate);
	const generateStartDate = $derived(generate.generateStartDate);
	const generateEndDate = $derived(generate.generateEndDate);
	const canGenerate = $derived(generate.canGenerate);
	const previewReview: DutyRosterPreviewReviewModel | null = $derived(
		preview ? buildDutyRosterPreviewReviewModel({ preview, selectedAssigneeIds: selectedPreviewAssignees }) : null
	);

	function printDraftPreview(preview: DutyRosterTemplatePreview): void {
		printDutyRosterForBrowser({ templatePreview: preview, statusLabel: 'Draft' });
	}
</script>

<h2 id="template-view-heading" class="sr-only">Generate Duty Roster preview</h2>

{#if actionForm?.generateError}
	<p class="form-error settings-error" role="alert">{actionForm.generateError}</p>
{/if}

<div class="generate-workspace">
	<aside class="setup-rail card card-flat" aria-label="Generate setup">
		<div>
			<p class="eyebrow">Setup</p>
			<h4>{selectedTemplate.name}</h4>
			<p>Defaults to the full next calendar month. Past rosters are blocked here and again by the service.</p>
		</div>
		<div class="setup-stat">
			<span>Date range</span>
			<strong>{generateStartDate} to {generateEndDate}</strong>
		</div>
		<div class="setup-stat">
			<span>Policy</span>
			<strong>Longest break</strong>
			<small>DA6 roster order resolves ties. Authorized absence interrupts numbering.</small>
		</div>
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
			<button class="btn btn-primary" type="submit" disabled={!canGenerate || generatingPreview}>
				{generatingPreview ? 'Generating...' : 'Generate preview'}
			</button>
		</form>
		<p id="generate-date-help" class="field-hint">
			Start date must be today or later, and the end date must be on or after the start date.
		</p>
	</aside>

	<div class="generate-main">
		{#if generatingPreview}
			<div class="preview-loading" aria-label="Generating Duty Roster preview">
				<SkeletonGrid rows={4} columns={3} />
			</div>
		{/if}

		{#if preview}
			<div class="run-header card card-flat" aria-label="Generated preview summary">
				<div>
					<h3>Draft Preview</h3>
					<p>
						<span>Template <strong>{selectedTemplate.shortCode ?? selectedTemplate.name}</strong></span>
						<span>Range <strong>{preview.rosterRows.length} days</strong></span>
						<span>Pool <strong>{preview.da6.rows.length} eligible</strong></span>
					</p>
				</div>
				<div class="preview-output-actions" aria-label="Draft and official output actions">
					<div class="run-lifecycle" aria-label="Duty Roster run lifecycle">
						<span class="run-lifecycle__step run-lifecycle__step--active">Draft</span>
						<span class="run-lifecycle__step">Official</span>
						<span class="run-lifecycle__step">Applied</span>
					</div>
					<form class="accept-preview-form" method="POST" action={applyPreviewAction}>
						<input type="hidden" name="preview" value={previewReview?.previewPayload ?? ''} />
						<button class="btn btn-amber" type="submit">Accept then Apply</button>
					</form>
					<form class="accept-preview-form" method="POST" action={acceptPreviewAction}>
						<input type="hidden" name="preview" value={previewReview?.previewPayload ?? ''} />
						<button class="btn btn-secondary" type="submit">Accept Only</button>
					</form>
					<button class="btn btn-secondary" type="button" onclick={() => printDraftPreview(preview)}>
						Print Draft
					</button>
				</div>
			</div>

			<div class="view-switch admin-segmented" role="group" aria-label="Preview review mode">
				<button type="button" class:active={previewMode === 'list'} onclick={() => (previewMode = 'list')}>
					List
				</button>
				<button type="button" class:active={previewMode === 'matrix'} onclick={() => (previewMode = 'matrix')}>
					DA6 Matrix
				</button>
			</div>

			{#if actionForm?.manualError}
				<p class="form-error settings-error" role="alert">{actionForm.manualError}</p>
			{/if}

			{#if previewMode === 'list'}
				<section aria-labelledby="preview-list-heading">
					<h4 id="preview-list-heading" class="sr-only">Preview list</h4>
					<div class="preview-list admin-table-shell" role="table" aria-label="Generated Duty Roster preview">
						<div class="preview-row preview-head" role="row">
							<span role="columnheader">Date</span>
							<span role="columnheader">Selected Soldier</span>
							<span role="columnheader">Source</span>
							<span role="columnheader">Manual change</span>
						</div>
						{#each previewReview?.rows ?? [] as row (row.date)}
							{@const rowInEdit = Boolean(editingPreviewRows[row.date])}
							<div class="preview-row" role="row">
								<span role="cell">{row.date}</span>
								<div class="preview-selection" role="cell">
									{#if row.finalAssignee}
										<strong>{row.finalAssignee.rank} {row.finalAssignee.lastName}, {row.finalAssignee.firstName}</strong
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
									{#if row.manualSelection?.warnings.length}
										<span
											class="issue-badge chip chip-warning"
											title={issueTitle(row.manualSelection.warnings)}
											aria-label={`Issue explanation: ${issueTitle(row.manualSelection.warnings)}`}
										>
											{issueLabel(row.manualSelection.warnings)}
										</span>
										<ul class="manual-warnings" aria-label={`Manual warnings for ${row.date}`}>
											{#each row.manualSelection.warnings as warning (warning.code)}
												<li>{warning.message}</li>
											{/each}
										</ul>
									{/if}
									{#if row.manualSelection?.reason}
										<small>Reason: {row.manualSelection.reason}</small>
									{/if}
								</div>
								<span role="cell">
									{#if row.manualSelection}
										<Badge label="MANUAL" color="var(--color-warning-bg)" textColor="var(--color-warning-text)" />
									{:else}
										<Badge label="Generated" variant="outlined" />
									{/if}
								</span>
								<div role="cell">
									{#if !rowInEdit}
										<button
											class="btn btn-secondary btn-sm"
											type="button"
											onclick={() => {
												editingPreviewRows = { ...editingPreviewRows, [row.date]: true };
												selectedPreviewAssignees = {
													...selectedPreviewAssignees,
													[row.date]: row.editAssigneeId
												};
											}}
										>
											Change
										</button>
									{:else}
										<form class="manual-preview-form" method="POST" action={manualPreviewAction}>
											<input type="hidden" name="preview" value={previewReview?.previewPayload ?? ''} />
											<input type="hidden" name="date" value={row.date} />
											<input type="hidden" name="startDate" value={actionForm?.generateValues?.startDate ?? ''} />
											<input type="hidden" name="endDate" value={actionForm?.generateValues?.endDate ?? ''} />
											<input type="hidden" name="assigneeId" value={row.editAssigneeId} />
											<label>
												<span>Soldier</span>
												<SearchSelect
													options={previewReview?.selectionOptions ?? []}
													value={row.editAssigneeId}
													ariaLabel={`Select Soldier for ${row.date}`}
													placeholder="Search Soldier"
													clearable={false}
													compact
													onchange={(value) => {
														selectedPreviewAssignees = { ...selectedPreviewAssignees, [row.date]: value };
													}}
												/>
											</label>
											{#if row.liveWarnings.length > 0}
												<label>
													<span>Reason</span>
													<input
														class="input"
														name="reason"
														type="text"
														value={row.manualSelection?.reason ?? ''}
														placeholder="Required for flagged changes"
														required
													/>
												</label>
											{:else}
												<input type="hidden" name="reason" value="" />
											{/if}
											<div class="inline-edit-actions">
												<button class="btn btn-primary btn-sm" type="submit">Save</button>
												<button
													class="btn btn-secondary btn-sm"
													type="button"
													onclick={() => (editingPreviewRows = { ...editingPreviewRows, [row.date]: false })}
												>
													Cancel
												</button>
											</div>
											{#if row.liveWarnings.length > 0}
												<div class="issue-explain" role="status">
													{#each row.liveWarnings as warning (warning)}
														<span>{warning}</span>
													{/each}
												</div>
											{/if}
										</form>
									{/if}
								</div>
							</div>
						{/each}
					</div>
				</section>
			{/if}

			{#if previewMode === 'matrix'}
				<section aria-labelledby="preview-matrix-heading">
					<h4 id="preview-matrix-heading" class="sr-only">DA6 matrix</h4>
					<div class="matrix-scroll">
						<table class="da6-matrix" aria-label="DA6 preview matrix">
							<thead>
								<tr>
									<th scope="col">Soldier</th>
									{#each previewReview?.matrix.columns ?? [] as column (column.date)}
										<th scope="col">{column.date}</th>
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
			{/if}
		{:else}
			<div class="run-header card card-flat">
				<div>
					<h3>Draft Preview</h3>
					<p>
						<span>Template <strong>{selectedTemplate.shortCode ?? selectedTemplate.name}</strong></span>
						<span>Range <strong>{generateStartDate} to {generateEndDate}</strong></span>
						<span>Pool <strong>{countReadModel?.rows.length ?? 0} eligible</strong></span>
					</p>
				</div>
				<button
					class="btn btn-primary"
					type="submit"
					form="generate-preview-form"
					disabled={!canGenerate || generatingPreview}
				>
					{generatingPreview ? 'Generating...' : 'Generate preview'}
				</button>
			</div>
			<div class="pre-preview-state admin-table-shell admin-table-shell--scroll" aria-label="Generate preview required">
				<table class="admin-table">
					<thead>
						<tr>
							<th>Date range</th>
							<th>Pool</th>
							<th>Count source</th>
							<th>Action</th>
						</tr>
					</thead>
					<tbody>
						<tr>
							<td>{generateStartDate} to {generateEndDate}</td>
							<td>{countReadModel?.rows.length ?? 0} Soldiers in current count model</td>
							<td>{countReadModel?.sourceLabel ?? 'DA6 roster order'}</td>
							<td>Generate Preview</td>
						</tr>
					</tbody>
				</table>
				<EmptyState
					message="No draft exists yet. Confirm the date range, then generate a preview."
					actionLabel="Generate Preview"
				/>
			</div>
		{/if}
	</div>
</div>
