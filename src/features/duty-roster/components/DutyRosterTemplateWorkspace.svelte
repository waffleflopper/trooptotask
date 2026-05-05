<script lang="ts">
	import './dutyRosterTemplateWorkspace.css';
	import DutyRosterGenerateView from './DutyRosterGenerateView.svelte';
	import DutyRosterHistoryView from './DutyRosterHistoryView.svelte';
	import DutyRosterNewTemplateWorkspace from './DutyRosterNewTemplateWorkspace.svelte';
	import DutyRosterTemplateRegister from './DutyRosterTemplateRegister.svelte';
	import DutyRosterTemplateSettingsView from './DutyRosterTemplateSettingsView.svelte';
	import {
		buildDutyRosterWorkspaceReadModel,
		type DutyRosterWorkspaceData
	} from '$features/duty-roster/workspace/dutyRosterWorkspaceReadModel';

	let { data, form }: { data: DutyRosterWorkspaceData; form?: unknown } = $props();
	let rankFilterValues = $state<string[]>([]);
	let groupFilterValues = $state<string[]>([]);
	let mosFilterValues = $state<string[]>([]);
	let dutyRoleFilterValues = $state<string[]>([]);
	let newTemplateStep = $state<'general' | 'pool' | 'baseline' | 'review'>('general');
	let newTemplateName = $state('');
	let newTemplateSlug = $state('');
	let newTemplateShortCode = $state('');
	let wizardExemptPersonnelIds = $state<string[]>([]);

	const workspace = $derived(buildDutyRosterWorkspaceReadModel(data, form));
	const basePath = $derived(workspace.basePath);
	const createWizardAction = $derived(workspace.createWizardAction);
	const isNewTemplate = $derived(workspace.isNewTemplate);
	const selectedTemplate = $derived(workspace.selectedTemplate);
	const selectedView = $derived(workspace.selectedView);
	const actionForm = $derived(workspace.actionForm);
	const generateWorkspace = $derived(workspace.generateWorkspace);
	const settingsWorkspace = $derived(workspace.settingsWorkspace);
	const applyAcceptedRunAction = $derived(workspace.applyAcceptedRunAction);
	const invalidateAcceptedRunAction = $derived(workspace.invalidateAcceptedRunAction);
	const correctAcceptedRunAction = $derived(workspace.correctAcceptedRunAction);
	const acceptedRuns = $derived(workspace.acceptedRuns);
	const historyDetailRun = $derived(workspace.historyDetailRun);
	const latestHistoryRunId = $derived(workspace.latestHistoryRunId);
	const rankOptions = $derived(workspace.rankOptions);
	const groupOptions = $derived(workspace.groupOptions);
	const mosOptions = $derived(workspace.mosOptions);
	const dutyRoleOptions = $derived(workspace.dutyRoleOptions);

	const viewTabs = $derived(workspace.viewTabs);
	const historyMode = $derived(workspace.historyMode);
	const acceptedHistoryColumns = $derived(workspace.acceptedHistoryColumns);

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
</script>

<svelte:head>
	<title>Duty Rosters - Troop to Task</title>
</svelte:head>

<section class="duty-roster-workspace" aria-labelledby="duty-roster-title">
	{#if selectedTemplate && !isNewTemplate}
		<h1 id="duty-roster-title" class="sr-only">{selectedTemplate.name} {selectedView}</h1>
	{:else if isNewTemplate}
		<h1 id="duty-roster-title" class="sr-only">New Duty Roster Template</h1>
	{:else}
		<h1 id="duty-roster-title" class="sr-only">Duty Rosters</h1>
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
		<DutyRosterTemplateRegister {basePath} templates={data.templates} setupOptions={data.setupOptions ?? null} />
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
					{#if generateWorkspace}
						<DutyRosterGenerateView generate={generateWorkspace} />
					{/if}
				{:else if selectedView === 'history'}
					<DutyRosterHistoryView
						{basePath}
						{selectedTemplate}
						{actionForm}
						{acceptedRuns}
						{historyDetailRun}
						{latestHistoryRunId}
						{historyMode}
						{acceptedHistoryColumns}
						{applyAcceptedRunAction}
						{invalidateAcceptedRunAction}
						{correctAcceptedRunAction}
					/>
				{:else if settingsWorkspace}
					<DutyRosterTemplateSettingsView settings={settingsWorkspace} />
				{/if}
			</main>
		</div>
	{/if}
</section>
