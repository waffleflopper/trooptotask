<script lang="ts">
	import { CalendarDays, History, Play, UsersRound, Zap } from '@lucide/svelte';
	import MultiTagSelect from '$lib/components/ui/MultiTagSelect.svelte';
	import {
		groupOptionItems,
		optionItems,
		type DutyRosterTemplateSettingsWorkspaceModel
	} from '$features/duty-roster/workspace/dutyRosterWorkspaceReadModel';

	let { settings }: { settings: DutyRosterTemplateSettingsWorkspaceModel } = $props();

	let settingsName = $state('');
	let settingsSlug = $state('');
	let settingsShortCode = $state('');
	let settingsExemptPersonnelIds = $state<string[]>([]);
	let settingsBaselineCounts = $state<Record<string, string>>({});
	let rankFilterValues = $state<string[]>([]);
	let groupFilterValues = $state<string[]>([]);
	let mosFilterValues = $state<string[]>([]);
	let dutyRoleFilterValues = $state<string[]>([]);

	const selectedTemplate = $derived(settings.selectedTemplate);
	const actionForm = $derived(settings.actionForm);
	const templateSettings = $derived(settings.settings);
	const settingsAction = $derived(settings.settingsAction);
	const baselineLocked = $derived(settings.baselineLocked);
	const latestAcceptedRun = $derived(settings.acceptedRuns[0] ?? null);
	const eligibleCount = $derived(
		templateSettings ? Math.max(templateSettings.resolvedPool.length - settingsExemptPersonnelIds.length, 0) : 0
	);

	$effect(() => {
		if (!templateSettings) return;

		settingsName = selectedTemplate.name;
		settingsSlug = selectedTemplate.slug;
		settingsShortCode = selectedTemplate.shortCode ?? '';
		settingsExemptPersonnelIds = [...selectedTemplate.exemptPersonnelIds];
		settingsBaselineCounts = Object.fromEntries(
			templateSettings.baselineRows.map((row) => [
				row.personnel.id,
				row.startingCount === null ? '' : String(row.startingCount)
			])
		);
		rankFilterValues = [...selectedTemplate.poolCriteria.rankValues];
		groupFilterValues = [...selectedTemplate.poolCriteria.groupIds];
		mosFilterValues = [...selectedTemplate.poolCriteria.mosValues];
		dutyRoleFilterValues = [...selectedTemplate.poolCriteria.dutyRoleValues];
	});

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
		const dateText = formatDate(value);
		const timeText = new Intl.DateTimeFormat('en-US', {
			hour: '2-digit',
			minute: '2-digit',
			hour12: false
		}).format(date);
		return `${dateText} ${timeText}`;
	}

	function soldierLabel(person: { rank: string; lastName: string; firstName: string }): string {
		return `${person.rank} ${person.lastName}, ${person.firstName}`;
	}
</script>

