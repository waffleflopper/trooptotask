<script lang="ts">
	import * as Stepper from '$lib/components/ui/stepper';
	import * as OperationalMatrix from '$lib/components/ui/operational-matrix';
	import { DataTable, useDataTable, type ColumnDef } from '$lib/components/ui/data-table';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import MultiTagSelect from '$lib/components/ui/MultiTagSelect.svelte';
	import { WarningSummary } from '$features/duty-roster/components/shared';
	import { slugifyDutyRosterTemplateName } from '$features/duty-roster/templates/dutyRosterTemplates';
	import {
		groupOptionItems,
		optionItems,
		type DutyRosterWorkspaceActionForm,
		type DutyRosterWorkspaceReadModel
	} from '$features/duty-roster/workspace/dutyRosterWorkspaceReadModel';

	type SetupStep = 'general' | 'pool' | 'baseline' | 'review';
	type PersonnelRow = DutyRosterWorkspaceReadModel['setupPersonnel'][number];

	let {
		basePath,
		createWizardAction,
		actionForm,
		rankOptions,
		groupOptions,
		mosOptions,
		dutyRoleOptions,
		setupPersonnel,
		newTemplateStep = $bindable(),
		newTemplateName = $bindable(),
		newTemplateSlug = $bindable(),
		newTemplateShortCode = $bindable(),
		rankFilterValues = $bindable(),
		groupFilterValues = $bindable(),
		mosFilterValues = $bindable(),
		dutyRoleFilterValues = $bindable(),
		wizardExemptPersonnelIds = $bindable(),
		wizardBaselineCounts = $bindable()
	}: {
		basePath: string;
		createWizardAction: string;
		actionForm: DutyRosterWorkspaceActionForm | null;
		rankOptions: string[];
		groupOptions: Array<{ id: string; label: string }>;
		mosOptions: string[];
		dutyRoleOptions: string[];
		setupPersonnel: DutyRosterWorkspaceReadModel['setupPersonnel'];
		newTemplateStep: SetupStep;
		newTemplateName: string;
		newTemplateSlug: string;
		newTemplateShortCode: string;
		rankFilterValues: string[];
		groupFilterValues: string[];
		mosFilterValues: string[];
		dutyRoleFilterValues: string[];
		wizardExemptPersonnelIds: string[];
		wizardBaselineCounts: Record<string, string>;
	} = $props();

	let wizardExemptionQuery = $state('');

	const MAX_EXEMPTION_PICKER_ROWS = 100;

	const stepperSteps: Stepper.StepperStep[] = [
		{ value: 'general', label: 'Basics', description: 'Identity' },
		{ value: 'pool', label: 'Pool', description: 'Eligible Soldiers' },
		{ value: 'baseline', label: 'Baseline', description: 'Starting counts' },
		{ value: 'review', label: 'Review', description: 'Confirm' }
	];

	const rankFilterSet = $derived(new Set(rankFilterValues));
	const groupFilterSet = $derived(new Set(groupFilterValues));
	const mosFilterSet = $derived(new Set(mosFilterValues));
	const dutyRoleFilterSet = $derived(new Set(dutyRoleFilterValues));
	const wizardExemptPersonnelIdSet = $derived(new Set(wizardExemptPersonnelIds));

	const wizardResolvedPool = $derived(
		setupPersonnel.filter((person) => {
			if (rankFilterSet.size > 0 && !rankFilterSet.has(person.rank)) return false;
			if (groupFilterSet.size > 0 && (!person.groupId || !groupFilterSet.has(person.groupId))) {
				return false;
			}
			if (mosFilterSet.size > 0 && !mosFilterSet.has(person.mos ?? '')) return false;
			if (dutyRoleFilterSet.size > 0 && !dutyRoleFilterSet.has(person.dutyRole ?? '')) return false;
			return true;
		})
	);

	const filteredWizardExemptionRows = $derived(
		wizardResolvedPool.filter((person) => matchesPersonnelQuery(person, wizardExemptionQuery))
	);
	const visibleWizardExemptionRows = $derived(filteredWizardExemptionRows.slice(0, MAX_EXEMPTION_PICKER_ROWS));
	const wizardExemptPersonnel = $derived(
		wizardResolvedPool.filter((person) => wizardExemptPersonnelIdSet.has(person.id))
	);
	const wizardBaselineRows = $derived(
		wizardResolvedPool.filter((person) => !wizardExemptPersonnelIdSet.has(person.id))
	);
	const templateSlug = $derived(newTemplateSlug || slugifyDutyRosterTemplateName(newTemplateName));
	const routePreview = $derived(`${basePath}/${templateSlug}/generate`);

	const poolColumns: ColumnDef<PersonnelRow>[] = [
		{ key: 'rank', header: 'Rank', value: (row) => row.rank || 'No rank', width: '5rem' },
		{ key: 'name', header: 'Name', value: (row) => `${row.lastName}, ${row.firstName}` },
		{ key: 'group', header: 'Group', value: (row) => row.groupName || 'No Group' },
		{ key: 'mos', header: 'MOS', value: (row) => row.mos || 'No MOS', width: '6rem' },
		{ key: 'dutyRole', header: 'Duty Role', value: (row) => row.dutyRole || 'No Duty Role' },
		{ key: 'eligible', header: 'Eligible', value: () => 'Yes', sortable: false, width: '5rem' }
	];

	const poolTable = useDataTable<PersonnelRow>({
		data: () => wizardResolvedPool,
		columns: poolColumns,
		pageSize: 10,
		rowKey: (row) => row.id
	});

	const baselineMatrixRows = $derived(
		wizardBaselineRows.map((person) => ({
			id: person.id,
			label: `${person.rank} ${person.lastName}, ${person.firstName}`,
			meta: { person }
		}))
	);

	const baselineMatrixColumns: OperationalMatrix.OperationalMatrixColumn[] = [{ id: 'count', label: 'Starting Count' }];

	function clearFilters() {
		rankFilterValues = [];
		groupFilterValues = [];
		mosFilterValues = [];
		dutyRoleFilterValues = [];
		wizardExemptPersonnelIds = [];
	}

	function removeExemption(personnelId: string) {
		wizardExemptPersonnelIds = wizardExemptPersonnelIds.filter((id) => id !== personnelId);
	}

	function setBaselineCount(personnelId: string, value: string) {
		wizardBaselineCounts = {
			...wizardBaselineCounts,
			[personnelId]: value
		};
	}

	function matchesPersonnelQuery(
		person: { rank: string; lastName: string; firstName: string; mos?: string | null; groupName?: string | null },
		query: string
	): boolean {
		const normalizedQuery = query.trim().toLowerCase();
		if (!normalizedQuery) return true;

		return [person.rank, person.lastName, person.firstName, person.mos ?? '', person.groupName ?? 'No Group']
			.join(' ')
			.toLowerCase()
			.includes(normalizedQuery);
	}

	function handleStepChange(value: string) {
		newTemplateStep = value as SetupStep;
	}
