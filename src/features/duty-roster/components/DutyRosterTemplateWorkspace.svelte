<script lang="ts">
	import './dutyRosterTemplateWorkspace.css';
	import DutyRosterGenerateView from './DutyRosterGenerateView.svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import DutyRosterHistoryView from './DutyRosterHistoryView.svelte';
	import DutyRosterNewTemplateWorkspace from './DutyRosterNewTemplateWorkspace.svelte';
	import DutyRosterTemplateRegister from './DutyRosterTemplateRegister.svelte';
	import DutyRosterTemplateSettingsView from './DutyRosterTemplateSettingsView.svelte';
	import * as Tabs from '$lib/components/ui/tabs';
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
	let wizardBaselineCounts = $state<Record<string, string>>({});

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
	const historyPage = $derived(workspace.historyPage);
	const historyDetailRun = $derived(workspace.historyDetailRun);
	const latestHistoryRunId = $derived(workspace.latestHistoryRunId);
	const rankOptions = $derived(workspace.rankOptions);
	const groupOptions = $derived(workspace.groupOptions);
	const mosOptions = $derived(workspace.mosOptions);
	const dutyRoleOptions = $derived(workspace.dutyRoleOptions);

	const viewTabs = $derived(workspace.viewTabs);
	const historyMode = $derived(workspace.historyMode);

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
		wizardBaselineCounts = { ...(actionForm.values.manualBaselineCounts ?? {}) };
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
			bind:wizardBaselineCounts
		/>
	{:else if !selectedTemplate}
		<DutyRosterTemplateRegister {basePath} templates={data.templates} setupOptions={data.setupOptions ?? null} />
	{:else}
		<div class="template-detail-workspace">
			{#if actionForm?.error}
				<p class="form-error" role="alert">{actionForm.error}</p>
			{/if}

			<Tabs.Root value={selectedView} class="mb-4">
				<Tabs.List class="h-auto w-full flex-wrap justify-start" aria-label="Duty Roster Template views">
					{#each viewTabs as tab (tab.id)}
						<Tabs.Trigger
							value={tab.id}
							class="h-auto min-w-28 px-3 py-2"
							aria-current={selectedView === tab.id ? 'page' : undefined}
							onclick={() =>
								void goto(
									resolve(
										`${basePath}/${selectedTemplate.slug}/${tab.id}` as `/org/${string}/duty-rosters/${string}/${string}`
									)
								)}
						>
							<span class="grid gap-0.5 text-left">
								<span>{tab.label}</span>
								<small class="text-muted-foreground text-[0.7rem] font-normal">{tab.note}</small>
							</span>
						</Tabs.Trigger>
					{/each}
				</Tabs.List>
			</Tabs.Root>

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
						{historyPage}
						{historyDetailRun}
						{latestHistoryRunId}
						{historyMode}
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
