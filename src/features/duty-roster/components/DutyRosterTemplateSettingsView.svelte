<script lang="ts">
	import { CalendarDays, History, Play, UsersRound, X, Zap } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Combobox from '$lib/components/ui/combobox';
	import * as Field from '$lib/components/ui/field';
	import { Input } from '$lib/components/ui/input';
	import { Switch } from '$lib/components/ui/switch';
	import {
		DutyRosterStatusBadge,
		SearchableRuleMultiSelect,
		WarningSummary
	} from '$features/duty-roster/components/shared';
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
	let pendingExemptionId = $state('');
	let settingsBaselineCounts = $state<Record<string, string>>({});
	let rankFilterValues = $state<string[]>([]);
	let groupFilterValues = $state<string[]>([]);
	let mosFilterValues = $state<string[]>([]);
	let dutyRoleFilterValues = $state<string[]>([]);
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
	const selectedExemptionRows = $derived(
		templateSettings
			? settingsExemptPersonnelIds
					.map((personnelId) => templateSettings.resolvedPool.find((person) => person.id === personnelId))
					.filter((person): person is NonNullable<typeof person> => Boolean(person))
			: []
	);
	const exemptionOptions = $derived(
		templateSettings
			? templateSettings.resolvedPool
					.filter((person) => !settingsExemptPersonnelIdSet.has(person.id))
					.map((person) => ({
						value: person.id,
						label: soldierLabel(person),
						description: [person.mos, person.groupName || 'No Group', person.dutyRole].filter(Boolean).join(' • ')
					}))
			: []
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
	const rankRuleOptions = $derived(optionItems(settings.rankOptions));
	const groupRuleOptions = $derived(groupOptionItems(settings.groupOptions));
	const mosRuleOptions = $derived(optionItems(settings.mosOptions));
	const dutyRoleRuleOptions = $derived(optionItems(settings.dutyRoleOptions));

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
		rankFilterValues =
			selectedTemplate.poolCriteria.rankValues.length > 0
				? [...selectedTemplate.poolCriteria.rankValues]
				: [...settings.rankOptions];
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

	function addExemption(personnelId: string): void {
		if (!personnelId || settingsExemptPersonnelIdSet.has(personnelId)) return;
		settingsExemptPersonnelIds = [...settingsExemptPersonnelIds, personnelId];
		pendingExemptionId = '';
	}

	function removeExemption(personnelId: string): void {
		settingsExemptPersonnelIds = settingsExemptPersonnelIds.filter((id) => id !== personnelId);
	}

	function rankValuesForSubmit(): string[] {
		const allRankOptions = new Set(settings.rankOptions);
		const selectedRankValues = new Set(rankFilterValues);
		const allRanksSelected =
			allRankOptions.size > 0 &&
			allRankOptions.size === selectedRankValues.size &&
			[...allRankOptions].every((rank) => selectedRankValues.has(rank));

		return allRanksSelected ? [] : rankFilterValues;
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
	<WarningSummary tone="destructive" title="Settings save failed" description={actionForm.settingsError} />
{/if}

{#if templateSettings}
	<form class="grid gap-0" method="POST" action={settingsAction}>
		<input type="hidden" name="templateId" value={selectedTemplate.id} />

		<div class="grid gap-0 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,22rem)]">
			<div class="grid content-start gap-6 p-1">
				<section
					class="grid gap-5 rounded-lg border border-border bg-card p-4"
					aria-labelledby="template-identity-heading"
				>
					<div class="flex flex-wrap items-start justify-between gap-4">
						<div class="grid gap-1">
							<div class="flex items-center gap-3">
								<span
									class="inline-flex h-6 min-w-8 items-center justify-center rounded-md border border-border bg-muted px-2 font-mono text-[0.7rem] font-medium text-muted-foreground"
									>01</span
								>
								<h4 id="template-identity-heading" class="text-sm font-semibold text-foreground">Template Identity</h4>
							</div>
							<p class="max-w-2xl text-xs text-muted-foreground">
								These labels identify the template in links, compact tables, and exports.
							</p>
						</div>
						<DutyRosterStatusBadge status={selectedTemplate.status === 'active' ? 'active' : 'archived'} />
					</div>
					<div class="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(12rem,0.7fr)]">
						<Field.Root>
							<Field.Label for="settings-template-name">Template name</Field.Label>
							<Input id="settings-template-name" name="name" maxlength={120} required bind:value={settingsName} />
						</Field.Root>
						<Field.Root>
							<Field.Label for="settings-template-slug">Template slug</Field.Label>
							<Input id="settings-template-slug" name="slug" maxlength={72} required bind:value={settingsSlug} />
							<Field.Description>Used in the template URL. Keep it short and readable.</Field.Description>
						</Field.Root>
						<Field.Root>
							<Field.Label for="settings-template-short-code">Short code</Field.Label>
							<Input
								id="settings-template-short-code"
								name="shortCode"
								maxlength={12}
								bind:value={settingsShortCode}
								placeholder="CQ"
							/>
							<Field.Description>Shown in compact tables and exports.</Field.Description>
						</Field.Root>
					</div>
				</section>

				<section class="grid gap-4 border-t border-border pt-6" aria-labelledby="pool-criteria-heading">
					<div class="flex items-center gap-3">
						<span
							class="inline-flex h-6 min-w-8 items-center justify-center rounded-md border border-border bg-muted px-2 font-mono text-[0.7rem] font-medium text-muted-foreground"
							>02</span
						>
						<h4 id="pool-criteria-heading" class="text-sm font-semibold text-foreground">Eligibility Rules</h4>
					</div>
					<div class="grid gap-4 sm:grid-cols-2">
						<Field.Root>
							<Field.Label>Included ranks</Field.Label>
							<SearchableRuleMultiSelect
								options={rankRuleOptions}
								bind:value={rankFilterValues}
								label="Rank filters"
								placeholder="Search ranks..."
								emptyLabel="No ranks found."
							/>
						</Field.Root>
						<Field.Root>
							<Field.Label>Included groups</Field.Label>
							<SearchableRuleMultiSelect
								options={groupRuleOptions}
								bind:value={groupFilterValues}
								label="Group filters"
								placeholder="Search groups..."
								emptyLabel="No groups found."
							/>
						</Field.Root>
						<Field.Root>
							<Field.Label>Included MOS</Field.Label>
							<SearchableRuleMultiSelect
								options={mosRuleOptions}
								bind:value={mosFilterValues}
								label="MOS filters"
								placeholder="Search MOS..."
								emptyLabel="No MOS values found."
							/>
						</Field.Root>
						<Field.Root>
							<Field.Label>Duty roles</Field.Label>
							<SearchableRuleMultiSelect
								options={dutyRoleRuleOptions}
								bind:value={dutyRoleFilterValues}
								label="Duty role filters"
								placeholder="Search duty roles..."
								emptyLabel="No duty roles found."
							/>
						</Field.Root>
					</div>
					<p class="text-xs text-muted-foreground">
						Soldiers must meet all selected criteria to be eligible for this duty.
					</p>
				</section>
				{#each rankValuesForSubmit() as value (value)}
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

				<WarningSummary
					tone="warning"
					title="Settings affect future runs only"
					description="Accepted runs and historical assignments will not be changed."
				/>

				<section class="grid gap-4 border-t border-border pt-6" aria-labelledby="pool-preview-heading">
					<div class="flex items-center justify-between gap-3">
						<div class="flex items-center gap-3">
							<span
								class="inline-flex h-6 min-w-8 items-center justify-center rounded-md border border-border bg-muted px-2 font-mono text-[0.7rem] font-medium text-muted-foreground"
								>03</span
							>
							<h4 id="pool-preview-heading" class="text-sm font-semibold text-foreground">Individual Exclusions</h4>
						</div>
						<div class="flex items-center gap-2 font-mono text-xs">
							<strong class="text-foreground">{settingsExemptPersonnelIds.length}</strong>
							<span class="text-muted-foreground">Excluded</span>
						</div>
					</div>
					<p class="text-xs text-muted-foreground">These Soldiers will be excluded from eligibility for this duty.</p>
					{#if templateSettings.resolvedPool.length === 0}
						<div class="grid place-items-center gap-2 px-5 py-8 text-center text-sm text-muted-foreground">
							No active Personnel Records match the current pool criteria.
						</div>
					{:else}
						<Field.Root>
							<Field.Label for="settings-exemption-picker">Add exclusion</Field.Label>
							<Combobox.Root
								items={exemptionOptions}
								bind:value={pendingExemptionId}
								label="Add Soldier exclusion"
								onValueChange={(value) => addExemption(Array.isArray(value) ? (value[0] ?? '') : value)}
								autoHighlight
							>
								<Combobox.Trigger
									id="settings-exemption-picker"
									placeholder="Search by name, rank, MOS, group..."
									aria-label="Add Soldier exclusion"
								/>
								<Combobox.Content>
									<Combobox.Search placeholder="Search by name, rank, MOS, group..." />
									<Combobox.Empty>No Soldiers found.</Combobox.Empty>
									<Combobox.List />
								</Combobox.Content>
							</Combobox.Root>
							<Field.Description>Only Soldiers in the resolved pool can be excluded.</Field.Description>
						</Field.Root>
						<div class="grid gap-2 rounded-md border border-border bg-muted/20 p-3">
							{#if selectedExemptionRows.length > 0}
								{#each selectedExemptionRows as person (person.id)}
									<div
										class="flex items-center justify-between gap-3 rounded-md border border-border bg-card px-3 py-2"
									>
										<div class="min-w-0">
											<strong class="block truncate text-sm text-foreground">{soldierLabel(person)}</strong>
											<span class="block truncate text-xs text-muted-foreground">
												{person.mos || 'No MOS'} • {person.groupName || 'No Group'} • {person.dutyRole ||
													'No Duty Role'}
											</span>
										</div>
										<Button
											variant="ghost"
											size="icon-sm"
											type="button"
											aria-label={`Remove ${soldierLabel(person)} from exclusions`}
											onclick={() => removeExemption(person.id)}
										>
											<X size={16} aria-hidden="true" />
										</Button>
									</div>
								{/each}
							{:else}
								<p class="text-sm text-muted-foreground">No Soldiers are excluded from this duty.</p>
							{/if}
						</div>
						{#each settingsExemptPersonnelIds as personnelId (personnelId)}
							<input type="hidden" name="exemptPersonnelIds" value={personnelId} />
						{/each}
					{/if}
				</section>

				<section class="grid gap-4 border-t border-border pt-6" aria-labelledby="baseline-heading">
					<div class="flex items-center gap-3">
						<span
							class="inline-flex h-6 min-w-8 items-center justify-center rounded-md border border-border bg-muted px-2 font-mono text-[0.7rem] font-medium text-muted-foreground"
							>04</span
						>
						<h4 id="baseline-heading" class="text-sm font-semibold text-foreground">DA6 Continuity</h4>
					</div>
					<p class="text-xs text-muted-foreground">Adjust starting duty counts for these Soldiers for the next run.</p>
					{#if baselineLocked}
						<WarningSummary
							tone="warning"
							title="Baseline is locked"
							description="This template already has accepted history, so future previews use the accepted runs for DA6 continuity."
						/>
					{/if}
					{#if templateSettings.baselineRows.length === 0}
						<div class="grid place-items-center gap-2 px-5 py-8 text-center text-sm text-muted-foreground">
							No baseline rows are available until the non-exempt pool has members.
						</div>
					{:else}
						<div class="flex flex-wrap items-end gap-3" aria-label="DA6 baseline table tools">
							<Field.Root class="w-56">
								<Field.Label for="settings-baseline-search">Search baseline</Field.Label>
								<Input
									id="settings-baseline-search"
									type="search"
									placeholder="Name, rank, MOS, group, count"
									bind:value={baselineQuery}
								/>
							</Field.Root>
							<Field.Root orientation="horizontal" class="flex items-center gap-2">
								<Switch id="settings-show-baseline-counts-only" bind:checked={showBaselineCountsOnly} />
								<Field.Label for="settings-show-baseline-counts-only">Show counted only</Field.Label>
							</Field.Root>
							<p class="text-xs text-muted-foreground">
								Showing {visibleBaselineRows.length} of {filteredBaselineRows.length}
								matching Soldiers
							</p>
						</div>
						<div class="overflow-x-auto rounded-md border border-border">
							<div class="min-w-[40rem]" role="table" aria-label="Manual DA6 baseline">
								<div
									class="grid grid-cols-[5rem_minmax(10rem,1fr)_5rem_minmax(8rem,1fr)_6rem] items-center border-b border-border bg-muted/50 font-mono text-xs font-bold uppercase tracking-[0.1em] text-muted-foreground"
									role="row"
								>
									<span class="px-3 py-2" role="columnheader">Rank</span>
									<span class="px-3 py-2" role="columnheader">Name</span>
									<span class="px-3 py-2" role="columnheader">MOS</span>
									<span class="px-3 py-2" role="columnheader">Group</span>
									<span class="px-3 py-2" role="columnheader">Count</span>
								</div>
								{#each visibleBaselineRows as row (row.personnel.id)}
									<div
										class="grid grid-cols-[5rem_minmax(10rem,1fr)_5rem_minmax(8rem,1fr)_6rem] items-center border-b border-border text-sm last:border-b-0"
										role="row"
									>
										<span class="px-3 py-2 font-mono text-xs" role="cell">{row.personnel.rank}</span>
										<span class="px-3 py-2" role="cell">{row.personnel.lastName}, {row.personnel.firstName}</span>
										<span class="px-3 py-2 font-mono text-xs" role="cell">{row.personnel.mos || '-'}</span>
										<span class="px-3 py-2 text-muted-foreground" role="cell"
											>{row.personnel.groupName || 'No Group'}</span
										>
										<span class="px-3 py-2" role="cell">
											{#if baselineLocked}
												<span class="font-mono text-xs font-semibold text-foreground"
													>{settingsBaselineCounts[row.personnel.id] || '0'}</span
												>
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
													placeholder="0"
													class="h-8 w-16"
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
									<div class="px-4 py-6 text-center text-sm text-muted-foreground">
										No baseline rows match the current table view.
									</div>
								{/if}
							</div>
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

				<div
					class="sticky bottom-0 z-10 flex items-center justify-between gap-4 border-t border-border bg-background px-4 py-3"
					aria-label="Settings save actions"
				>
					<span class="text-xs text-muted-foreground">Future runs only</span>
					<div class="flex items-center gap-2">
						<Button
							variant="outline"
							href={`${settings.basePath}/${selectedTemplate.slug}/generate`}
							aria-label="Discard from sticky bar">Discard</Button
						>
						<Button type="submit" aria-label="Save settings from sticky bar">Save settings</Button>
					</div>
				</div>
			</div>

			<aside class="grid content-start gap-5 border-l border-border bg-muted/20 p-5" aria-label="Template summary">
				<section class="grid gap-3 rounded-md border border-border bg-card p-4">
					<h3 class="flex items-center gap-2 text-sm font-semibold text-foreground">
						<UsersRound size={18} aria-hidden="true" /> Template Summary
					</h3>
					<dl class="grid gap-2">
						<div class="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3">
							<dt class="text-xs text-muted-foreground">Pool</dt>
							<dd class="text-right font-mono text-xs font-bold text-foreground">
								{selectedTemplate.shortCode ?? selectedTemplate.name}
							</dd>
						</div>
						<div class="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3">
							<dt class="text-xs text-muted-foreground">Total Soldiers</dt>
							<dd class="text-right font-mono text-xs font-bold text-foreground">
								{templateSettings.personnel.length}
							</dd>
						</div>
						<div class="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3">
							<dt class="text-xs text-muted-foreground">Eligible</dt>
							<dd class="text-right font-mono text-xs font-bold text-foreground">{eligibleCount}</dd>
						</div>
						<div class="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3">
							<dt class="text-xs text-muted-foreground">Excluded</dt>
							<dd class="text-right font-mono text-xs font-bold text-foreground">
								{settingsExemptPersonnelIds.length}
							</dd>
						</div>
						<div class="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3">
							<dt class="text-xs text-muted-foreground">Last Updated</dt>
							<dd class="text-right font-mono text-xs font-bold text-foreground">
								{formatDateTime(selectedTemplate.updatedAt)}
							</dd>
						</div>
					</dl>
				</section>

				{#if latestAcceptedRun}
					<section class="grid gap-3 rounded-md border border-border bg-card p-4">
						<h3 class="flex items-center gap-2 text-sm font-semibold text-foreground">
							<CalendarDays size={18} aria-hidden="true" /> Latest Accepted Run
						</h3>
						<dl class="grid gap-2">
							<div class="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3">
								<dt class="text-xs text-muted-foreground">Date Range</dt>
								<dd class="text-right font-mono text-xs font-bold text-foreground">
									{formatDate(latestAcceptedRun.startDate)} to {formatDate(latestAcceptedRun.endDate)}
								</dd>
							</div>
							<div class="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3">
								<dt class="text-xs text-muted-foreground">Applied On</dt>
								<dd class="text-right font-mono text-xs font-bold text-foreground">
									{formatDateTime(latestAcceptedRun.appliedAt)}
								</dd>
							</div>
							<div class="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3">
								<dt class="text-xs text-muted-foreground">Accepted By</dt>
								<dd class="text-right font-mono text-xs font-bold text-foreground">
									{latestAcceptedRun.acceptedByDisplayName ?? '-'}
								</dd>
							</div>
							<div class="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3">
								<dt class="text-xs text-muted-foreground">Run ID</dt>
								<dd class="text-right font-mono text-xs font-bold text-foreground" style="overflow-wrap: anywhere;">
									{latestAcceptedRun.id}
								</dd>
							</div>
						</dl>
					</section>
				{/if}

				<section class="grid gap-3 rounded-md border border-border bg-card p-4">
					<h3 class="flex items-center gap-2 text-sm font-semibold text-foreground">
						<Zap size={18} aria-hidden="true" /> Quick Actions
					</h3>
					<div class="grid gap-2">
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
	<div class="grid place-items-center gap-2 px-5 py-12 text-center text-sm text-muted-foreground">
		Loading template settings...
	</div>
{/if}
