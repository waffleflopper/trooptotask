<script lang="ts">
	import type {
		DutyRosterTemplateAcceptedRun,
		DutyRosterTemplate,
		DutyRosterTemplateSettingsData,
		DutyRosterTemplateView
	} from '$features/duty-roster/templates/dutyRosterTemplates';
	import {
		manualSelectionForDate,
		previewFinalAssigneeId,
		type DutyRosterTemplateAcceptedSnapshot,
		type DutyRosterTemplatePreview
	} from '$features/duty-roster/templates/dutyRosterTemplatePreview';

	type ActionForm = {
		error?: string;
		generateError?: string;
		manualError?: string;
		settingsError?: string;
		preview?: DutyRosterTemplatePreview;
		generateValues?: {
			startDate?: string;
			endDate?: string;
		};
		values?: {
			name?: string;
			shortCode?: string;
		};
	};

	interface WorkspaceData {
		orgId: string;
		orgName: string;
		templates: DutyRosterTemplate[];
		selectedTemplate?: DutyRosterTemplate | null;
		settings?: DutyRosterTemplateSettingsData | null;
		acceptedRuns?: DutyRosterTemplateAcceptedRun[];
		view?: DutyRosterTemplateView;
	}

	let { data, form }: { data: WorkspaceData; form?: unknown } = $props();

	const basePath = $derived(`/org/${data.orgId}/duty-rosters`);
	const createAction = $derived(`${basePath}?/createTemplate`);
	const selectedTemplate = $derived(data.selectedTemplate ?? data.templates[0] ?? null);
	const selectedView = $derived(data.view ?? 'generate');
	const actionForm = $derived((form && typeof form === 'object' ? form : null) as ActionForm | null);
	const preview = $derived(selectedView === 'generate' ? (actionForm?.preview ?? null) : null);
	const generateAction = $derived(
		selectedTemplate ? `${basePath}/${selectedTemplate.slug}/generate?/generatePreview` : createAction
	);
	const manualPreviewAction = $derived(
		selectedTemplate ? `${basePath}/${selectedTemplate.slug}/generate?/manualPreviewSelection` : createAction
	);
	const acceptPreviewAction = $derived(
		selectedTemplate ? `${basePath}/${selectedTemplate.slug}/generate?/acceptPreview` : createAction
	);
	const settingsAction = $derived(
		selectedTemplate ? `${basePath}/${selectedTemplate.slug}/settings?/updateSettings` : createAction
	);
	const acceptedRuns = $derived(data.acceptedRuns ?? []);
	const baselineLocked = $derived(acceptedRuns.length > 0);
	const rankOptions = $derived(uniqueOptions(data.settings?.personnel.map((person) => person.rank) ?? []));
	const groupOptions = $derived(uniqueGroupOptions(data.settings?.personnel ?? []));
	const mosOptions = $derived(
		uniqueOptions(data.settings?.personnel.map((person) => person.mos).filter(Boolean) ?? [])
	);
	const dutyRoleOptions = $derived(
		uniqueOptions(data.settings?.personnel.map((person) => person.dutyRole).filter(Boolean) ?? [])
	);

	const viewTabs: Array<{ id: DutyRosterTemplateView; label: string; note: string }> = [
		{ id: 'generate', label: 'Generate', note: 'Preview future DA6 runs' },
		{ id: 'history', label: 'History', note: 'Accepted runs will appear here' },
		{ id: 'settings', label: 'Settings', note: 'Template identity and setup' }
	];

	function uniqueOptions(values: string[]): string[] {
		return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
	}

	function uniqueGroupOptions(
		personnel: DutyRosterTemplateSettingsData['personnel']
	): Array<{ id: string; label: string }> {
		const groups: Array<{ id: string; label: string }> = [];
		for (const person of personnel) {
			if (person.groupId && !groups.some((group) => group.id === person.groupId)) {
				groups.push({ id: person.groupId, label: person.groupName || 'Unassigned Group' });
			}
		}

		return groups.sort((a, b) => a.label.localeCompare(b.label));
	}

	function previewAssignee(preview: DutyRosterTemplatePreview, assigneeId: string | null) {
		return preview.selectionPersonnel.find((person) => person.id === assigneeId) ?? null;
	}

	function previewFormValue(preview: DutyRosterTemplatePreview): string {
		return JSON.stringify(preview);
	}

	function acceptedSnapshot(run: DutyRosterTemplateAcceptedRun): DutyRosterTemplateAcceptedSnapshot {
		return run.snapshotPayload as unknown as DutyRosterTemplateAcceptedSnapshot;
	}

	function acceptedCellDisplay(
		cell: DutyRosterTemplateAcceptedSnapshot['da6']['rows'][number]['cells'][number]
	): string {
		return previewCellDisplay(cell);
	}

	function previewCellDisplay(cell: DutyRosterTemplatePreview['da6']['rows'][number]['cells'][number]): string {
		if (cell.da6Code === 'A') {
			return 'A';
		}
		if (cell.da6Code === 'D' || cell.da6Code === 'U') {
			return `${cell.da6Code}${cell.sequenceNumber ?? ''}`;
		}
		return cell.sequenceNumber === null ? '' : String(cell.sequenceNumber);
	}
