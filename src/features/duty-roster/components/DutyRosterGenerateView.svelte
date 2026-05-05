<script lang="ts">
	import Badge from '$lib/components/ui/Badge.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import SearchSelect from '$lib/components/ui/SearchSelect.svelte';
	import SkeletonGrid from '$lib/components/ui/SkeletonGrid.svelte';
	import { printDutyRosterForBrowser } from '$features/duty-roster/export/dutyRosterBrowserExport';
	import {
		manualSelectionForDate,
		previewFinalAssigneeId,
		type DutyRosterTemplatePreview
	} from '$features/duty-roster/templates/dutyRosterTemplatePreview';
	import type {
		DutyRosterTemplate,
		DutyRosterTemplateCountReadModel
	} from '$features/duty-roster/templates/dutyRosterTemplates';
	import {
		issueLabel,
		issueTitle,
		personnelOptionItems,
		previewAssignee,
		previewCellDisplay,
		previewFormValue,
		type DutyRosterWorkspaceActionForm
	} from '$features/duty-roster/workspace/dutyRosterWorkspaceReadModel';

	let {
		selectedTemplate,
		actionForm,
		preview,
		generateAction,
		manualPreviewAction,
		acceptPreviewAction,
		applyPreviewAction,
		countReadModel,
		todayDate,
		generateStartDate,
		generateEndDate,
		canGenerate
	}: {
		selectedTemplate: DutyRosterTemplate;
		actionForm: DutyRosterWorkspaceActionForm | null;
		preview: DutyRosterTemplatePreview | null;
		generateAction: string;
		manualPreviewAction: string;
		acceptPreviewAction: string;
		applyPreviewAction: string;
		countReadModel: DutyRosterTemplateCountReadModel | null;
		todayDate: string;
		generateStartDate: string;
		generateEndDate: string;
		canGenerate: boolean;
	} = $props();

	let previewMode = $state<'list' | 'matrix'>('list');
	let generatingPreview = $state(false);
	let editingPreviewRows = $state<Record<string, boolean>>({});
	let selectedPreviewAssignees = $state<Record<string, string>>({});

	function previewEditAssigneeId(
		preview: DutyRosterTemplatePreview,
		date: string,
		fallbackAssigneeId: string | null
	): string {
		return selectedPreviewAssignees[date] ?? previewFinalAssigneeId(preview, date) ?? fallbackAssigneeId ?? '';
	}

	function previewSelectionWarnings(preview: DutyRosterTemplatePreview, date: string, selectedId: string): string[] {
		const warnings: string[] = [];
		const selected = preview.selectionPersonnel.find((person) => person.id === selectedId);
		if (!selected) return warnings;

		if (!preview.personnel.some((person) => person.id === selectedId)) {
			warnings.push('Selected Soldier is outside this template pool.');
		}

		const generatedRow = preview.rosterRows.find((row) => row.date === date);
		if (generatedRow?.reason) {
			warnings.push(generatedRow.reason);
		}

		return warnings;
	}

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
						<input type="hidden" name="preview" value={previewFormValue(preview)} />
						<button class="btn btn-amber" type="submit">Accept then Apply</button>
					</form>
					<form class="accept-preview-form" method="POST" action={acceptPreviewAction}>
						<input type="hidden" name="preview" value={previewFormValue(preview)} />
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
						{#each preview.rosterRows as row (row.date)}
							{@const manualSelection = manualSelectionForDate(preview, row.date)}
							{@const finalAssignee = previewAssignee(preview, previewFinalAssigneeId(preview, row.date))}
							{@const generatedAssignee = previewAssignee(preview, row.assigneeId)}
							{@const editAssigneeId = previewEditAssigneeId(preview, row.date, row.assigneeId)}
							{@const liveWarnings = previewSelectionWarnings(preview, row.date, editAssigneeId)}
							{@const rowInEdit = Boolean(editingPreviewRows[row.date])}
							<div class="preview-row" role="row">
								<span role="cell">{row.date}</span>
								<div class="preview-selection" role="cell">
									{#if finalAssignee}
										<strong>{finalAssignee.rank} {finalAssignee.lastName}, {finalAssignee.firstName}</strong>
									{:else}
										{row.reason ?? 'No eligible Soldier'}
									{/if}
									{#if manualSelection && generatedAssignee}
										<small>
											Generated: {generatedAssignee.rank}
											{generatedAssignee.lastName}, {generatedAssignee.firstName}
										</small>
									{/if}
									{#if manualSelection?.warnings.length}
										<span
											class="issue-badge chip chip-warning"
											title={issueTitle(manualSelection.warnings)}
											aria-label={`Issue explanation: ${issueTitle(manualSelection.warnings)}`}
										>
											{issueLabel(manualSelection.warnings)}
										</span>
										<ul class="manual-warnings" aria-label={`Manual warnings for ${row.date}`}>
											{#each manualSelection.warnings as warning (warning.code)}
												<li>{warning.message}</li>
											{/each}
										</ul>
									{/if}
									{#if manualSelection?.reason}
										<small>Reason: {manualSelection.reason}</small>
									{/if}
								</div>
								<span role="cell">
									{#if manualSelection}
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
													[row.date]: previewFinalAssigneeId(preview, row.date) ?? row.assigneeId ?? ''
												};
											}}
										>
											Change
										</button>
									{:else}
										<form class="manual-preview-form" method="POST" action={manualPreviewAction}>
											<input type="hidden" name="preview" value={previewFormValue(preview)} />
											<input type="hidden" name="date" value={row.date} />
											<input type="hidden" name="startDate" value={actionForm?.generateValues?.startDate ?? ''} />
											<input type="hidden" name="endDate" value={actionForm?.generateValues?.endDate ?? ''} />
											<input type="hidden" name="assigneeId" value={editAssigneeId} />
											<label>
												<span>Soldier</span>
												<SearchSelect
													options={personnelOptionItems(preview.selectionPersonnel)}
													value={editAssigneeId}
													ariaLabel={`Select Soldier for ${row.date}`}
													placeholder="Search Soldier"
													clearable={false}
													compact
													onchange={(value) => {
														selectedPreviewAssignees = { ...selectedPreviewAssignees, [row.date]: value };
													}}
												/>
											</label>
											{#if liveWarnings.length > 0}
												<label>
													<span>Reason</span>
													<input
														class="input"
														name="reason"
														type="text"
														value={manualSelection?.reason ?? ''}
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
											{#if liveWarnings.length > 0}
												<div class="issue-explain" role="status">
													{#each liveWarnings as warning (warning)}
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
									{#each preview.da6.columns as column (column.date)}
										<th scope="col">{column.date}</th>
									{/each}
								</tr>
							</thead>
							<tbody>
								{#each preview.da6.rows as row (row.personnelId)}
									<tr>
										<th scope="row">{row.display.rank} {row.display.lastName}</th>
										{#each row.cells as cell (cell.date)}
											<td class:assigned={cell.assigned}>{previewCellDisplay(cell)}</td>
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