</script>

{#snippet poolCellSnippet(row: PersonnelRow, column: ColumnDef<PersonnelRow>)}
	{#if column.key === 'eligible'}
		<Badge variant="success">Yes</Badge>
	{:else}
		{String(column.value(row) ?? '')}
	{/if}
{/snippet}

<section class="grid gap-6" aria-labelledby="new-template-heading">
	<h2 id="new-template-heading" class="sr-only">New Duty Roster Template</h2>

	{#if actionForm?.settingsError}
		<WarningSummary tone="destructive" title={actionForm.settingsError} />
	{/if}

	<form class="new-template-form grid gap-6" method="POST" action={createWizardAction}>
		<Stepper.Root steps={stepperSteps} value={newTemplateStep} onValueChange={handleStepChange}>
			<Stepper.List aria-label="New Template steps" class="border-b border-border pb-4">
				{#each stepperSteps as step (step.value)}
					<Stepper.Item value={step.value} />
				{/each}
			</Stepper.List>

			<div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,20rem)]">
				<!-- Main content area -->
				<div class="min-w-0">
					<Stepper.Content value="general" class="border-0 bg-transparent p-0 shadow-none">
						<div class="grid gap-6">
							<header>
								<h3 class="font-display text-xl font-bold uppercase tracking-wide text-foreground">Template basics</h3>
							</header>
							<div class="grid gap-5 sm:grid-cols-2">
								<div class="grid gap-2">
									<Label for="template-name" class="font-mono text-xs font-semibold uppercase tracking-[0.08em]">
										Template name <span class="text-destructive" aria-hidden="true">*</span>
									</Label>
									<p class="text-sm text-muted-foreground">Display name for this duty roster template.</p>
									<Input
										id="template-name"
										name="name"
										aria-label="Template name"
										maxlength={120}
										required
										bind:value={newTemplateName}
										onblur={() => {
											if (!newTemplateSlug) newTemplateSlug = slugifyDutyRosterTemplateName(newTemplateName);
										}}
										placeholder="CQ Runner"
									/>
								</div>
								<div class="grid gap-2">
									<Label for="template-slug" class="font-mono text-xs font-semibold uppercase tracking-[0.08em]">
										Route slug <span class="text-destructive" aria-hidden="true">*</span>
									</Label>
									<p class="text-sm text-muted-foreground">URL-friendly identifier used in links and routes.</p>
									<Input
										id="template-slug"
										name="slug"
										aria-label="Route slug"
										maxlength={72}
										required
										bind:value={newTemplateSlug}
										placeholder="cq-runner"
									/>
								</div>
								<div class="grid gap-2">
									<Label for="template-short-code" class="font-mono text-xs font-semibold uppercase tracking-[0.08em]">
										Short code
									</Label>
									<p class="text-sm text-muted-foreground">Compact label used in dense views and exports.</p>
									<Input
										id="template-short-code"
										name="shortCode"
										aria-label="Short code"
										maxlength={12}
										class="max-w-32"
										bind:value={newTemplateShortCode}
										placeholder="CQ"
									/>
								</div>
							</div>
							<div
								class="flex items-center justify-between gap-4 rounded-md border border-border bg-muted/25 px-4 py-3"
							>
								<div>
									<h4 class="text-sm font-medium text-foreground">Route preview</h4>
									<p class="text-sm text-muted-foreground">This is how users will access this template.</p>
								</div>
								<output class="rounded bg-muted px-3 py-1.5 font-mono text-xs font-medium text-foreground">
									{routePreview}
								</output>
							</div>
						</div>
					</Stepper.Content>

					<Stepper.Content value="pool" class="border-0 bg-transparent p-0 shadow-none">
						<div class="grid gap-6">
							<section>
								<header class="mb-4 flex items-start justify-between gap-4">
									<div>
										<h3 class="font-display text-xl font-bold uppercase tracking-wide text-foreground">
											Pool criteria
										</h3>
										<p class="mt-1 text-sm text-muted-foreground">OR within each category. AND across categories.</p>
									</div>
									<Button variant="outline" size="sm" type="button" onclick={clearFilters}>Clear all</Button>
								</header>
								<div class="grid gap-4 sm:grid-cols-2">
									<div class="grid gap-2">
										<Label class="font-mono text-xs font-semibold uppercase tracking-[0.08em]">Rank</Label>
										<MultiTagSelect
											options={optionItems(rankOptions)}
											value={rankFilterValues}
											ariaLabel="New Template rank filters"
											placeholder="Any rank"
											onChange={(values) => (rankFilterValues = values)}
										/>
									</div>
									<div class="grid gap-2">
										<Label class="font-mono text-xs font-semibold uppercase tracking-[0.08em]">Group</Label>
										<MultiTagSelect
											options={groupOptionItems(groupOptions)}
											value={groupFilterValues}
											ariaLabel="New Template group filters"
											placeholder="Any group"
											onChange={(values) => (groupFilterValues = values)}
										/>
									</div>
									<div class="grid gap-2">
										<Label class="font-mono text-xs font-semibold uppercase tracking-[0.08em]">MOS</Label>
										<MultiTagSelect
											options={optionItems(mosOptions)}
											value={mosFilterValues}
											ariaLabel="New Template MOS filters"
											placeholder="Any MOS"
											onChange={(values) => (mosFilterValues = values)}
										/>
									</div>
									<div class="grid gap-2">
										<Label class="font-mono text-xs font-semibold uppercase tracking-[0.08em]">Duty Role</Label>
										<MultiTagSelect
											options={optionItems(dutyRoleOptions)}
											value={dutyRoleFilterValues}
											ariaLabel="New Template Duty Role filters"
											placeholder="Any duty role"
											onChange={(values) => (dutyRoleFilterValues = values)}
										/>
									</div>
								</div>
							</section>

							<section>
								<header class="mb-3 flex items-center justify-between gap-4">
									<div>
										<h3 class="font-display text-lg font-bold uppercase tracking-wide text-foreground">
											Resolved pool
										</h3>
										<p class="mt-0.5 text-sm text-muted-foreground">
											{wizardResolvedPool.length}
											{wizardResolvedPool.length === 1 ? 'Soldier' : 'Soldiers'} match the current criteria.
										</p>
									</div>
								</header>
								<DataTable
									table={poolTable}
									ariaLabel="New Template resolved pool"
									emptyMessage="No Soldiers match the current pool filters."
									density="dense"
									stickyHeader
									cell={poolCellSnippet}
								/>
							</section>
						</div>
					</Stepper.Content>

					<Stepper.Content value="baseline" class="border-0 bg-transparent p-0 shadow-none">
						<div class="grid gap-5">
							<header>
								<h3 class="font-display text-xl font-bold uppercase tracking-wide text-foreground">
									Manual DA6 baseline
								</h3>
								<p class="mt-1 text-sm text-muted-foreground">
									Optional starting counts. Leave blank to start from zero for that Soldier.
								</p>
							</header>
							{#if wizardBaselineRows.length === 0}
								<div
									class="rounded-md border border-border bg-muted/25 px-4 py-8 text-center text-sm text-muted-foreground"
								>
									No baseline rows are available until the non-exempt pool has members.
								</div>
							{:else}
								<OperationalMatrix.Root
									rows={baselineMatrixRows}
									columns={baselineMatrixColumns}
									class="grid min-h-0 gap-2"
								>
									<OperationalMatrix.Viewport
										ariaLabel="DA6 baseline matrix"
										class="max-h-[28rem] rounded-md border border-border bg-card"
									>
										<OperationalMatrix.Table
											ariaLabel="DA6 baseline counts"
											class="w-full table-fixed text-sm [&_[data-matrix-column-header]]:border-b [&_[data-matrix-column-header]]:border-border [&_[data-matrix-column-header]]:bg-muted/50 [&_[data-matrix-column-header]]:font-mono [&_[data-matrix-column-header]]:text-xs [&_[data-matrix-column-header]]:font-semibold [&_[data-matrix-column-header]]:uppercase [&_[data-matrix-column-header]]:tracking-[0.08em] [&_[data-matrix-cell]]:border-b [&_[data-matrix-cell]]:border-border [&_[data-matrix-cell]]:p-0"
										>
											<OperationalMatrix.Header>
												<OperationalMatrix.HeaderRow>
													<OperationalMatrix.CornerCell
														sticky
														class="sticky left-0 top-0 z-30 w-64 min-w-48 border-b border-border bg-muted/50 px-3 py-2 text-left font-mono text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground"
													>
														Soldier
													</OperationalMatrix.CornerCell>
													{#each baselineMatrixColumns as column (column.id)}
														<OperationalMatrix.ColumnHeader
															{column}
															sticky
															class="sticky top-0 z-20 w-36 min-w-28 border-b border-border bg-muted/50 px-3 py-2 text-center text-muted-foreground"
														/>
													{/each}
												</OperationalMatrix.HeaderRow>
											</OperationalMatrix.Header>
											<OperationalMatrix.Body>
												{#each baselineMatrixRows as row (row.id)}
													<OperationalMatrix.Row {row} class="hover:bg-muted/20">
														<OperationalMatrix.RowHeader
															{row}
															sticky
															class="sticky left-0 z-10 w-64 min-w-48 border-b border-border bg-card px-3 py-2 text-left text-sm font-medium text-foreground"
														>
															{row.label}
														</OperationalMatrix.RowHeader>
														{#each baselineMatrixColumns as column (column.id)}
															<OperationalMatrix.Cell {row} {column} class="w-36 min-w-28 px-3 py-1.5">
																<Input
																	type="number"
																	min={0}
																	step={1}
																	name={`baseline:${row.id}`}
																	aria-label={`Starting count for ${row.label}`}
																	class="h-8 w-full text-center"
																	placeholder="0"
																	value={wizardBaselineCounts[row.id] ?? ''}
																	oninput={(event) => setBaselineCount(row.id, event.currentTarget.value)}
																/>
															</OperationalMatrix.Cell>
														{/each}
													</OperationalMatrix.Row>
												{/each}
											</OperationalMatrix.Body>
										</OperationalMatrix.Table>
									</OperationalMatrix.Viewport>
								</OperationalMatrix.Root>
							{/if}
						</div>
					</Stepper.Content>

					<Stepper.Content value="review" class="border-0 bg-transparent p-0 shadow-none">
						<div class="grid gap-5">
							<header>
								<h3 class="font-display text-xl font-bold uppercase tracking-wide text-foreground">Review</h3>
								<p class="mt-1 text-sm text-muted-foreground">
									Create this duty roster template with the current identity, pool, exemptions, and baseline counts.
								</p>
							</header>
							<dl class="grid gap-px overflow-hidden rounded-md border border-border bg-border">
								<div class="flex items-center justify-between bg-card px-4 py-3">
									<dt class="text-sm text-muted-foreground">Name</dt>
									<dd class="font-mono text-sm font-medium text-foreground">{newTemplateName || 'Not set'}</dd>
								</div>
								<div class="flex items-center justify-between bg-card px-4 py-3">
									<dt class="text-sm text-muted-foreground">Slug</dt>
									<dd class="font-mono text-sm font-medium text-foreground">{templateSlug}</dd>
								</div>
								<div class="flex items-center justify-between bg-card px-4 py-3">
									<dt class="text-sm text-muted-foreground">Short code</dt>
									<dd class="font-mono text-sm font-medium text-foreground">{newTemplateShortCode || 'Not set'}</dd>
								</div>
								<div class="flex items-center justify-between bg-card px-4 py-3">
									<dt class="text-sm text-muted-foreground">Pool</dt>
									<dd class="font-mono text-sm font-medium text-foreground">
										{wizardResolvedPool.length}
										{wizardResolvedPool.length === 1 ? 'Soldier' : 'Soldiers'}
									</dd>
								</div>
								<div class="flex items-center justify-between bg-card px-4 py-3">
									<dt class="text-sm text-muted-foreground">Exemptions</dt>
									<dd class="font-mono text-sm font-medium text-foreground">{wizardExemptPersonnel.length}</dd>
								</div>
								<div class="flex items-center justify-between bg-card px-4 py-3">
									<dt class="text-sm text-muted-foreground">Baseline rows</dt>
									<dd class="font-mono text-sm font-medium text-foreground">{wizardBaselineRows.length}</dd>
								</div>
								<div class="flex items-center justify-between bg-card px-4 py-3">
									<dt class="text-sm text-muted-foreground">Entered baselines</dt>
									<dd class="font-mono text-sm font-medium text-foreground">
										{Object.values(wizardBaselineCounts).filter((value) => value.trim()).length}
									</dd>
								</div>
							</dl>
						</div>
					</Stepper.Content>
				</div>

				<!-- Side panel -->
				<aside
					class="grid content-start gap-5 rounded-md border border-border bg-muted/15 p-5"
					aria-label="Step guidance"
				>
					{#if newTemplateStep === 'general'}
						<section class="grid gap-2">
							<h4 class="font-display text-base font-bold uppercase tracking-wide text-foreground">
								What this template represents
							</h4>
							<p class="text-sm leading-relaxed text-muted-foreground">
								A duty roster template defines the people, rules, and schedule for one duty. It becomes the source for
								generated rosters and histories.
							</p>
						</section>
						<section class="grid gap-2 border-t border-border pt-4">
							<h4 class="font-display text-base font-bold uppercase tracking-wide text-foreground">URL + slug rules</h4>
							<ul class="grid gap-1 pl-4 text-sm leading-relaxed text-muted-foreground">
								<li>Use lowercase letters, numbers, and hyphens.</li>
								<li>Start and end with a letter or number.</li>
								<li>Keep the slug unique inside this Organization.</li>
							</ul>
						</section>
						<section class="grid gap-3 border-t border-border pt-4">
							<h4 class="font-mono text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
								Template summary
							</h4>
							<dl class="grid gap-2 text-sm">
								<div class="flex items-center justify-between gap-3">
									<dt class="text-muted-foreground">Name</dt>
									<dd class="font-mono text-xs font-medium text-foreground">{newTemplateName || 'Not set'}</dd>
								</div>
								<div class="flex items-center justify-between gap-3">
									<dt class="text-muted-foreground">Slug</dt>
									<dd class="font-mono text-xs font-medium text-foreground">{templateSlug}</dd>
								</div>
								<div class="flex items-center justify-between gap-3">
									<dt class="text-muted-foreground">Code</dt>
									<dd class="font-mono text-xs font-medium text-foreground">{newTemplateShortCode || 'None'}</dd>
								</div>
							</dl>
						</section>
					{:else if newTemplateStep === 'pool'}
						<section class="grid gap-2">
							<div class="flex items-center justify-between gap-3">
								<h4 class="font-display text-base font-bold uppercase tracking-wide text-foreground">
									Duty-specific exemptions
								</h4>
								<Badge variant="secondary">{wizardExemptPersonnel.length} selected</Badge>
							</div>
							<p class="text-sm leading-relaxed text-muted-foreground">
								Select Soldiers to exclude from this template after the pool has resolved.
							</p>
						</section>
						{#if wizardResolvedPool.length === 0}
							<p class="text-sm text-muted-foreground">Exemptions can only be selected from the resolved pool.</p>
						{:else}
							<div class="grid gap-3 border-t border-border pt-4">
								<Label for="exemption-search" class="font-mono text-xs font-semibold uppercase tracking-[0.08em]">
									Search pool
								</Label>
								<Input
									id="exemption-search"
									type="search"
									placeholder="Name, rank, MOS, group"
									bind:value={wizardExemptionQuery}
								/>
							</div>
							<div class="max-h-64 overflow-y-auto rounded-md border border-border">
								{#each visibleWizardExemptionRows as person (person.id)}
									<label
										class="flex cursor-pointer items-center gap-3 border-b border-border px-3 py-2 text-sm hover:bg-muted/30 last:border-b-0"
									>
										<Checkbox
											checked={wizardExemptPersonnelIdSet.has(person.id)}
											onCheckedChange={(checked) => {
												wizardExemptPersonnelIds = checked
													? [...wizardExemptPersonnelIds, person.id]
													: wizardExemptPersonnelIds.filter((id) => id !== person.id);
											}}
										/>
										<span class="text-foreground">{person.rank} {person.lastName}, {person.firstName}</span>
									</label>
								{/each}
							</div>
							<p class="text-xs text-muted-foreground" aria-live="polite">
								Showing {visibleWizardExemptionRows.length} of {filteredWizardExemptionRows.length} matching Soldiers. Search
								to narrow large pools.
							</p>
						{/if}
						<section class="grid grid-cols-3 gap-3 border-t border-border pt-4">
							<div class="grid gap-1 text-center">
								<span class="font-mono text-lg font-bold text-foreground">{wizardResolvedPool.length}</span>
								<span class="text-xs text-muted-foreground">Total eligible</span>
							</div>
							<div class="grid gap-1 text-center">
								<span class="font-mono text-lg font-bold text-foreground">{wizardExemptPersonnel.length}</span>
								<span class="text-xs text-muted-foreground">Exempted</span>
							</div>
							<div class="grid gap-1 text-center">
								<span class="font-mono text-lg font-bold text-foreground">{wizardBaselineRows.length}</span>
								<span class="text-xs text-muted-foreground">Baseline available</span>
							</div>
						</section>
					{:else if newTemplateStep === 'baseline'}
						<section class="grid gap-2">
							<h4 class="font-display text-base font-bold uppercase tracking-wide text-foreground">Baseline rules</h4>
							<p class="text-sm leading-relaxed text-muted-foreground">
								Manual DA6 baseline counts are setup data for the first generated run. People exempted from the pool are
								not included here.
							</p>
						</section>
						<section class="grid grid-cols-2 gap-3 border-t border-border pt-4">
							<div class="grid gap-1 text-center">
								<span class="font-mono text-lg font-bold text-foreground">{wizardBaselineRows.length}</span>
								<span class="text-xs text-muted-foreground">Rows available</span>
							</div>
							<div class="grid gap-1 text-center">
								<span class="font-mono text-lg font-bold text-foreground">{wizardExemptPersonnel.length}</span>
								<span class="text-xs text-muted-foreground">Excluded first</span>
							</div>
						</section>
					{:else}
						<section class="grid gap-2">
							<h4 class="font-display text-base font-bold uppercase tracking-wide text-foreground">Ready to create</h4>
							<p class="text-sm leading-relaxed text-muted-foreground">
								You can review and change these details from Template Settings after creation.
							</p>
						</section>
						{#if wizardExemptPersonnel.length > 0}
							<section class="grid gap-3 border-t border-border pt-4">
								<div class="flex items-center justify-between gap-3">
									<h4 class="font-mono text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
										Exempted Soldiers
									</h4>
									<Button variant="link" size="sm" type="button" onclick={() => (wizardExemptPersonnelIds = [])}>
										Remove all
									</Button>
								</div>
								<div class="grid gap-1">
									{#each wizardExemptPersonnel as person (person.id)}
										<span
											class="flex items-center justify-between gap-2 rounded px-2 py-1 text-sm text-foreground hover:bg-muted/30"
										>
											<span>{person.rank} {person.lastName}, {person.firstName}</span>
											<Button
												variant="ghost"
												size="sm"
												type="button"
												class="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
												aria-label={`Remove ${person.rank} ${person.lastName}, ${person.firstName}`}
												onclick={() => removeExemption(person.id)}
											>
												&times;
											</Button>
										</span>
									{/each}
								</div>
							</section>
						{/if}
					{/if}
				</aside>
			</div>

			<!-- Hidden form inputs -->
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
			{#each wizardExemptPersonnelIds as value (value)}
				<input type="hidden" name="exemptPersonnelIds" {value} />
			{/each}
			{#if newTemplateStep !== 'general'}
				<input type="hidden" name="name" value={newTemplateName} />
				<input type="hidden" name="slug" value={templateSlug} />
				<input type="hidden" name="shortCode" value={newTemplateShortCode} />
			{/if}
			{#if newTemplateStep !== 'baseline'}
				{#each Object.entries(wizardBaselineCounts).filter( ([, value]) => value.trim() ) as [personnelId, value] (personnelId)}
					<input type="hidden" name={`baseline:${personnelId}`} {value} />
				{/each}
			{/if}

			<!-- Navigation actions -->
			<div class="flex items-center justify-between border-t border-border pt-4">
				<Stepper.Previous class="gap-2">Back</Stepper.Previous>
				<div class="flex items-center gap-3">
					<Button variant="outline" href={basePath}>Cancel</Button>
					{#if newTemplateStep !== 'review'}
						<Stepper.Next class="gap-2">Continue</Stepper.Next>
					{:else}
						<Button type="submit">Save Template</Button>
					{/if}
				</div>
			</div>
		</Stepper.Root>
	</form>
</section>
