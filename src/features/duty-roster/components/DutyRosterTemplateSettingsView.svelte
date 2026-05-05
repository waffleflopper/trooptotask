<script lang="ts">
	import MultiTagSelect from '$lib/components/ui/MultiTagSelect.svelte';
	import {
		groupOptionItems,
		optionItems,
		type DutyRosterTemplateSettingsWorkspaceModel
	} from '$features/duty-roster/workspace/dutyRosterWorkspaceReadModel';

	type SettingsSection = 'general' | 'pool' | 'exemptions' | 'baseline';

	let { settings }: { settings: DutyRosterTemplateSettingsWorkspaceModel } = $props();

	let settingsSection = $state<SettingsSection>('general');
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
</script>

<h2 id="template-view-heading" class="sr-only">Duty Roster Template settings</h2>
{#if actionForm?.settingsError}
	<p class="form-error settings-error" role="alert">{actionForm.settingsError}</p>
{/if}

{#if templateSettings}
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
					<section class="settings-section settings-section--general" aria-labelledby="template-identity-heading">
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
								<input class="input" name="shortCode" maxlength="12" bind:value={settingsShortCode} placeholder="CQ" />
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
							Selections match any value inside a category, then combine across categories. For example, SGT or CPL, and
							Alpha Group.
						</p>
						<div class="criteria-grid">
							<label class="tag-field">
								<span>Rank</span>
								<MultiTagSelect
									options={optionItems(settings.rankOptions)}
									value={rankFilterValues}
									ariaLabel="Rank filters"
									placeholder="Any rank"
									onChange={(values) => (rankFilterValues = values)}
								/>
							</label>
							<label class="tag-field">
								<span>Group</span>
								<MultiTagSelect
									options={groupOptionItems(settings.groupOptions)}
									value={groupFilterValues}
									ariaLabel="Group filters"
									placeholder="Any group"
									onChange={(values) => (groupFilterValues = values)}
								/>
							</label>
							<label class="tag-field">
								<span>MOS</span>
								<MultiTagSelect
									options={optionItems(settings.mosOptions)}
									value={mosFilterValues}
									ariaLabel="MOS filters"
									placeholder="Any MOS"
									onChange={(values) => (mosFilterValues = values)}
								/>
							</label>
							<label class="tag-field">
								<span>Duty Role</span>
								<MultiTagSelect
									options={optionItems(settings.dutyRoleOptions)}
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
						{#if templateSettings.resolvedPool.length === 0}
							<div class="admin-empty">No active Personnel Records match the current pool criteria.</div>
						{:else}
							<div class="pool-table admin-table-shell" role="table" aria-label="Resolved Duty Roster pool">
								<div class="pool-row pool-head" role="row">
									<span role="columnheader">Soldier</span>
									<span role="columnheader">Group</span>
									<span role="columnheader">MOS</span>
									<span role="columnheader">Exempt</span>
								</div>
								{#each templateSettings.resolvedPool as person (person.id)}
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
							Counts are optional and apply only until the first accepted run for this template. Leave blank to start
							from DA6 roster order.
						</p>
						{#if baselineLocked}
							<p class="admin-alert admin-alert--warning">
								Manual DA6 Baseline is locked because this template has accepted history. Future previews use accepted
								runs for DA6 continuity.
							</p>
						{/if}
						{#if templateSettings.baselineRows.length === 0}
							<div class="admin-empty">No baseline rows are available until the non-exempt pool has members.</div>
						{:else}
							<div class="baseline-list admin-table-shell">
								{#each templateSettings.baselineRows as row (row.personnel.id)}
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
					{#each templateSettings.baselineRows as row (row.personnel.id)}
						<input
							type="hidden"
							name={`baseline:${row.personnel.id}`}
							value={settingsBaselineCounts[row.personnel.id] ?? ''}
						/>
					{/each}
				{/if}

				<div class="settings-actions">
					<a class="btn btn-secondary" href={`${settings.basePath}/${selectedTemplate.slug}/generate`}>Cancel</a>
					<button class="btn btn-primary" type="submit">Save settings</button>
				</div>
			</div>
		</div>
	</form>
{:else}
	<div class="admin-empty">Loading template settings...</div>
{/if}
