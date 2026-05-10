<script lang="ts">
	import { CalendarDays, History, Play, UsersRound, Zap } from '@lucide/svelte';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import * as Field from '$lib/components/ui/field';
	import { Input } from '$lib/components/ui/input';
	import * as MultiSelect from '$lib/components/ui/multi-select';
	import { Switch } from '$lib/components/ui/switch';
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

	function optionLabel(options: Array<{ value: string; label: string }>, value: string): string {
		return options.find((option) => option.value === value)?.label ?? value;
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
						<Field.Root>
							<Field.Label for="settings-template-name">Template name</Field.Label>
							<Input id="settings-template-name" name="name" maxlength={120} required bind:value={settingsName} />
						</Field.Root>
						<Field.Root>
							<Field.Label for="settings-template-slug">Template slug</Field.Label>
							<Input id="settings-template-slug" name="slug" maxlength={72} required bind:value={settingsSlug} />
						</Field.Root>
						<Field.Root class="short-code-field">
							<Field.Label for="settings-template-short-code">Short code</Field.Label>
							<Input
								id="settings-template-short-code"
								name="shortCode"
								maxlength={12}
								bind:value={settingsShortCode}
								placeholder="CQ"
							/>
						</Field.Root>
						<Field.Root>
							<Field.Label>Status</Field.Label>
							<Badge variant={selectedTemplate.status === 'active' ? 'success' : 'secondary'}>
								{selectedTemplate.status === 'active' ? 'Active' : 'Archived'}
							</Badge>
						</Field.Root>
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
						<Field.Root class="tag-field">
							<Field.Label>Included ranks</Field.Label>
							<MultiSelect.Root
								items={optionItems(settings.rankOptions)}
								multiple
								bind:value={rankFilterValues}
								label="Rank filters"
							>
								<MultiSelect.Trigger>
									<MultiSelect.Value>
										{#snippet children(values)}
											{#each values as value (value)}
												<MultiSelect.Chip {value}
													>{optionLabel(optionItems(settings.rankOptions), value)}</MultiSelect.Chip
												>
											{/each}
											<MultiSelect.Input placeholder="Any rank" aria-label="Rank filters" />
										{/snippet}
									</MultiSelect.Value>
								</MultiSelect.Trigger>
								<MultiSelect.Content>
									<MultiSelect.Empty>No ranks found.</MultiSelect.Empty>
									<MultiSelect.List />
								</MultiSelect.Content>
							</MultiSelect.Root>
						</Field.Root>
						<Field.Root class="tag-field">
							<Field.Label>Included groups</Field.Label>
							<MultiSelect.Root
								items={groupOptionItems(settings.groupOptions)}
								multiple
								bind:value={groupFilterValues}
								label="Group filters"
							>
								<MultiSelect.Trigger>
									<MultiSelect.Value>
										{#snippet children(values)}
											{#each values as value (value)}
												<MultiSelect.Chip {value}
													>{optionLabel(groupOptionItems(settings.groupOptions), value)}</MultiSelect.Chip
												>
											{/each}
											<MultiSelect.Input placeholder="Any group" aria-label="Group filters" />
										{/snippet}
									</MultiSelect.Value>
								</MultiSelect.Trigger>
								<MultiSelect.Content>
									<MultiSelect.Empty>No groups found.</MultiSelect.Empty>
									<MultiSelect.List />
								</MultiSelect.Content>
							</MultiSelect.Root>
						</Field.Root>
						<Field.Root class="tag-field">
							<Field.Label>Included MOS</Field.Label>
							<MultiSelect.Root
								items={optionItems(settings.mosOptions)}
								multiple
								bind:value={mosFilterValues}
								label="MOS filters"
							>
								<MultiSelect.Trigger>
									<MultiSelect.Value>
										{#snippet children(values)}
											{#each values as value (value)}
												<MultiSelect.Chip {value}
													>{optionLabel(optionItems(settings.mosOptions), value)}</MultiSelect.Chip
												>
											{/each}
											<MultiSelect.Input placeholder="Any MOS" aria-label="MOS filters" />
										{/snippet}
									</MultiSelect.Value>
								</MultiSelect.Trigger>
								<MultiSelect.Content>
									<MultiSelect.Empty>No MOS values found.</MultiSelect.Empty>
									<MultiSelect.List />
								</MultiSelect.Content>
							</MultiSelect.Root>
						</Field.Root>
						<Field.Root class="tag-field">
							<Field.Label>Duty roles</Field.Label>
							<MultiSelect.Root
								items={optionItems(settings.dutyRoleOptions)}
								multiple
								bind:value={dutyRoleFilterValues}
								label="Duty role filters"
							>
								<MultiSelect.Trigger>
									<MultiSelect.Value>
										{#snippet children(values)}
											{#each values as value (value)}
												<MultiSelect.Chip {value}
													>{optionLabel(optionItems(settings.dutyRoleOptions), value)}</MultiSelect.Chip
												>
											{/each}
											<MultiSelect.Input placeholder="Any role" aria-label="Duty role filters" />
										{/snippet}
									</MultiSelect.Value>
								</MultiSelect.Trigger>
								<MultiSelect.Content>
									<MultiSelect.Empty>No duty roles found.</MultiSelect.Empty>
									<MultiSelect.List />
								</MultiSelect.Content>
							</MultiSelect.Root>
						</Field.Root>
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
							<Field.Root class="settings-table-search">
								<Field.Label for="settings-exemption-search">Search pool</Field.Label>
								<Input
									id="settings-exemption-search"
									type="search"
									placeholder="Name, rank, MOS, group"
									bind:value={exemptionQuery}
								/>
							</Field.Root>
							<Field.Root orientation="horizontal" class="settings-toggle">
								<Switch id="settings-show-excluded-only" bind:checked={showExcludedOnly} />
								<Field.Label for="settings-show-excluded-only">Show excluded only</Field.Label>
							</Field.Root>
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
										<Checkbox
											name="exemptPersonnelIds"
											value={person.id}
											aria-label={`Exclude ${person.rank} ${person.lastName}, ${person.firstName}`}
											checked={settingsExemptPersonnelIdSet.has(person.id)}
											onCheckedChange={(checked) => {
												settingsExemptPersonnelIds = checked
													? [...settingsExemptPersonnelIds, person.id]
													: settingsExemptPersonnelIds.filter((id) => id !== person.id);
											}}
										/>
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
							<Field.Root class="settings-table-search">
								<Field.Label for="settings-baseline-search">Search baseline</Field.Label>
								<Input
									id="settings-baseline-search"
									type="search"
									placeholder="Name, rank, MOS, group, count"
									bind:value={baselineQuery}
								/>
							</Field.Root>
							<Field.Root orientation="horizontal" class="settings-toggle">
								<Switch id="settings-show-baseline-counts-only" bind:checked={showBaselineCountsOnly} />
								<Field.Label for="settings-show-baseline-counts-only">Show counted only</Field.Label>
							</Field.Root>
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
											<Input
												type="number"
												min={0}
												step={1}
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
						<Button
							variant="outline"
							href={`${settings.basePath}/${selectedTemplate.slug}/generate`}
							aria-label="Discard from sticky bar">Discard</Button
						>
						<Button type="submit" aria-label="Save settings from sticky bar">Save settings</Button>
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
						<Button href={`${settings.basePath}/${selectedTemplate.slug}/generate`}>
							<Play size={16} aria-hidden="true" />
							Open Generate
						</Button>
						<Button variant="outline" href={`${settings.basePath}/${selectedTemplate.slug}/history`}>
							<History size={16} aria-hidden="true" />
							Open History
						</Button>
					</div>
				</section>
			</aside>
		</div>
	</form>
{:else}
	<div class="admin-empty">Loading template settings...</div>
{/if}
