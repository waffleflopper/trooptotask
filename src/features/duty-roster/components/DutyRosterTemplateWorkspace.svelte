<script lang="ts">
	import './dutyRosterTemplateWorkspace.css';
	import SearchSelect from '$lib/components/ui/SearchSelect.svelte';
	import MultiTagSelect from '$lib/components/ui/MultiTagSelect.svelte';
	import DutyRosterNewTemplateWorkspace from './DutyRosterNewTemplateWorkspace.svelte';
	import Badge from '$lib/components/ui/Badge.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import SkeletonGrid from '$lib/components/ui/SkeletonGrid.svelte';
	import DataTable from '$lib/components/ui/data-table/DataTable.svelte';
	import {
		manualSelectionForDate,
		previewFinalAssigneeId,
		type DutyRosterTemplatePreview
	} from '$features/duty-roster/templates/dutyRosterTemplatePreview';
	import { printDutyRosterForBrowser } from '$features/duty-roster/export/dutyRosterBrowserExport';
	import {
		acceptedCellDisplay,
		acceptedHistoryRows,
		acceptedSnapshot,
		buildDutyRosterWorkspaceReadModel,
		calendarActionState,
		correctionKey,
		correctionPersonName,
		groupOptionItems,
		issueLabel,
		issueTitle,
		optionItems,
		personnelOptionItems,
		previewAssignee,
		previewCellDisplay,
		previewFormValue,
		type DutyRosterWorkspaceData
	} from '$features/duty-roster/workspace/dutyRosterWorkspaceReadModel';
	import type { DutyRosterTemplateAcceptedRun } from '$features/duty-roster/templates/dutyRosterTemplates';

	let { data, form }: { data: DutyRosterWorkspaceData; form?: unknown } = $props();
	let previewMode = $state<'list' | 'matrix'>('list');
	let generatingPreview = $state(false);
	let editingPreviewRows = $state<Record<string, boolean>>({});
	let editingCorrections = $state<Record<string, boolean>>({});
	let confirmingInvalidationRunId = $state<string | null>(null);
	let selectedPreviewAssignees = $state<Record<string, string>>({});
	let selectedCorrectionAssignees = $state<Record<string, string>>({});
	let rankFilterValues = $state<string[]>([]);
	let groupFilterValues = $state<string[]>([]);
	let mosFilterValues = $state<string[]>([]);
	let dutyRoleFilterValues = $state<string[]>([]);
	let newTemplateStep = $state<'general' | 'pool' | 'exemptions' | 'baseline'>('general');
	let settingsSection = $state<'general' | 'pool' | 'exemptions' | 'baseline'>('general');
	let newTemplateName = $state('');
	let newTemplateSlug = $state('');
	let newTemplateShortCode = $state('');
	let settingsName = $state('');
	let settingsSlug = $state('');
	let settingsShortCode = $state('');
	let settingsExemptPersonnelIds = $state<string[]>([]);
	let settingsBaselineCounts = $state<Record<string, string>>({});
	let wizardExemptPersonnelIds = $state<string[]>([]);

	const workspace = $derived(buildDutyRosterWorkspaceReadModel(data, form));
	const basePath = $derived(workspace.basePath);
	const createWizardAction = $derived(workspace.createWizardAction);
	const isNewTemplate = $derived(workspace.isNewTemplate);
	const selectedTemplate = $derived(workspace.selectedTemplate);
	const selectedView = $derived(workspace.selectedView);
	const actionForm = $derived(workspace.actionForm);
	const preview = $derived(workspace.preview);
	const generateAction = $derived(workspace.generateAction);
	const manualPreviewAction = $derived(workspace.manualPreviewAction);
	const acceptPreviewAction = $derived(workspace.acceptPreviewAction);
	const applyPreviewAction = $derived(workspace.applyPreviewAction);
	const applyAcceptedRunAction = $derived(workspace.applyAcceptedRunAction);
	const invalidateAcceptedRunAction = $derived(workspace.invalidateAcceptedRunAction);
	const correctAcceptedRunAction = $derived(workspace.correctAcceptedRunAction);
	const settingsAction = $derived(workspace.settingsAction);
	const acceptedRuns = $derived(workspace.acceptedRuns);
	const historyDetailRun = $derived(workspace.historyDetailRun);
	const countReadModel = $derived(workspace.countReadModel);
	const latestHistoryRunId = $derived(workspace.latestHistoryRunId);
	const baselineLocked = $derived(workspace.baselineLocked);
	const rankOptions = $derived(workspace.rankOptions);
	const groupOptions = $derived(workspace.groupOptions);
	const mosOptions = $derived(workspace.mosOptions);
	const dutyRoleOptions = $derived(workspace.dutyRoleOptions);

	const viewTabs = $derived(workspace.viewTabs);
	const todayDate = $derived(workspace.todayDate);
	const generateStartDate = $derived(workspace.generateStartDate);
	const generateEndDate = $derived(workspace.generateEndDate);
	const canGenerate = $derived(workspace.canGenerate);
	const historyMode = $derived(workspace.historyMode);
	const acceptedHistoryColumns = $derived(workspace.acceptedHistoryColumns);

	$effect(() => {
		if (!data.settings) return;

		settingsName = selectedTemplate?.name ?? '';
		settingsSlug = selectedTemplate?.slug ?? '';
		settingsShortCode = selectedTemplate?.shortCode ?? '';
		settingsExemptPersonnelIds = [...(selectedTemplate?.exemptPersonnelIds ?? [])];
		settingsBaselineCounts = Object.fromEntries(
			data.settings.baselineRows.map((row) => [
				row.personnel.id,
				row.startingCount === null ? '' : String(row.startingCount)
			])
		);
		rankFilterValues = [...(selectedTemplate?.poolCriteria.rankValues ?? [])];
		groupFilterValues = [...(selectedTemplate?.poolCriteria.groupIds ?? [])];
		mosFilterValues = [...(selectedTemplate?.poolCriteria.mosValues ?? [])];
		dutyRoleFilterValues = [...(selectedTemplate?.poolCriteria.dutyRoleValues ?? [])];
	});

	$effect(() => {
		if (!isNewTemplate || !actionForm?.values) return;

		newTemplateName = actionForm.values.name ?? '';
		newTemplateSlug = actionForm.values.slug ?? '';
		newTemplateShortCode = actionForm.values.shortCode ?? '';
		rankFilterValues = [...(actionForm.values.rankValues ?? [])];
		groupFilterValues = [...(actionForm.values.groupIds ?? [])];
		mosFilterValues = [...(actionForm.values.mosValues ?? [])];
		dutyRoleFilterValues = [...(actionForm.values.dutyRoleValues ?? [])];
		wizardExemptPersonnelIds = [...(actionForm.values.exemptPersonnelIds ?? [])];
	});

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

	function historyDetailHref(run: DutyRosterTemplateAcceptedRun, mode: 'roster' | 'da6'): string {
		if (!selectedTemplate) return basePath;
		const detailPath = `${basePath}/${selectedTemplate.slug}/history/${run.id}`;
		return mode === 'da6' ? `${detailPath}?mode=da6` : detailPath;
	}

	function isCorrectionOpen(runId: string, date: string): boolean {
		return Boolean(editingCorrections[correctionKey(runId, date)]);
	}

	function selectedCorrectionAssigneeId(runId: string, date: string): string {
		return selectedCorrectionAssignees[correctionKey(runId, date)] ?? '';
	}

	function printDraftPreview(preview: DutyRosterTemplatePreview): void {
		printDutyRosterForBrowser({ templatePreview: preview, statusLabel: 'Draft' });
	}

	function printAcceptedRun(run: DutyRosterTemplateAcceptedRun): void {
		printDutyRosterForBrowser({ acceptedSnapshot: acceptedSnapshot(run), statusLabel: 'Official' });
	}