<h2 id="template-view-heading" class="sr-only">Duty Roster Template settings</h2>
{#if actionForm?.settingsError}
	<p class="form-error settings-error" role="alert">{actionForm.settingsError}</p>
{/if}

{#if templateSettings}
	<form class="settings-form settings-form--ledger" method="POST" action={settingsAction}>
		<input type="hidden" name="templateId" value={selectedTemplate.id} />

		<div class="settings-ledger-shell">
			<div class="settings-ledger-main">
				<section class="settings-section settings-section--general" aria-labelledby="template-identity-heading">
					<h4 id="template-identity-heading">Template Details</h4>
					<div class="identity-grid identity-grid--ledger">
						<label>
							<span>Template name</span>
							<input class="input" name="name" maxlength="120" required bind:value={settingsName} />
						</label>
						<label>
							<span>Template slug</span>
							<input class="input" name="slug" maxlength="72" required bind:value={settingsSlug} />
						</label>
						<label class="short-code-field">
							<span>Short code</span>
							<input class="input" name="shortCode" maxlength="12" bind:value={settingsShortCode} placeholder="CQ" />
						</label>
						<label>
							<span>Status</span>
							<input class="input" value={selectedTemplate.status === 'active' ? 'Active' : 'Archived'} readonly />
						</label>
					</div>
				</section>

				<section class="settings-section" aria-labelledby="pool-criteria-heading">
					<h4 id="pool-criteria-heading">Pool Criteria</h4>
					<div class="criteria-grid">
						<label class="tag-field">
							<span>Included ranks</span>
							<MultiTagSelect
								options={optionItems(settings.rankOptions)}
								value={rankFilterValues}
								ariaLabel="Rank filters"
								placeholder="Any rank"
								onChange={(values) => (rankFilterValues = values)}
							/>
						</label>
						<label class="tag-field">
							<span>Included groups</span>
							<MultiTagSelect
								options={groupOptionItems(settings.groupOptions)}
								value={groupFilterValues}
								ariaLabel="Group filters"
								placeholder="Any group"
								onChange={(values) => (groupFilterValues = values)}
							/>
						</label>
						<label class="tag-field">
							<span>Included MOS</span>
							<MultiTagSelect
								options={optionItems(settings.mosOptions)}
								value={mosFilterValues}
								ariaLabel="MOS filters"
								placeholder="Any MOS"
								onChange={(values) => (mosFilterValues = values)}
							/>
						</label>
						<label class="tag-field">
							<span>Duty roles</span>
							<MultiTagSelect
								options={optionItems(settings.dutyRoleOptions)}
								value={dutyRoleFilterValues}
								ariaLabel="Duty role filters"
								placeholder="Any role"
								onChange={(values) => (dutyRoleFilterValues = values)}
							/>
						</label>
					</div>
					<p class="field-hint">Soldiers must meet all selected criteria to be eligible for this duty.</p>
				</section>
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

				<div class="settings-lower-grid">
					<section class="settings-section" aria-labelledby="pool-preview-heading">
						<h4 id="pool-preview-heading">Duty-Specific Exemptions</h4>
						<p class="field-hint">These Soldiers will be excluded from eligibility for this duty.</p>
						{#if templateSettings.resolvedPool.length === 0}
							<div class="admin-empty">No active Personnel Records match the current pool criteria.</div>
						{:else}
							<div class="pool-table admin-table-shell" role="table" aria-label="Resolved Duty Roster pool">
								<div class="pool-row pool-head" role="row">
									<span role="columnheader">Rank</span>
									<span role="columnheader">Name</span>
									<span role="columnheader">MOS</span>
									<span role="columnheader">Group</span>
									<span role="columnheader">Exempt</span>
								</div>
								{#each templateSettings.resolvedPool as person (person.id)}
									<div class="pool-row" role="row">
										<span role="cell">{person.rank}</span>
										<span role="cell">{person.lastName}, {person.firstName}</span>
										<span role="cell">{person.mos || '-'}</span>
										<span role="cell">{person.groupName || 'No Group'}</span>
										<span role="cell">
											<label class="row-check row-check--icon-only">
												<span class="sr-only">Exclude {person.rank} {person.lastName}, {person.firstName}</span>
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
											</label>
										</span>
									</div>
								{/each}
							</div>
						{/if}
					</section>

					<section class="settings-section" aria-labelledby="baseline-heading">
						<h4 id="baseline-heading">Manual DA6 Baseline</h4>
						<p class="field-hint">Adjust starting duty counts for these Soldiers for the next run.</p>
						{#if baselineLocked}
							<p class="admin-alert admin-alert--warning">
								Manual DA6 Baseline is locked because this template has accepted history. Future previews use accepted
								runs for DA6 continuity.
							</p>
						{/if}
						{#if templateSettings.baselineRows.length === 0}
							<div class="admin-empty">No baseline rows are available until the non-exempt pool has members.</div>
						{:else}
							<div class="baseline-list admin-table-shell" role="table" aria-label="Manual DA6 baseline">
								<div class="baseline-row baseline-head" role="row">
									<span role="columnheader">Rank</span>
									<span role="columnheader">Name</span>
									<span role="columnheader">MOS</span>
									<span role="columnheader">Group</span>
									<span role="columnheader">Count</span>
								</div>
								{#each templateSettings.baselineRows as row (row.personnel.id)}
									<div class="baseline-row" role="row">
										<span role="cell">{row.personnel.rank}</span>
										<span role="cell">{row.personnel.lastName}, {row.personnel.firstName}</span>
										<span role="cell">{row.personnel.mos || '-'}</span>
										<span role="cell">{row.personnel.groupName || 'No Group'}</span>
										<span role="cell">
											{#if baselineLocked}
												<span class="baseline-count-value">{settingsBaselineCounts[row.personnel.id] || '0'}</span>
												<input
													type="hidden"
													name={`baseline:${row.personnel.id}`}
													value={settingsBaselineCounts[row.personnel.id] ?? ''}
												/>
											{:else}
												<input
													class="input"
													type="number"
													min="0"
													step="1"
													name={`baseline:${row.personnel.id}`}
													value={settingsBaselineCounts[row.personnel.id] ?? ''}
													aria-label={`Starting count for ${soldierLabel(row.personnel)}`}
													placeholder="Count"
													oninput={(event) => {
														settingsBaselineCounts = {
															...settingsBaselineCounts,
															[row.personnel.id]: event.currentTarget.value
														};
													}}
												/>
											{/if}
										</span>
									</div>
								{/each}
							</div>
						{/if}
					</section>
				</div>

				<p class="settings-impact-note">
					Edits to this template affect future runs only. Accepted runs and historical assignments will not be changed.
				</p>
			</div>

			<aside class="settings-ledger-rail" aria-label="Template summary">
				<section class="settings-rail-card">
					<h3><UsersRound size={20} aria-hidden="true" /> Template Summary</h3>
					<dl>
						<div>
							<dt>Pool</dt>
							<dd>{selectedTemplate.shortCode ?? selectedTemplate.name}</dd>
						</div>
						<div>
							<dt>Total Soldiers</dt>
							<dd>{templateSettings.personnel.length}</dd>
						</div>
						<div>
							<dt>Eligible</dt>
							<dd>{eligibleCount}</dd>
						</div>
						<div>
							<dt>Excluded</dt>
							<dd>{settingsExemptPersonnelIds.length}</dd>
						</div>
						<div>
							<dt>Last Updated</dt>
							<dd>{formatDateTime(selectedTemplate.updatedAt)}</dd>
						</div>
					</dl>
				</section>

				{#if latestAcceptedRun}
					<section class="settings-rail-card">
						<h3><CalendarDays size={20} aria-hidden="true" /> Latest Accepted Run</h3>
						<dl>
							<div>
								<dt>Date Range</dt>
								<dd>{formatDate(latestAcceptedRun.startDate)} to {formatDate(latestAcceptedRun.endDate)}</dd>
							</div>
							<div>
								<dt>Applied On</dt>
								<dd>{formatDateTime(latestAcceptedRun.appliedAt)}</dd>
							</div>
							<div>
								<dt>Accepted By</dt>
								<dd>{latestAcceptedRun.acceptedByDisplayName ?? '-'}</dd>
							</div>
							<div>
								<dt>Run ID</dt>
								<dd>{latestAcceptedRun.id}</dd>
							</div>
						</dl>
					</section>
				{/if}

				<section class="settings-rail-card">
					<h3><Zap size={20} aria-hidden="true" /> Quick Actions</h3>
					<div class="settings-rail-actions">
						<a class="btn btn-primary" href={`${settings.basePath}/${selectedTemplate.slug}/generate`}>
							<Play size={16} aria-hidden="true" />
							Open Generate
						</a>
						<a class="btn btn-secondary" href={`${settings.basePath}/${selectedTemplate.slug}/history`}>
							<History size={16} aria-hidden="true" />
							Open History
						</a>
					</div>
				</section>

				<div class="settings-actions">
					<a class="btn btn-secondary" href={`${settings.basePath}/${selectedTemplate.slug}/generate`}>Discard</a>
					<button class="btn btn-primary" type="submit">Save settings</button>
				</div>
			</aside>
		</div>
	</form>
{:else}
	<div class="admin-empty">Loading template settings...</div>
{/if}
