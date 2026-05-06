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
	let exemptionQuery = $state('');
	let showExcludedOnly = $state(false);
	let baselineQuery = $state('');
	let showBaselineCountsOnly = $state(false);

	const MAX_SETTINGS_TABLE_ROWS = 100;

	const selectedTemplate = $derived(settings.selectedTemplate);
	const actionForm = $derived(settings.actionForm);
	const templateSettings = $derived(settings.settings);
	const settingsAction = $derived(settings.settingsAction);
	const baselineLocked = $derived(settings.baselineLocked);
	const latestAcceptedRun = $derived(settings.acceptedRuns[0] ?? null);
	const eligibleCount = $derived(
		templateSettings ? Math.max(templateSettings.resolvedPool.length - settingsExemptPersonnelIds.length, 0) : 0
	);
	const settingsExemptPersonnelIdSet = $derived(new Set(settingsExemptPersonnelIds));
	const filteredExemptionRows = $derived(
		templateSettings
			? templateSettings.resolvedPool.filter((person) => {
					const isExcluded = settingsExemptPersonnelIdSet.has(person.id);
					return (
						(!showExcludedOnly || isExcluded) &&
						matchesPersonnelQuery(person, exemptionQuery, selectedTemplate.shortCode ?? selectedTemplate.name)
					);
				})
			: []
	);
	const visibleExemptionRows = $derived(filteredExemptionRows.slice(0, MAX_SETTINGS_TABLE_ROWS));
	const visibleExemptionIds = $derived(new Set(visibleExemptionRows.map((person) => person.id)));
	const hiddenExemptPersonnelIds = $derived(
		settingsExemptPersonnelIds.filter((personnelId) => !visibleExemptionIds.has(personnelId))
	);
	const filteredBaselineRows = $derived(
		templateSettings
			? templateSettings.baselineRows.filter((row) => {
					const countValue = settingsBaselineCounts[row.personnel.id] ?? '';
					return (
						(!showBaselineCountsOnly || countValue !== '') &&
						matchesPersonnelQuery(row.personnel, baselineQuery, countValue)
					);
				})
			: []
	);
	const visibleBaselineRows = $derived(filteredBaselineRows.slice(0, MAX_SETTINGS_TABLE_ROWS));
	const visibleBaselineIds = $derived(new Set(visibleBaselineRows.map((row) => row.personnel.id)));
	const hiddenBaselineRows = $derived(
		templateSettings ? templateSettings.baselineRows.filter((row) => !visibleBaselineIds.has(row.personnel.id)) : []
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

	function matchesPersonnelQuery(
		person: { rank: string; lastName: string; firstName: string; mos?: string | null; groupName?: string | null },
		query: string,
		extraValue = ''
	): boolean {
		const normalizedQuery = query.trim().toLowerCase();
		if (!normalizedQuery) return true;

		return [
			person.rank,
			person.lastName,
			person.firstName,
			person.mos ?? '',
			person.groupName ?? 'No Group',
			extraValue
		]
			.join(' ')
			.toLowerCase()
			.includes(normalizedQuery);
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
					<div class="settings-section-heading">
						<span class="settings-step">01</span>
						<div>
							<h4 id="template-identity-heading">Template Identity</h4>
						</div>
					</div>
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
						<div class="settings-readonly-field">
							<span>Status</span>
							<strong class="settings-status-badge"
								>{selectedTemplate.status === 'active' ? 'Active' : 'Archived'}</strong
							>
						</div>
					</div>
				</section>

				<section class="settings-section" aria-labelledby="pool-criteria-heading">
					<div class="settings-section-heading">
						<span class="settings-step">02</span>
						<div>
							<h4 id="pool-criteria-heading">Eligibility Rules</h4>
						</div>
					</div>
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

				<p class="settings-impact-note settings-impact-note--top">
					Future runs only. Accepted runs and historical assignments will not be changed.
				</p>

				<section class="settings-section settings-section--table" aria-labelledby="pool-preview-heading">
					<div class="settings-section-heading settings-section-heading--split">
						<span class="settings-step">03</span>
						<div>
							<h4 id="pool-preview-heading">Individual Exclusions</h4>
						</div>
						<div class="settings-section-stat">
							<strong>{settingsExemptPersonnelIds.length}</strong>
							<span>Excluded</span>
						</div>
					</div>
					<p class="field-hint">These Soldiers will be excluded from eligibility for this duty.</p>
					{#if templateSettings.resolvedPool.length === 0}
						<div class="admin-empty">No active Personnel Records match the current pool criteria.</div>
					{:else}
						<div class="settings-table-tools" aria-label="Individual exclusion table tools">
							<label class="settings-table-search">
								<span>Search pool</span>
								<input class="input" type="search" placeholder="Name, rank, MOS, group" bind:value={exemptionQuery} />
							</label>
							<label class="settings-toggle">
								<input type="checkbox" bind:checked={showExcludedOnly} />
								<span>Show excluded only</span>
							</label>
							<p>
								Showing {visibleExemptionRows.length} of {filteredExemptionRows.length}
								matching Soldiers
							</p>
						</div>
						<div class="pool-table admin-table-shell" role="table" aria-label="Resolved Duty Roster pool">
							<div class="pool-row pool-head" role="row">
								<span role="columnheader">Rank</span>
								<span role="columnheader">Name</span>
								<span role="columnheader">MOS</span>
								<span role="columnheader">Group</span>
								<span role="columnheader">Exempt</span>
							</div>
							{#each visibleExemptionRows as person (person.id)}
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
												checked={settingsExemptPersonnelIdSet.has(person.id)}
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
							{#if visibleExemptionRows.length === 0}
								<div class="settings-table-empty">No Soldiers match the current table view.</div>
							{/if}
						</div>
						{#each hiddenExemptPersonnelIds as personnelId (personnelId)}
							<input type="hidden" name="exemptPersonnelIds" value={personnelId} />
						{/each}
					{/if}
				</section>

				<section class="settings-section settings-section--table" aria-labelledby="baseline-heading">
					<div class="settings-section-heading">
						<span class="settings-step">04</span>
						<div>
							<h4 id="baseline-heading">DA6 Continuity</h4>
						</div>
					</div>
					<p class="field-hint">Adjust starting duty counts for these Soldiers for the next run.</p>
					{#if baselineLocked}
						<p class="admin-alert admin-alert--warning">
							Manual DA6 Baseline is locked. This template already has accepted history, so future previews use the
							accepted runs for DA6 continuity.
						</p>
					{/if}
					{#if templateSettings.baselineRows.length === 0}
						<div class="admin-empty">No baseline rows are available until the non-exempt pool has members.</div>
					{:else}
						<div class="settings-table-tools" aria-label="DA6 baseline table tools">
							<label class="settings-table-search">
								<span>Search baseline</span>
								<input
									class="input"
									type="search"
									placeholder="Name, rank, MOS, group, count"
									bind:value={baselineQuery}
								/>
							</label>
							<label class="settings-toggle">
								<input type="checkbox" bind:checked={showBaselineCountsOnly} />
								<span>Show counted only</span>
							</label>
							<p>
								Showing {visibleBaselineRows.length} of {filteredBaselineRows.length}
								matching Soldiers
							</p>
						</div>
						<div class="baseline-list admin-table-shell" role="table" aria-label="Manual DA6 baseline">
							<div class="baseline-row baseline-head" role="row">
								<span role="columnheader">Rank</span>
								<span role="columnheader">Name</span>
								<span role="columnheader">MOS</span>
								<span role="columnheader">Group</span>
								<span role="columnheader">Count</span>
							</div>
							{#each visibleBaselineRows as row (row.personnel.id)}
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
							{#if visibleBaselineRows.length === 0}
								<div class="settings-table-empty">No baseline rows match the current table view.</div>
							{/if}
						</div>
						{#each hiddenBaselineRows as row (row.personnel.id)}
							<input
								type="hidden"
								name={`baseline:${row.personnel.id}`}
								value={settingsBaselineCounts[row.personnel.id] ?? ''}
							/>
						{/each}
					{/if}
				</section>

				<div class="settings-save-strip" aria-label="Settings save actions">
					<span>Future runs only</span>
					<div class="settings-actions">
						<a
							class="btn btn-secondary"
							href={`${settings.basePath}/${selectedTemplate.slug}/generate`}
							aria-label="Discard from sticky bar">Discard</a
						>
						<button class="btn btn-primary" type="submit" aria-label="Save settings from sticky bar"
							>Save settings</button
						>
					</div>
				</div>
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
			</aside>
		</div>
	</form>
{:else}
	<div class="admin-empty">Loading template settings...</div>
{/if}