</script>

<svelte:head>
	<title>Duty Rosters - Troop to Task</title>
</svelte:head>

<section class="duty-roster-workspace" aria-labelledby="duty-roster-title">
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

	<div class="workspace-grid">
		<aside class="template-rail" aria-label="Duty Roster Templates">
			<div class="rail-heading">
				<div>
					<p class="eyebrow">Template Register</p>
					<h2>One duty per template</h2>
				</div>
			</div>

			{#if actionForm?.error}
				<p class="form-error" role="alert">{actionForm.error}</p>
			{/if}

			<form class="create-form" method="POST" action={createAction}>
				<label>
					<span>Name</span>
					<input
						name="name"
						type="text"
						maxlength="120"
						required
						autocomplete="off"
						value={actionForm?.values?.name ?? ''}
						placeholder="CQ NCO"
					/>
				</label>
				<label>
					<span>Short code</span>
					<input
						name="shortCode"
						type="text"
						maxlength="12"
						autocomplete="off"
						value={actionForm?.values?.shortCode ?? ''}
						placeholder="CQ"
					/>
				</label>
				<button class="btn btn-primary" type="submit">Create template</button>
			</form>

			{#if data.templates.length === 0}
				<div class="empty-register">
					<p class="empty-title">No templates yet</p>
					<p>Create a one-duty template for CQ, Staff Duty, or another DA Form 6 roster.</p>
				</div>
			{:else}
				<nav class="template-list" aria-label="Open Duty Roster Template">
					{#each data.templates as template (template.id)}
						<a
							class:active={selectedTemplate?.id === template.id}
							href={`${basePath}/${template.slug}/generate`}
							aria-current={selectedTemplate?.id === template.id ? 'page' : undefined}
						>
							<span class="template-name">{template.name}</span>
							<span class="template-meta">
								<span>{template.shortCode ?? 'No code'}</span>
								<span>/{template.slug}</span>
							</span>
						</a>
					{/each}
				</nav>
			{/if}
		</aside>

		<main class="template-work-surface">
			{#if selectedTemplate}
				<div class="template-title-row">
					<div>
						<p class="eyebrow">Selected Template</p>
						<h2>{selectedTemplate.name}</h2>
					</div>
					<div class="template-identity">
						<span>{selectedTemplate.shortCode ?? 'No short code'}</span>
						<code>/{selectedTemplate.slug}</code>
					</div>
				</div>

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

				<section class="view-panel" aria-labelledby="template-view-heading">
					{#if selectedView === 'generate'}
						<p class="eyebrow">Generate View</p>
						<h3 id="template-view-heading">DA6 preview workspace</h3>
						<p>
							Generate creates a preview only. Review the proposed roster in the list and DA6 matrix before it becomes
							official history in a later slice.
						</p>

						{#if actionForm?.generateError}
							<p class="form-error settings-error" role="alert">{actionForm.generateError}</p>
						{/if}

						<form class="generate-form" method="POST" action={generateAction}>
							<input type="hidden" name="templateId" value={selectedTemplate.id} />
							<label>
								<span>Start date</span>
								<input name="startDate" type="date" required value={actionForm?.generateValues?.startDate ?? ''} />
							</label>
							<label>
								<span>End date</span>
								<input name="endDate" type="date" required value={actionForm?.generateValues?.endDate ?? ''} />
							</label>
							<button class="btn btn-primary" type="submit">Generate preview</button>
						</form>

						{#if preview}
							<div class="preview-summary" aria-label="Generated preview summary">
								<div>
									<span>Duty dates</span>
									<strong>{preview.rosterRows.length}</strong>
								</div>
								<div>
									<span>Pool rows</span>
									<strong>{preview.da6.rows.length}</strong>
								</div>
								<div>
									<span>Preview state</span>
									<strong>Unsaved</strong>
								</div>
							</div>

							{#if actionForm?.manualError}
								<p class="form-error settings-error" role="alert">{actionForm.manualError}</p>
							{/if}

							<section class="settings-section" aria-labelledby="preview-list-heading">
								<h4 id="preview-list-heading">Preview list</h4>
								<div class="preview-list" role="table" aria-label="Generated Duty Roster preview">
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
													<span class="manual-badge">MANUAL</span>
												{:else}
													Generated
												{/if}
											</span>
											<div role="cell">
												<form class="manual-preview-form" method="POST" action={manualPreviewAction}>
													<input type="hidden" name="preview" value={previewFormValue(preview)} />
													<input type="hidden" name="date" value={row.date} />
													<input type="hidden" name="startDate" value={actionForm?.generateValues?.startDate ?? ''} />
													<input type="hidden" name="endDate" value={actionForm?.generateValues?.endDate ?? ''} />
													<label>
														<span>Soldier</span>
														<select name="assigneeId" required>
															{#each preview.selectionPersonnel as person (person.id)}
																<option
																	value={person.id}
																	selected={previewFinalAssigneeId(preview, row.date) === person.id}
																>
																	{person.rank}
																	{person.lastName}, {person.firstName}
																</option>
															{/each}
														</select>
													</label>
													<label>
														<span>Reason</span>
														<input
															name="reason"
															type="text"
															value={manualSelection?.reason ?? ''}
															placeholder="Required for warnings"
														/>
													</label>
													<button class="btn btn-secondary" type="submit">Apply manual</button>
												</form>
											</div>
										</div>
									{/each}
								</div>
							</section>

							<section class="settings-section" aria-labelledby="preview-matrix-heading">
								<h4 id="preview-matrix-heading">DA6 matrix</h4>
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

							<form class="accept-preview-form" method="POST" action={acceptPreviewAction}>
								<input type="hidden" name="preview" value={previewFormValue(preview)} />
								<button class="btn btn-primary" type="submit">Accept run</button>
							</form>
						{:else}
							<div class="state-grid" aria-label="Generate readiness">
								<div>
									<span>Template ID</span>
									<code>{selectedTemplate.id}</code>
								</div>
								<div>
									<span>Route State</span>
									<strong>Refresh-safe</strong>
								</div>
								<div>
									<span>Generation</span>
									<strong>Preview only</strong>
								</div>
							</div>
						{/if}
					{:else if selectedView === 'history'}
						<p class="eyebrow">History View</p>
						<h3 id="template-view-heading">Accepted runs</h3>
						<p>
							Accepted Duty Roster Runs are official history. List review shows generated versus manual rows; the matrix
							renders from the saved snapshot.
						</p>
						{#if acceptedRuns.length === 0}
							<div class="empty-history">History is empty until a DA6 run is accepted.</div>
						{:else}
							<div class="accepted-run-list">
								{#each acceptedRuns as run (run.id)}
									{@const snapshot = acceptedSnapshot(run)}
									<section class="settings-section accepted-run" aria-label={`${run.templateName} accepted run`}>
										<div class="accepted-run-heading">
											<div>
												<h4>{run.templateName}</h4>
												<p>{run.startDate} to {run.endDate}</p>
											</div>
											<span class="official-badge">Official</span>
										</div>

										<div class="preview-list" role="table" aria-label="Accepted Duty Roster list">
											<div class="preview-row preview-head" role="row">
												<span role="columnheader">Date</span>
												<span role="columnheader">Assigned Soldier</span>
												<span role="columnheader">Source</span>
												<span role="columnheader">Review state</span>
											</div>
											{#each snapshot.finalRows as row (row.date)}
												<div class="preview-row" role="row">
													<span role="cell">{row.date}</span>
													<div class="preview-selection" role="cell">
														{#if row.finalDisplay}
															<strong
																>{row.finalDisplay.rank}
																{row.finalDisplay.lastName}, {row.finalDisplay.firstName}</strong
															>
														{:else}
															Unfilled
														{/if}
														{#if row.assignmentSource === 'manual' && row.generatedDisplay}
															<small>
																Generated: {row.generatedDisplay.rank}
																{row.generatedDisplay.lastName}, {row.generatedDisplay.firstName}
															</small>
														{/if}
													</div>
													<span role="cell">
														{#if row.assignmentSource === 'manual'}
															<span class="manual-badge">MANUAL</span>
														{:else}
															Generated
														{/if}
													</span>
													<div class="preview-selection" role="cell">
														{#if row.warnings.length}
															<ul class="manual-warnings" aria-label={`Accepted warnings for ${row.date}`}>
																{#each row.warnings as warning (warning.code)}
																	<li>{warning.message}</li>
																{/each}
															</ul>
														{:else}
															<small>No warnings</small>
														{/if}
														{#if row.reason}
															<small>Reason: {row.reason}</small>
														{/if}
													</div>
												</div>
											{/each}
										</div>

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
									</section>
								{/each}
							</div>
						{/if}
					{:else}
						<p class="eyebrow">Settings View</p>
						<h3 id="template-view-heading">Template setup</h3>
						<p>
							Pool filters combine with OR inside one category and AND across categories. Exemptions remove Soldiers
							from this duty only. Manual DA6 Baseline counts are optional first-use setup data.
						</p>

						{#if actionForm?.settingsError}
							<p class="form-error settings-error" role="alert">{actionForm.settingsError}</p>
						{/if}

						{#if data.settings}
							<form class="settings-form" method="POST" action={settingsAction}>
								<input type="hidden" name="templateId" value={selectedTemplate.id} />

								<div class="settings-summary" aria-label="Resolved pool summary">
									<div>
										<span>Resolved pool</span>
										<strong>{data.settings.resolvedPool.length}</strong>
									</div>
									<div>
										<span>Exemptions</span>
										<strong>{selectedTemplate.exemptPersonnelIds.length}</strong>
									</div>
									<div>
										<span>Baseline rows</span>
										<strong>{data.settings.baselineRows.length}</strong>
									</div>
								</div>

								<section class="settings-section" aria-labelledby="pool-criteria-heading">
									<h4 id="pool-criteria-heading">Pool criteria</h4>
									<div class="criteria-grid">
										<fieldset>
											<legend>Rank</legend>
											{#each rankOptions as rank (rank)}
												<label>
													<input
														type="checkbox"
														name="rankValues"
														value={rank}
														checked={selectedTemplate.poolCriteria.rankValues.includes(rank)}
													/>
													<span>{rank}</span>
												</label>
											{/each}
										</fieldset>
										<fieldset>
											<legend>Group</legend>
											{#each groupOptions as group (group.id)}
												<label>
													<input
														type="checkbox"
														name="groupIds"
														value={group.id}
														checked={selectedTemplate.poolCriteria.groupIds.includes(group.id)}
													/>
													<span>{group.label}</span>
												</label>
											{/each}
										</fieldset>
										<fieldset>
											<legend>MOS</legend>
											{#each mosOptions as mos (mos)}
												<label>
													<input
														type="checkbox"
														name="mosValues"
														value={mos}
														checked={selectedTemplate.poolCriteria.mosValues.includes(mos)}
													/>
													<span>{mos}</span>
												</label>
											{/each}
										</fieldset>
										<fieldset>
											<legend>Duty Role</legend>
											{#each dutyRoleOptions as role (role)}
												<label>
													<input
														type="checkbox"
														name="dutyRoleValues"
														value={role}
														checked={selectedTemplate.poolCriteria.dutyRoleValues.includes(role)}
													/>
													<span>{role}</span>
												</label>
											{/each}
										</fieldset>
									</div>
								</section>

								<section class="settings-section" aria-labelledby="pool-preview-heading">
									<h4 id="pool-preview-heading">Resolved pool and exemptions</h4>
									{#if data.settings.resolvedPool.length === 0}
										<div class="empty-history">No active Personnel Records match the current pool criteria.</div>
									{:else}
										<div class="pool-table" role="table" aria-label="Resolved Duty Roster pool">
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
																checked={selectedTemplate.exemptPersonnelIds.includes(person.id)}
															/>
															<span>Exempt</span>
														</label>
													</span>
												</div>
											{/each}
										</div>
									{/if}
								</section>

								<section class="settings-section" aria-labelledby="baseline-heading">
									<h4 id="baseline-heading">Manual DA6 Baseline</h4>
									<p>
										Counts are optional and apply only until the first accepted run for this template. Leave blank to
										start from DA6 roster order.
									</p>
									{#if baselineLocked}
										<p class="baseline-lock">
											Manual DA6 Baseline is locked because this template has accepted history. Future previews use
											accepted runs for DA6 continuity.
										</p>
									{/if}
									{#if data.settings.baselineRows.length === 0}
										<div class="empty-history">
											No baseline rows are available until the non-exempt pool has members.
										</div>
									{:else}
										<div class="baseline-list">
											{#each data.settings.baselineRows as row (row.personnel.id)}
												<label>
													<span>{row.personnel.rank} {row.personnel.lastName}, {row.personnel.firstName}</span>
													<input
														type="number"
														min="0"
														step="1"
														name={`baseline:${row.personnel.id}`}
														value={row.startingCount ?? ''}
														placeholder="Count"
														readonly={baselineLocked}
													/>
												</label>
											{/each}
										</div>
									{/if}
								</section>

								<button class="btn btn-primary" type="submit">Save settings</button>
							</form>
						{:else}
							<div class="empty-history">Loading template settings...</div>
						{/if}
					{/if}
				</section>
			{:else}
				<section class="no-selection" aria-labelledby="empty-workspace-heading">
					<p class="eyebrow">Workspace Ready</p>
					<h2 id="empty-workspace-heading">Create the first Duty Roster Template</h2>
					<p>
						The workspace is ready for one-duty templates. Create a template to open Generate, History, and Settings
						views with real URLs.
					</p>
				</section>
			{/if}
		</main>
	</div>
</section>

<style>
	.duty-roster-workspace {
		display: flex;
		flex-direction: column;
		gap: var(--sp-5);
		padding: var(--sp-5);
		color: var(--text-primary);
	}

	.workspace-header,
	.template-title-row {
		display: flex;
		gap: var(--sp-4);
		align-items: flex-start;
		justify-content: space-between;
		border-bottom: 1px solid var(--border-default);
		padding-bottom: var(--sp-4);
	}

	.workspace-header h1,
	.template-title-row h2,
	.rail-heading h2,
	.view-panel h3,
	.no-selection h2 {
		margin: 0;
		color: var(--text-primary);
		line-height: 1.05;
	}

	.workspace-header h1 {
		font-size: 2rem;
	}

	.summary,
	.view-panel p,
	.no-selection p,
	.empty-register p {
		margin: var(--sp-1) 0 0;
		max-width: 68ch;
		color: var(--text-secondary);
	}

	.eyebrow {
		margin: 0 0 var(--sp-1);
		color: var(--text-tertiary);
		font-family: var(--font-mono);
		font-size: 0.72rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.header-status,
	.template-identity {
		display: grid;
		gap: 2px;
		justify-items: end;
		min-width: 8rem;
		color: var(--text-secondary);
		font-family: var(--font-mono);
		font-size: 0.75rem;
		text-transform: uppercase;
	}

	.header-status span {
		color: var(--text-primary);
		font-size: 1.8rem;
		font-weight: 800;
		line-height: 1;
	}

	.header-status p {
		margin: 0;
	}

	.workspace-grid {
		display: grid;
		grid-template-columns: minmax(18rem, 22rem) minmax(0, 1fr);
		gap: var(--sp-5);
		align-items: start;
	}

	.template-rail,
	.template-work-surface,
	.view-panel,
	.no-selection {
		border: 1px solid var(--border-default);
		border-radius: 6px;
		background: var(--surface-panel);
	}

	.template-rail {
		display: flex;
		flex-direction: column;
		gap: var(--sp-4);
		padding: var(--sp-4);
	}

	.create-form {
		display: grid;
		gap: var(--sp-3);
	}

	.create-form label {
		display: grid;
		gap: var(--sp-1);
		color: var(--text-secondary);
		font-family: var(--font-mono);
		font-size: 0.72rem;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}

	.create-form input {
		width: 100%;
		min-height: 2.6rem;
		border: 1px solid var(--border-default);
		border-radius: 4px;
		background: var(--surface-subtle);
		color: var(--text-primary);
		font: inherit;
		font-family: var(--font-body);
		letter-spacing: 0;
		text-transform: none;
		padding: 0 var(--sp-3);
	}

	.create-form input:focus-visible {
		outline: 2px solid var(--amber);
		outline-offset: 2px;
	}

	.generate-form {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 14rem)) auto;
		gap: var(--sp-3);
		align-items: end;
		margin-top: var(--sp-4);
	}

	.generate-form label {
		display: grid;
		gap: var(--sp-1);
		color: var(--text-secondary);
		font-family: var(--font-mono);
		font-size: 0.72rem;
		font-weight: 700;
		text-transform: uppercase;
	}

	.generate-form input {
		min-height: 2.45rem;
		border: 1px solid var(--border-default);
		border-radius: 4px;
		background: var(--surface-subtle);
		color: var(--text-primary);
		font: inherit;
		font-family: var(--font-body);
		padding: 0 var(--sp-2);
	}

	.form-error {
		margin: 0;
		border: 1px solid var(--danger);
		border-radius: 4px;
		background: var(--danger-bg);
		color: var(--danger);
		padding: var(--sp-2) var(--sp-3);
	}

	.empty-register,
	.empty-history {
		border: 1px dashed var(--border-default);
		border-radius: 4px;
		background: var(--surface-subtle);
		padding: var(--sp-4);
		color: var(--text-secondary);
	}

	.empty-title {
		margin: 0;
		color: var(--text-primary);
		font-weight: 700;
	}

	.template-list {
		display: grid;
		gap: var(--sp-2);
	}

	.template-list a,
	.view-tabs a {
		display: grid;
		gap: 2px;
		border: 1px solid var(--border-default);
		border-radius: 4px;
		color: inherit;
		text-decoration: none;
		transition:
			background 160ms ease-out,
			border-color 160ms ease-out;
	}

	.template-list a {
		padding: var(--sp-3);
	}

	.template-list a:hover,
	.template-list a.active,
	.view-tabs a:hover,
	.view-tabs a.active {
		border-color: var(--amber);
		background: var(--surface-subtle);
	}

	.template-name {
		font-weight: 800;
	}

	.template-meta {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-2);
		color: var(--text-tertiary);
		font-family: var(--font-mono);
		font-size: 0.72rem;
		text-transform: uppercase;
	}

	.template-work-surface {
		display: grid;
		gap: var(--sp-4);
		padding: var(--sp-4);
	}

	.template-identity code,
	.state-grid code {
		color: var(--text-primary);
		font-family: var(--font-mono);
	}

	.view-tabs {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: var(--sp-2);
	}

	.view-tabs a {
		min-height: 4.5rem;
		padding: var(--sp-3);
	}

	.view-tabs span {
		font-weight: 800;
	}

	.view-tabs small {
		color: var(--text-secondary);
		line-height: 1.35;
	}

	.view-panel,
	.no-selection {
		padding: var(--sp-5);
	}

	.state-grid {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: var(--sp-3);
		margin-top: var(--sp-4);
	}

	.state-grid div {
		display: grid;
		gap: 4px;
		border: 1px solid var(--border-default);
		border-radius: 4px;
		background: var(--surface-subtle);
		padding: var(--sp-3);
	}

	.state-grid span {
		color: var(--text-tertiary);
		font-family: var(--font-mono);
		font-size: 0.7rem;
		font-weight: 700;
		text-transform: uppercase;
	}

	.state-grid strong {
		margin: 0;
		color: var(--text-primary);
	}

	.settings-error {
		margin-top: var(--sp-4);
	}

	.settings-form {
		display: grid;
		gap: var(--sp-4);
		margin-top: var(--sp-4);
	}

	.settings-summary,
	.preview-summary,
	.criteria-grid {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: var(--sp-3);
	}

	.criteria-grid {
		grid-template-columns: repeat(4, minmax(0, 1fr));
	}

	.settings-summary div,
	.preview-summary div,
	.settings-section {
		border: 1px solid var(--border-default);
		border-radius: 4px;
		background: var(--surface-subtle);
	}

	.settings-summary div,
	.preview-summary div {
		display: grid;
		gap: 4px;
		padding: var(--sp-3);
	}

	.settings-summary span,
	.preview-summary span,
	.pool-head,
	.preview-head,
	.settings-section h4,
	.criteria-grid legend {
		color: var(--text-tertiary);
		font-family: var(--font-mono);
		font-size: 0.7rem;
		font-weight: 700;
		text-transform: uppercase;
	}

	.settings-summary strong,
	.preview-summary strong {
		color: var(--text-primary);
		font-size: 1.35rem;
		line-height: 1;
	}

	.settings-section {
		display: grid;
		gap: var(--sp-3);
		padding: var(--sp-4);
	}

	.settings-section h4 {
		margin: 0;
	}

	.baseline-lock {
		margin: 0;
		border-left: 3px solid var(--amber);
		background: var(--surface-subtle);
		color: var(--text-secondary);
		padding: var(--sp-2) var(--sp-3);
	}

	.criteria-grid fieldset {
		display: grid;
		gap: var(--sp-2);
		min-width: 0;
		margin: 0;
		border: 1px solid var(--border-default);
		border-radius: 4px;
		background: var(--surface-panel);
		padding: var(--sp-3);
	}

	.criteria-grid label,
	.row-check,
	.baseline-list label {
		display: flex;
		gap: var(--sp-2);
		align-items: center;
		color: var(--text-primary);
	}

	.pool-table,
	.preview-list,
	.baseline-list {
		display: grid;
		border: 1px solid var(--border-default);
		border-radius: 4px;
		overflow: hidden;
		background: var(--surface-panel);
	}

	.pool-row {
		display: grid;
		grid-template-columns: minmax(10rem, 1.3fr) minmax(7rem, 0.8fr) minmax(5rem, 0.5fr) minmax(6rem, 0.5fr);
		gap: var(--sp-3);
		align-items: center;
		padding: var(--sp-2) var(--sp-3);
		border-top: 1px solid var(--border-default);
	}

	.pool-row:first-child {
		border-top: 0;
	}

	.pool-head {
		background: var(--surface-subtle);
	}

	.preview-summary {
		margin-top: var(--sp-4);
	}

	.preview-row {
		display: grid;
		grid-template-columns: minmax(7rem, 0.45fr) minmax(14rem, 1fr) minmax(7rem, 0.45fr) minmax(18rem, 1.3fr);
		gap: var(--sp-3);
		align-items: start;
		padding: var(--sp-2) var(--sp-3);
		border-top: 1px solid var(--border-default);
	}

	.preview-row:first-child {
		border-top: 0;
	}

	.preview-head {
		background: var(--surface-subtle);
	}

	.preview-selection,
	.manual-preview-form {
		display: grid;
		gap: var(--sp-2);
	}

	.preview-selection strong {
		color: var(--text-primary);
		font-weight: 800;
	}

	.preview-selection small {
		color: var(--text-tertiary);
		line-height: 1.35;
	}

	.manual-badge {
		display: inline-flex;
		width: fit-content;
		border: 1px solid var(--color-warning-border, var(--border-default));
		border-radius: 4px;
		background: var(--color-warning-bg, var(--surface-subtle));
		color: var(--color-warning-text, var(--text-primary));
		font-family: var(--font-mono);
		font-size: 0.7rem;
		font-weight: 800;
		letter-spacing: 0;
		padding: 2px var(--sp-2);
	}

	.manual-warnings {
		display: grid;
		gap: 4px;
		margin: 0;
		padding-left: var(--sp-4);
		color: var(--color-warning-text, var(--text-primary));
		font-size: 0.85rem;
		line-height: 1.35;
	}

	.manual-preview-form {
		grid-template-columns: minmax(10rem, 1fr) minmax(10rem, 1fr) auto;
		align-items: end;
	}

	.manual-preview-form label {
		display: grid;
		gap: 4px;
		color: var(--text-secondary);
		font-family: var(--font-mono);
		font-size: 0.68rem;
		font-weight: 700;
		text-transform: uppercase;
	}

	.manual-preview-form input,
	.manual-preview-form select {
		min-height: 2.25rem;
		border: 1px solid var(--border-default);
		border-radius: 4px;
		background: var(--surface-panel);
		color: var(--text-primary);
		font: inherit;
		font-family: var(--font-body);
		padding: 0 var(--sp-2);
	}

	.accept-preview-form {
		display: flex;
		justify-content: flex-end;
	}

	.accepted-run-list,
	.accepted-run {
		display: grid;
		gap: var(--sp-4);
	}

	.accepted-run-heading {
		display: flex;
		gap: var(--sp-3);
		align-items: flex-start;
		justify-content: space-between;
		padding: var(--sp-3);
		border-bottom: 1px solid var(--border-default);
	}

	.accepted-run-heading h4,
	.accepted-run-heading p {
		margin: 0;
	}

	.accepted-run-heading p {
		color: var(--text-tertiary);
		font-family: var(--font-mono);
		font-size: 0.75rem;
		text-transform: uppercase;
	}

	.official-badge {
		display: inline-flex;
		width: fit-content;
		border: 1px solid var(--border-default);
		border-radius: 4px;
		background: var(--surface-panel);
		color: var(--text-primary);
		font-family: var(--font-mono);
		font-size: 0.7rem;
		font-weight: 800;
		letter-spacing: 0;
		padding: 2px var(--sp-2);
		text-transform: uppercase;
	}

	.matrix-scroll {
		overflow-x: auto;
		border: 1px solid var(--border-default);
		border-radius: 4px;
		background: var(--surface-panel);
	}

	.da6-matrix {
		width: 100%;
		min-width: 38rem;
		border-collapse: collapse;
	}

	.da6-matrix th,
	.da6-matrix td {
		border: 1px solid var(--border-default);
		padding: var(--sp-2);
		text-align: center;
	}

	.da6-matrix th {
		background: var(--surface-subtle);
		color: var(--text-secondary);
		font-family: var(--font-mono);
		font-size: 0.72rem;
		text-transform: uppercase;
	}

	.da6-matrix th:first-child {
		position: sticky;
		left: 0;
		z-index: 1;
		text-align: left;
	}

	.da6-matrix td {
		color: var(--text-primary);
		font-family: var(--font-mono);
	}

	.da6-matrix td.assigned {
		background: var(--surface-subtle);
		font-weight: 800;
	}

	.baseline-list label {
		justify-content: space-between;
		padding: var(--sp-2) var(--sp-3);
		border-top: 1px solid var(--border-default);
	}

	.baseline-list label:first-child {
		border-top: 0;
	}

	.baseline-list input {
		width: 7rem;
		min-height: 2.25rem;
		border: 1px solid var(--border-default);
		border-radius: 4px;
		background: var(--surface-subtle);
		color: var(--text-primary);
		padding: 0 var(--sp-2);
	}

	@media (max-width: 900px) {
		.duty-roster-workspace {
			padding: var(--sp-3);
		}

		.workspace-header,
		.template-title-row {
			display: grid;
		}

		.header-status,
		.template-identity {
			justify-items: start;
		}

		.workspace-grid,
		.generate-form,
		.view-tabs,
		.state-grid,
		.settings-summary,
		.preview-summary,
		.criteria-grid,
		.pool-row,
		.preview-row {
			grid-template-columns: 1fr;
		}

		.manual-preview-form {
			grid-template-columns: 1fr;
		}
	}
</style>
