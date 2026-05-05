<script lang="ts">
	import MultiTagSelect from '$lib/components/ui/MultiTagSelect.svelte';
	import { slugifyDutyRosterTemplateName } from '$features/duty-roster/templates/dutyRosterTemplates';
	import {
		groupOptionItems,
		optionItems,
		type DutyRosterWorkspaceActionForm,
		type DutyRosterWorkspaceReadModel
	} from '$features/duty-roster/workspace/dutyRosterWorkspaceReadModel';

	type SetupStep = 'general' | 'pool' | 'exemptions' | 'baseline';

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
		wizardExemptPersonnelIds = $bindable()
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
	} = $props();

	const wizardResolvedPool = $derived(
		setupPersonnel.filter((person) => {
			if (rankFilterValues.length > 0 && !rankFilterValues.includes(person.rank)) return false;
			if (groupFilterValues.length > 0 && (!person.groupId || !groupFilterValues.includes(person.groupId))) {
				return false;
			}
			if (mosFilterValues.length > 0 && !mosFilterValues.includes(person.mos)) return false;
			if (dutyRoleFilterValues.length > 0 && !dutyRoleFilterValues.includes(person.dutyRole)) return false;
			return true;
		})
	);
	const wizardBaselineRows = $derived(
		wizardResolvedPool.filter((person) => !wizardExemptPersonnelIds.includes(person.id))
	);

	function previousStep(step: SetupStep): SetupStep {
		return step === 'baseline' ? 'exemptions' : step === 'exemptions' ? 'pool' : 'general';
	}

	function nextStep(step: SetupStep): SetupStep {
		return step === 'general' ? 'pool' : step === 'pool' ? 'exemptions' : 'baseline';
	}
</script>

<section class="new-template-workspace" aria-labelledby="new-template-heading">
	<div class="template-title-row">
		<div>
			<p class="eyebrow">New Template</p>
			<h2 id="new-template-heading">Create Duty Roster Template</h2>
			<p class="summary">Complete each setup section, then save once to create the operational template.</p>
		</div>
		<a class="btn btn-secondary" href={basePath}>Back to Templates</a>
	</div>

	{#if actionForm?.settingsError}
		<p class="form-error settings-error" role="alert">{actionForm.settingsError}</p>
	{/if}

	<form class="settings-form wizard-form" method="POST" action={createWizardAction}>
		<nav class="settings-nav" aria-label="New Template steps">
			<button type="button" class:active={newTemplateStep === 'general'} onclick={() => (newTemplateStep = 'general')}>
				General
			</button>
			<button type="button" class:active={newTemplateStep === 'pool'} onclick={() => (newTemplateStep = 'pool')}>
				Pool & Filters
			</button>
			<button
				type="button"
				class:active={newTemplateStep === 'exemptions'}
				onclick={() => (newTemplateStep = 'exemptions')}
			>
				Exemptions
			</button>
			<button
				type="button"
				class:active={newTemplateStep === 'baseline'}
				onclick={() => (newTemplateStep = 'baseline')}
			>
				DA6 Baseline
			</button>
		</nav>

		<div class="settings-panels">
			{#if newTemplateStep === 'general'}
				<section class="settings-section card card-flat" aria-labelledby="wizard-general-heading">
					<h4 id="wizard-general-heading">General</h4>
					<div class="identity-grid">
						<label>
							<span>Template name</span>
							<input
								class="input"
								name="name"
								maxlength="120"
								required
								bind:value={newTemplateName}
								onblur={() => {
									if (!newTemplateSlug) newTemplateSlug = slugifyDutyRosterTemplateName(newTemplateName);
								}}
								placeholder="CQ NCO"
							/>
						</label>
						<label>
							<span>Route slug</span>
							<input
								class="input"
								name="slug"
								maxlength="72"
								required
								bind:value={newTemplateSlug}
								placeholder="cq-nco"
							/>
						</label>
						<label>
							<span>Short code</span>
							<input class="input" name="shortCode" maxlength="12" bind:value={newTemplateShortCode} placeholder="CQ" />
						</label>
					</div>
				</section>
			{/if}

			{#if newTemplateStep === 'pool'}
				<section class="settings-section card card-flat" aria-labelledby="wizard-pool-heading">
					<h4 id="wizard-pool-heading">Pool & Filters</h4>
					<p class="field-hint">Filters match any value inside one category, then combine across categories.</p>
					<div class="criteria-grid">
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
								placeholder="Any role"
								onChange={(values) => (dutyRoleFilterValues = values)}
							/>
						</label>
					</div>
				</section>
			{/if}

			{#if newTemplateStep === 'exemptions'}
				<section class="settings-section card card-flat" aria-labelledby="wizard-exemptions-heading">
					<h4 id="wizard-exemptions-heading">Exemptions</h4>
					{#if wizardResolvedPool.length === 0}
						<div class="admin-empty">No Soldiers match the current pool filters.</div>
					{:else}
						<div class="pool-table admin-table-shell" role="table" aria-label="New Template resolved pool">
							<div class="pool-row pool-head" role="row">
								<span role="columnheader">Soldier</span>
								<span role="columnheader">Group</span>
								<span role="columnheader">MOS</span>
								<span role="columnheader">Exempt</span>
							</div>
							{#each wizardResolvedPool as person (person.id)}
								<div class="pool-row" role="row">
									<span role="cell">{person.rank} {person.lastName}, {person.firstName}</span>
									<span role="cell">{person.groupName || 'No Group'}</span>
									<span role="cell">{person.mos || 'No MOS'}</span>
									<span role="cell">
										<label class="row-check">
											<input
												type="checkbox"
												value={person.id}
												checked={wizardExemptPersonnelIds.includes(person.id)}
												onchange={(event) => {
													const checked = event.currentTarget.checked;
													wizardExemptPersonnelIds = checked
														? [...wizardExemptPersonnelIds, person.id]
														: wizardExemptPersonnelIds.filter((id) => id !== person.id);
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
			{/if}

			{#if newTemplateStep === 'baseline'}
				<section class="settings-section card card-flat" aria-labelledby="wizard-baseline-heading">
					<h4 id="wizard-baseline-heading">DA6 Baseline</h4>
					<p class="field-hint">Optional starting counts. Leave blank to start from DA6 roster order.</p>
					{#if wizardBaselineRows.length === 0}
						<div class="admin-empty">No baseline rows are available until the non-exempt pool has members.</div>
					{:else}
						<div class="baseline-list admin-table-shell">
							{#each wizardBaselineRows as person (person.id)}
								<label>
									<span>{person.rank} {person.lastName}, {person.firstName}</span>
									<input
										class="input"
										type="number"
										min="0"
										step="1"
										name={`baseline:${person.id}`}
										placeholder="Count"
									/>
								</label>
							{/each}
						</div>
					{/if}
				</section>
			{/if}
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

		<div class="wizard-actions">
			<button
				class="btn btn-secondary"
				type="button"
				disabled={newTemplateStep === 'general'}
				onclick={() => (newTemplateStep = previousStep(newTemplateStep))}
			>
				Back
			</button>
			{#if newTemplateStep !== 'baseline'}
				<button class="btn btn-primary" type="button" onclick={() => (newTemplateStep = nextStep(newTemplateStep))}>
					Continue
				</button>
			{:else}
				<button class="btn btn-primary" type="submit">Save Template</button>
			{/if}
		</div>
	</form>
</section>
