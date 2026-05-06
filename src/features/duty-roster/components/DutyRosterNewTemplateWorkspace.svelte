<script lang="ts">
	import MultiTagSelect from '$lib/components/ui/MultiTagSelect.svelte';
	import { slugifyDutyRosterTemplateName } from '$features/duty-roster/templates/dutyRosterTemplates';
	import {
		groupOptionItems,
		optionItems,
		type DutyRosterWorkspaceActionForm,
		type DutyRosterWorkspaceReadModel
	} from '$features/duty-roster/workspace/dutyRosterWorkspaceReadModel';

	type SetupStep = 'general' | 'pool' | 'baseline' | 'review';

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

	const MAX_RESOLVED_POOL_PREVIEW_ROWS = 10;
	const MAX_EXEMPTION_PICKER_ROWS = 100;

	const setupSteps: Array<{ id: SetupStep; label: string; note: string }> = [
		{ id: 'general', label: 'Basics', note: 'Identity' },
		{ id: 'pool', label: 'Pool', note: 'Eligible Soldiers' },
		{ id: 'baseline', label: 'Baseline', note: 'Starting counts' },
		{ id: 'review', label: 'Review', note: 'Confirm' }
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
	const wizardResolvedPoolPreviewRows = $derived(wizardResolvedPool.slice(0, MAX_RESOLVED_POOL_PREVIEW_ROWS));
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
	const selectedStepIndex = $derived(setupSteps.findIndex((step) => step.id === newTemplateStep));

	function previousStep(step: SetupStep): SetupStep {
		return step === 'review' ? 'baseline' : step === 'baseline' ? 'pool' : 'general';
	}

	function nextStep(step: SetupStep): SetupStep {
		return step === 'general' ? 'pool' : step === 'pool' ? 'baseline' : 'review';
	}

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
</script>

<section class="new-template-workspace" aria-labelledby="new-template-heading">
	<h2 id="new-template-heading" class="sr-only">New Duty Roster Template</h2>

	{#if actionForm?.settingsError}
		<p class="form-error settings-error" role="alert">{actionForm.settingsError}</p>
	{/if}

	<form class="settings-form wizard-form new-template-form" method="POST" action={createWizardAction}>
		<nav class="wizard-stepper" aria-label="New Template steps">
			{#each setupSteps as step, index (step.id)}
				<button
					type="button"
					class:active={newTemplateStep === step.id}
					class:complete={index < selectedStepIndex}
					onclick={() => (newTemplateStep = step.id)}
				>
					<span class="wizard-stepper__number">{index < selectedStepIndex ? '✓' : index + 1}</span>
					<span>
						<strong>{step.label}</strong>
						<small>{step.note}</small>
					</span>
				</button>
			{/each}
		</nav>

		<div class="new-template-shell">
			<div class="new-template-main">
				{#if newTemplateStep === 'general'}
					<section class="new-template-panel" aria-labelledby="wizard-general-heading">
						<header class="new-template-section-header">
							<h4 id="wizard-general-heading">Template basics</h4>
						</header>
						<div class="identity-ledger">
							<label>
								<span>Template name <b aria-hidden="true">*</b></span>
								<small>Display name for this duty roster template.</small>
								<input
									class="input"
									aria-label="Template name"
									name="name"
									maxlength="120"
									required
									bind:value={newTemplateName}
									onblur={() => {
										if (!newTemplateSlug) newTemplateSlug = slugifyDutyRosterTemplateName(newTemplateName);
									}}
									placeholder="CQ Runner"
								/>
							</label>
							<label>
								<span>Route slug <b aria-hidden="true">*</b></span>
								<small>URL-friendly identifier used in links and routes.</small>
								<input
									class="input"
									aria-label="Route slug"
									name="slug"
									maxlength="72"
									required
									bind:value={newTemplateSlug}
									placeholder="cq-runner"
								/>
							</label>
							<label>
								<span>Short code</span>
								<small>Compact label used in dense views and exports.</small>
								<input
									class="input short-code-input"
									aria-label="Short code"
									name="shortCode"
									maxlength="12"
									bind:value={newTemplateShortCode}
									placeholder="CQ"
								/>
							</label>
						</div>
						<div class="route-preview-row">
							<div>
								<h5>Route preview</h5>
								<p>This is how users will access this template.</p>
							</div>
							<output>{routePreview}</output>
						</div>
					</section>
				{:else if newTemplateStep === 'pool'}
					<section class="new-template-panel" aria-labelledby="wizard-pool-heading">
						<header class="new-template-section-header new-template-section-header--split">
							<div>
								<h4 id="wizard-pool-heading">Pool criteria</h4>
								<p>OR within each category. AND across categories.</p>
							</div>
							<button class="btn btn-secondary btn-sm" type="button" onclick={clearFilters}>Clear all</button>
						</header>
						<div class="criteria-grid criteria-grid--template">
							<label class="tag-field">
								<span>Rank</span>
								<MultiTagSelect
									options={optionItems(rankOptions)}
									value={rankFilterValues}
									ariaLabel="New Template rank filters"
									placeholder="Any rank"
									onChange={(values) => (rankFilterValues = values)}
								/>
							</label>
							<label class="tag-field">
								<span>Group</span>
								<MultiTagSelect
									options={groupOptionItems(groupOptions)}
									value={groupFilterValues}
									ariaLabel="New Template group filters"
									placeholder="Any group"
									onChange={(values) => (groupFilterValues = values)}
								/>
							</label>
							<label class="tag-field">
								<span>MOS</span>
								<MultiTagSelect
									options={optionItems(mosOptions)}
									value={mosFilterValues}
									ariaLabel="New Template MOS filters"
									placeholder="Any MOS"
									onChange={(values) => (mosFilterValues = values)}
								/>
							</label>
							<label class="tag-field">
								<span>Duty Role</span>
								<MultiTagSelect
									options={optionItems(dutyRoleOptions)}
									value={dutyRoleFilterValues}
									ariaLabel="New Template Duty Role filters"
									placeholder="Any duty role"
									onChange={(values) => (dutyRoleFilterValues = values)}
								/>
							</label>
						</div>
					</section>

					<section class="new-template-panel new-template-panel--table" aria-labelledby="wizard-resolved-pool-heading">
						<header class="new-template-section-header new-template-section-header--split">
							<div>
								<h4 id="wizard-resolved-pool-heading">Resolved pool</h4>
								<p>
									{wizardResolvedPool.length}
									{wizardResolvedPool.length === 1 ? 'Soldier' : 'Soldiers'} match the current criteria.
								</p>
							</div>
						</header>
						{#if wizardResolvedPool.length === 0}
							<div class="admin-empty">No Soldiers match the current pool filters.</div>
						{:else}
							<div class="pool-table pool-table--template" role="table" aria-label="New Template resolved pool">
								<div class="pool-row pool-head" role="row">
									<span role="columnheader">Rank</span>
									<span role="columnheader">Name</span>
									<span role="columnheader">Group</span>
									<span role="columnheader">MOS</span>
									<span role="columnheader">Duty Role</span>
									<span role="columnheader">Eligible</span>
								</div>
								{#each wizardResolvedPoolPreviewRows as person (person.id)}
									<div class="pool-row" role="row">
										<span role="cell">{person.rank || 'No rank'}</span>
										<span role="cell">{person.lastName}, {person.firstName}</span>
										<span role="cell">{person.groupName || 'No Group'}</span>
										<span role="cell">{person.mos || 'No MOS'}</span>
										<span role="cell">{person.dutyRole || 'No Duty Role'}</span>
										<span role="cell">
											<span class="status-chip status-chip--success">Yes</span>
										</span>
									</div>
								{/each}
							</div>
							<p class="table-count-note">
								Showing {wizardResolvedPoolPreviewRows.length} of {wizardResolvedPool.length}
							</p>
						{/if}
					</section>
				{:else if newTemplateStep === 'baseline'}
					<section class="new-template-panel new-template-panel--table" aria-labelledby="wizard-baseline-heading">
						<header class="new-template-section-header">
							<h4 id="wizard-baseline-heading">Manual DA6 baseline</h4>
							<p>Optional starting counts. Leave blank to start from zero for that Soldier.</p>
						</header>
						{#if wizardBaselineRows.length === 0}
							<div class="admin-empty">No baseline rows are available until the non-exempt pool has members.</div>
						{:else}
							<div class="baseline-table" role="table" aria-label="New Template DA6 baseline">
								<div class="baseline-row baseline-head" role="row">
									<span role="columnheader">Soldier</span>
									<span role="columnheader">Starting count</span>
									<span role="columnheader">Clear</span>
								</div>
								{#each wizardBaselineRows as person (person.id)}
									<div class="baseline-row" role="row">
										<span role="cell">{person.rank} {person.lastName}, {person.firstName}</span>
										<span role="cell">
											<input
												class="input"
												type="number"
												min="0"
												step="1"
												name={`baseline:${person.id}`}
												aria-label={`Starting count for ${person.rank} ${person.lastName}, ${person.firstName}`}
												placeholder="0"
												value={wizardBaselineCounts[person.id] ?? ''}
												oninput={(event) => setBaselineCount(person.id, event.currentTarget.value)}
											/>
										</span>
										<span role="cell" aria-hidden="true">×</span>
									</div>
								{/each}
							</div>
						{/if}
					</section>
				{:else}
					<section class="new-template-panel" aria-labelledby="wizard-review-heading">
						<header class="new-template-section-header">
							<h4 id="wizard-review-heading">Review</h4>
							<p>Create this duty roster template with the current identity, pool, exemptions, and baseline counts.</p>
						</header>
						<dl class="review-ledger">
							<div>
								<dt>Name</dt>
								<dd>{newTemplateName || 'Not set'}</dd>
							</div>
							<div>
								<dt>Slug</dt>
								<dd>{templateSlug}</dd>
							</div>
							<div>
								<dt>Short code</dt>
								<dd>{newTemplateShortCode || 'Not set'}</dd>
							</div>
							<div>
								<dt>Pool</dt>
								<dd>{wizardResolvedPool.length} {wizardResolvedPool.length === 1 ? 'Soldier' : 'Soldiers'}</dd>
							</div>
							<div>
								<dt>Exemptions</dt>
								<dd>{wizardExemptPersonnel.length}</dd>
							</div>
							<div>
								<dt>Baseline rows</dt>
								<dd>{wizardBaselineRows.length}</dd>
							</div>
							<div>
								<dt>Entered baselines</dt>
								<dd>{Object.values(wizardBaselineCounts).filter((value) => value.trim()).length}</dd>
							</div>
						</dl>
					</section>
				{/if}
			</div>

			<aside class="new-template-context" aria-label="Selected step guidance">
				{#if newTemplateStep === 'general'}
					<section>
						<h4>What this template represents</h4>
						<p>
							A duty roster template defines the people, rules, and schedule for one duty. It becomes the source for
							generated rosters and histories.
						</p>
					</section>
					<section>
						<h4>URL + slug rules</h4>
						<ul>
							<li>Use lowercase letters, numbers, and hyphens.</li>
							<li>Start and end with a letter or number.</li>
							<li>Keep the slug unique inside this Organization.</li>
						</ul>
					</section>
					<section class="template-summary-card">
						<h4>Template summary preview</h4>
						<dl>
							<div>
								<dt>Name</dt>
								<dd>{newTemplateName || 'Not set'}</dd>
							</div>
							<div>
								<dt>Slug</dt>
								<dd>{templateSlug}</dd>
							</div>
							<div>
								<dt>Code</dt>
								<dd>{newTemplateShortCode || 'None'}</dd>
							</div>
						</dl>
					</section>
				{:else if newTemplateStep === 'pool'}
					<section>
						<div class="context-heading-row">
							<h4>Duty-specific exemptions</h4>
							<span class="status-chip">{wizardExemptPersonnel.length} selected</span>
						</div>
						<p>Select Soldiers to exclude from this template after the pool has resolved.</p>
					</section>
					{#if wizardResolvedPool.length === 0}
						<p class="context-note">Exemptions can only be selected from the resolved pool.</p>
					{:else}
						<label class="settings-table-search">
							<span>Search pool</span>
							<input
								class="input"
								type="search"
								placeholder="Name, rank, MOS, group"
								bind:value={wizardExemptionQuery}
							/>
						</label>
						<div class="exemption-list">
							{#each visibleWizardExemptionRows as person (person.id)}
								<label>
									<input
										type="checkbox"
										value={person.id}
										checked={wizardExemptPersonnelIdSet.has(person.id)}
										onchange={(event) => {
											const checked = event.currentTarget.checked;
											wizardExemptPersonnelIds = checked
												? [...wizardExemptPersonnelIds, person.id]
												: wizardExemptPersonnelIds.filter((id) => id !== person.id);
										}}
									/>
									<span>{person.rank} {person.lastName}, {person.firstName}</span>
								</label>
							{/each}
						</div>
						<p class="context-note" aria-live="polite">
							Showing {visibleWizardExemptionRows.length} of {filteredWizardExemptionRows.length} matching Soldiers. Search
							to narrow large pools.
						</p>
					{/if}
					<section class="pool-summary-card">
						<h4>Pool summary</h4>
						<div>
							<strong>{wizardResolvedPool.length}</strong>
							<span>Total eligible</span>
						</div>
						<div>
							<strong>{wizardExemptPersonnel.length}</strong>
							<span>Exempted</span>
						</div>
						<div>
							<strong>{wizardBaselineRows.length}</strong>
							<span>Baseline available</span>
						</div>
					</section>
				{:else if newTemplateStep === 'baseline'}
					<section>
						<h4>Baseline rules</h4>
						<p>
							Manual DA6 baseline counts are setup data for the first generated run. People exempted from the pool are
							not included here.
						</p>
					</section>
					<section class="pool-summary-card">
						<h4>Baseline summary</h4>
						<div>
							<strong>{wizardBaselineRows.length}</strong>
							<span>Rows available</span>
						</div>
						<div>
							<strong>{wizardExemptPersonnel.length}</strong>
							<span>Excluded first</span>
						</div>
					</section>
				{:else}
					<section>
						<h4>Ready to create</h4>
						<p>You can review and change these details from Template Settings after creation.</p>
					</section>
					{#if wizardExemptPersonnel.length > 0}
						<section>
							<div class="context-heading-row">
								<h4>Exempted Soldiers</h4>
								<button type="button" onclick={() => (wizardExemptPersonnelIds = [])}>Remove all</button>
							</div>
							<div class="exempted-soldiers">
								{#each wizardExemptPersonnel as person (person.id)}
									<span>
										{person.rank}
										{person.lastName}, {person.firstName}
										<button
											type="button"
											aria-label={`Remove ${person.rank} ${person.lastName}, ${person.firstName}`}
											onclick={() => removeExemption(person.id)}>×</button
										>
									</span>
								{/each}
							</div>
						</section>
					{/if}
				{/if}
			</aside>
		</div>

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

		<div class="wizard-actions new-template-actions">
			<button
				class="btn btn-secondary"
				type="button"
				disabled={newTemplateStep === 'general'}
				onclick={() => (newTemplateStep = previousStep(newTemplateStep))}
			>
				Back
			</button>
			<div>
				<a class="btn btn-secondary" href={basePath}>Cancel</a>
				{#if newTemplateStep !== 'review'}
					<button class="btn btn-primary" type="button" onclick={() => (newTemplateStep = nextStep(newTemplateStep))}>
						Continue
					</button>
				{:else}
					<button class="btn btn-primary" type="submit">Save Template</button>
				{/if}
			</div>
		</div>
	</form>
</section>