</script>

<svelte:head>
	<title>Duty Rosters - Troop to Task</title>
</svelte:head>

<section class="duty-roster-workspace" aria-labelledby="duty-roster-title">
	{#if selectedTemplate && !isNewTemplate}
		<h1 id="duty-roster-title" class="sr-only">{selectedTemplate.name} {selectedView}</h1>
	{:else}
		<header class="workspace-header">
			<div>
				<p class="eyebrow">{data.orgName}</p>
				<h1 id="duty-roster-title">Duty Rosters</h1>
				<p class="summary">One-duty DA Form 6 templates with durable workspace links.</p>
			</div>
			<div class="header-status" aria-label="Duty Roster Template count">
				<span>{data.templates.length}</span>
				<p>{data.templates.length === 1 ? 'Template' : 'Templates'}</p>
			</div>
		</header>
	{/if}

	{#if isNewTemplate}
		<DutyRosterNewTemplateWorkspace
			{basePath}
			{createWizardAction}
			{actionForm}
			{rankOptions}
			{groupOptions}
			{mosOptions}
			{dutyRoleOptions}
			setupPersonnel={workspace.setupPersonnel}
			bind:newTemplateStep
			bind:newTemplateName
			bind:newTemplateSlug
			bind:newTemplateShortCode
			bind:rankFilterValues
			bind:groupFilterValues
			bind:mosFilterValues
			bind:dutyRoleFilterValues
			bind:wizardExemptPersonnelIds
		/>
	{:else if !selectedTemplate}
		<section class="template-register" aria-labelledby="template-register-heading">
			<div class="template-register__header">
				<div>
					<p class="eyebrow">Duty Roster Templates</p>
					<h2 id="template-register-heading">Duty Rosters</h2>
					<p class="summary">
						One-duty DA6 roster generator per position. Open a template to generate, review history, or change settings.
					</p>
				</div>
				<a class="btn btn-primary" href={`${basePath}/new`}>New Template</a>
			</div>

			{#if data.templates.length === 0}
				<div class="admin-empty">
					<p>No templates yet</p>
					<p>Create a one-duty template for CQ, Staff Duty, or another DA Form 6 roster.</p>
				</div>
			{:else}
				<div class="template-grid" aria-label="Duty Roster Template list">
					{#each data.templates as template (template.id)}
						<article class="template-card card card-flat">
							<a class="template-card__main" href={`${basePath}/${template.slug}/generate`}>
								<div class="template-card__header">
									<div>
										<h3>{template.name}</h3>
										<span>/{template.slug}</span>
									</div>
									<span class="chip chip-primary">{template.shortCode ?? 'No code'}</span>
								</div>
								<div class="template-card__meta">
									<span><strong>{template.poolCriteria.rankValues.length || 'Any'}</strong> ranks</span>
									<span><strong>{template.exemptPersonnelIds.length}</strong> exempt</span>
									<span><strong>{Object.keys(template.manualBaselineCounts).length}</strong> baselines</span>
								</div>
							</a>
							<div class="template-card__actions" aria-label={`${template.name} quick actions`}>
								<a href={`${basePath}/${template.slug}/history`}>History</a>
								<a href={`${basePath}/${template.slug}/settings`}>Settings</a>
							</div>
						</article>
					{/each}
				</div>
			{/if}
		</section>
	{:else}
		<div class="template-detail-workspace">
			{#if actionForm?.error}
				<p class="form-error" role="alert">{actionForm.error}</p>
			{/if}

			<nav class="view-tabs" aria-label="Duty Roster Template views">
				{#each viewTabs as tab (tab.id)}
					<a
						class:active={selectedView === tab.id}
						href={`${basePath}/${selectedTemplate.slug}/${tab.id}`}
						aria-current={selectedView === tab.id ? 'page' : undefined}
					>
						<span>{tab.label}</span>
						<small>{tab.note}</small>
					</a>
				{/each}
			</nav>

			<main class="view-panel" aria-labelledby="template-view-heading">
				{#if selectedView === 'generate'}
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
									<button
										type="button"
										class:active={previewMode === 'matrix'}
										onclick={() => (previewMode = 'matrix')}
									>
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
															<Badge
																label="MANUAL"
																color="var(--color-warning-bg)"
																textColor="var(--color-warning-text)"
															/>
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
																<input
																	type="hidden"
																	name="startDate"
																	value={actionForm?.generateValues?.startDate ?? ''}
																/>
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
								<div
									class="pre-preview-state admin-table-shell admin-table-shell--scroll"
									aria-label="Generate preview required"
								>
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
				{:else if selectedView === 'history'}
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
								<a class="btn btn-secondary btn-sm" href={`${basePath}/${selectedTemplate.slug}/history`}>
									Back to History
								</a>
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
										<a class:active={historyMode === 'list'} href={historyDetailHref(historyDetailRun, 'roster')}>
											Roster
										</a>
										<a class:active={historyMode === 'matrix'} href={historyDetailHref(historyDetailRun, 'da6')}>
											DA6 Matrix
										</a>
									</div>
									<div class="accepted-detail-actions" aria-label="Official record actions">
										<button
											class="btn btn-secondary btn-sm"
											type="button"
											onclick={() => printAcceptedRun(historyDetailRun)}
										>
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
											Run {historyDetailRun.startDate} to {historyDetailRun.endDate} will be marked invalidated. Linked Calendar
											assignments for this run will be removed. This action is only available for the latest accepted run.
										</p>
									</div>
									<form class="invalidation-confirm__actions" method="POST" action={invalidateAcceptedRunAction}>
										<input type="hidden" name="runId" value={historyDetailRun.id} />
										<button class="btn btn-danger btn-sm" type="submit">Confirm invalidation</button>
										<button
											class="btn btn-secondary btn-sm"
											type="button"
											onclick={() => (confirmingInvalidationRunId = null)}
										>
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
												Calendar assignments linked to this run changed after apply. Re-applying may overwrite linked
												Calendar assignments, and invalidation will remove the run footprint after confirmation.
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
																		{tableRow.finalRow.finalDisplay.lastName}, {tableRow.finalRow.finalDisplay
																			.firstName}</strong
																	>
																{:else}
																	Unfilled
																{/if}
																{#if tableRow.finalRow.assignmentSource === 'manual' && tableRow.finalRow.generatedDisplay}
																	<small>
																		Generated: {tableRow.finalRow.generatedDisplay.rank}
																		{tableRow.finalRow.generatedDisplay.lastName}, {tableRow.finalRow.generatedDisplay
																			.firstName}
																	</small>
																{/if}
																{#if tableRow.correction?.replacementDisplay}
																	<small>
																		Actual: {tableRow.correction.replacementDisplay.rank}
																		{tableRow.correction.replacementDisplay.lastName}, {tableRow.correction
																			.replacementDisplay.firstName}
																	</small>
																{/if}
															</div>
														{:else if col.key === 'source'}
															{#if tableRow.correction}
																<Badge label="CORRECTED" variant="outlined" />
															{:else if tableRow.finalRow.assignmentSource === 'manual'}
																<Badge
																	label="MANUAL"
																	color="var(--color-warning-bg)"
																	textColor="var(--color-warning-text)"
																/>
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
																	<ul
																		class="manual-warnings"
																		aria-label={`Accepted warnings for ${tableRow.finalRow.date}`}
																	>
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
				{:else}
					<h2 id="template-view-heading" class="sr-only">Duty Roster Template settings</h2>
					{#if actionForm?.settingsError}
						<p class="form-error settings-error" role="alert">{actionForm.settingsError}</p>
					{/if}

					{#if data.settings}
						<form class="settings-form settings-form--ledger" method="POST" action={settingsAction}>
							<input type="hidden" name="templateId" value={selectedTemplate.id} />

							<div class="settings-layout settings-layout--ledger">
								<nav class="settings-nav settings-nav--ledger" aria-label="Template settings sections">
									<button
										type="button"
										class:active={settingsSection === 'general'}
										aria-pressed={settingsSection === 'general'}
										onclick={() => (settingsSection = 'general')}
									>
										General
									</button>
									<button
										type="button"
										class:active={settingsSection === 'pool'}
										aria-pressed={settingsSection === 'pool'}
										onclick={() => (settingsSection = 'pool')}
									>
										Pool & Filters
									</button>
									<button
										type="button"
										class:active={settingsSection === 'exemptions'}
										aria-pressed={settingsSection === 'exemptions'}
										onclick={() => (settingsSection = 'exemptions')}
									>
										Exemptions
									</button>
									<button
										type="button"
										class:active={settingsSection === 'baseline'}
										aria-pressed={settingsSection === 'baseline'}
										onclick={() => (settingsSection = 'baseline')}
									>
										DA6 Baseline
									</button>
								</nav>

								<div class="settings-panel settings-panel--ledger card card-flat">
									{#if settingsSection === 'general'}
										<section
											class="settings-section settings-section--general"
											aria-labelledby="template-identity-heading"
										>
											<h4 id="template-identity-heading">General settings</h4>
											<div class="identity-grid identity-grid--ledger">
												<label>
													<span>Template name</span>
													<input class="input" name="name" maxlength="120" required bind:value={settingsName} />
												</label>
												<label>
													<span>URL slug</span>
													<input class="input" name="slug" maxlength="72" required bind:value={settingsSlug} />
													<small>Scoped to organization. Must be unique.</small>
												</label>
												<label class="short-code-field">
													<span>Short code</span>
													<input
														class="input"
														name="shortCode"
														maxlength="12"
														bind:value={settingsShortCode}
														placeholder="CQ"
													/>
													<small>Used for compact calendar badges. Can repeat across templates.</small>
												</label>
											</div>
										</section>
									{:else}
										<input type="hidden" name="name" value={settingsName} />
										<input type="hidden" name="slug" value={settingsSlug} />
										<input type="hidden" name="shortCode" value={settingsShortCode} />
									{/if}

									{#if settingsSection === 'pool'}
										<section class="settings-section" aria-labelledby="pool-criteria-heading">
											<h4 id="pool-criteria-heading">Pool & filters</h4>
											<p class="field-hint">
												Selections match any value inside a category, then combine across categories. For example, SGT
												or CPL, and Alpha Group.
											</p>
											<div class="criteria-grid">
												<label class="tag-field">
													<span>Rank</span>
													<MultiTagSelect
														options={optionItems(rankOptions)}
														value={rankFilterValues}
														ariaLabel="Rank filters"
														placeholder="Any rank"
														onChange={(values) => (rankFilterValues = values)}
													/>
												</label>
												<label class="tag-field">
													<span>Group</span>
													<MultiTagSelect
														options={groupOptionItems(groupOptions)}
														value={groupFilterValues}
														ariaLabel="Group filters"
														placeholder="Any group"
														onChange={(values) => (groupFilterValues = values)}
													/>
												</label>
												<label class="tag-field">
													<span>MOS</span>
													<MultiTagSelect
														options={optionItems(mosOptions)}
														value={mosFilterValues}
														ariaLabel="MOS filters"
														placeholder="Any MOS"
														onChange={(values) => (mosFilterValues = values)}
													/>
												</label>
												<label class="tag-field">
													<span>Duty Role</span>
													<MultiTagSelect
														options={optionItems(dutyRoleOptions)}
														value={dutyRoleFilterValues}
														ariaLabel="Duty role filters"
														placeholder="Any role"
														onChange={(values) => (dutyRoleFilterValues = values)}
													/>
												</label>
											</div>
										</section>
									{/if}
									{#each rankFilterValues as value (value)}
										<input type="hidden" name="rankValues" {value} />
									{/each}
									{#each groupFilterValues as value (value)}
										<input type="hidden" name="groupIds" {value} />
									{/each}
									{#each mosFilterValues as value (value)}
										<input type="hidden" name="mosValues" {value} />
									{/each}
									{#each dutyRoleFilterValues as value (value)}
										<input type="hidden" name="dutyRoleValues" {value} />
									{/each}

									{#if settingsSection === 'exemptions'}
										<section class="settings-section" aria-labelledby="pool-preview-heading">
											<h4 id="pool-preview-heading">Exemptions</h4>
											{#if data.settings.resolvedPool.length === 0}
												<div class="admin-empty">No active Personnel Records match the current pool criteria.</div>
											{:else}
												<div class="pool-table admin-table-shell" role="table" aria-label="Resolved Duty Roster pool">
													<div class="pool-row pool-head" role="row">
														<span role="columnheader">Soldier</span>
														<span role="columnheader">Group</span>
														<span role="columnheader">MOS</span>
														<span role="columnheader">Exempt</span>
													</div>
													{#each data.settings.resolvedPool as person (person.id)}
														<div class="pool-row" role="row">
															<span role="cell">{person.rank} {person.lastName}, {person.firstName}</span>
															<span role="cell">{person.groupName || 'No Group'}</span>
															<span role="cell">{person.mos || 'No MOS'}</span>
															<span role="cell">
																<label class="row-check">
																	<input
																		type="checkbox"
																		name="exemptPersonnelIds"
																		value={person.id}
																		checked={settingsExemptPersonnelIds.includes(person.id)}
																		onchange={(event) => {
																			const checked = event.currentTarget.checked;
																			settingsExemptPersonnelIds = checked
																				? [...settingsExemptPersonnelIds, person.id]
																				: settingsExemptPersonnelIds.filter((id) => id !== person.id);
																		}}
																	/>
																	<span>Exempt</span>
																</label>
															</span>
														</div>
													{/each}
												</div>
											{/if}
										</section>
									{:else}
										{#each settingsExemptPersonnelIds as value (value)}
											<input type="hidden" name="exemptPersonnelIds" {value} />
										{/each}
									{/if}

									{#if settingsSection === 'baseline'}
										<section class="settings-section" aria-labelledby="baseline-heading">
											<h4 id="baseline-heading">DA6 Baseline</h4>
											<p>
												Counts are optional and apply only until the first accepted run for this template. Leave blank
												to start from DA6 roster order.
											</p>
											{#if baselineLocked}
												<p class="admin-alert admin-alert--warning">
													Manual DA6 Baseline is locked because this template has accepted history. Future previews use
													accepted runs for DA6 continuity.
												</p>
											{/if}
											{#if data.settings.baselineRows.length === 0}
												<div class="admin-empty">
													No baseline rows are available until the non-exempt pool has members.
												</div>
											{:else}
												<div class="baseline-list admin-table-shell">
													{#each data.settings.baselineRows as row (row.personnel.id)}
														<label>
															<span>{row.personnel.rank} {row.personnel.lastName}, {row.personnel.firstName}</span>
															<input
																class="input"
																type="number"
																min="0"
																step="1"
																name={`baseline:${row.personnel.id}`}
																value={settingsBaselineCounts[row.personnel.id] ?? ''}
																placeholder="Count"
																readonly={baselineLocked}
																oninput={(event) => {
																	settingsBaselineCounts = {
																		...settingsBaselineCounts,
																		[row.personnel.id]: event.currentTarget.value
																	};
																}}
															/>
														</label>
													{/each}
												</div>
											{/if}
										</section>
									{:else}
										{#each data.settings.baselineRows as row (row.personnel.id)}
											<input
												type="hidden"
												name={`baseline:${row.personnel.id}`}
												value={settingsBaselineCounts[row.personnel.id] ?? ''}
											/>
										{/each}
									{/if}

									<div class="settings-actions">
										<a class="btn btn-secondary" href={`${basePath}/${selectedTemplate.slug}/generate`}>Cancel</a>
										<button class="btn btn-primary" type="submit">Save settings</button>
									</div>
								</div>
							</div>
						</form>
					{:else}
						<div class="admin-empty">Loading template settings...</div>
					{/if}
				{/if}
			</main>
		</div>
	{/if}
</section>
