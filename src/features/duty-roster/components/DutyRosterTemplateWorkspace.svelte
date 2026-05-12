<script lang="ts">
	import DutyRosterGenerateView from './DutyRosterGenerateView.svelte';
	import DutyRosterHistoryView from './DutyRosterHistoryView.svelte';
	import DutyRosterNewTemplateWorkspace from './DutyRosterNewTemplateWorkspace.svelte';
	import DutyRosterTemplateRegister from './DutyRosterTemplateRegister.svelte';
	import DutyRosterTemplateSettingsView from './DutyRosterTemplateSettingsView.svelte';
	import * as PageShell from '$lib/components/ui/page-shell';
	import { WarningSummary } from '$features/duty-roster/components/shared';
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
	const routeTabs = $derived(
		selectedTemplate
			? viewTabs.map((tab) => ({
					label: tab.label,
					href: `${basePath}/${selectedTemplate.slug}/${tab.id}` as '/org/[orgId]/duty-rosters/[templateSlug]/[view]',
					active: selectedView === tab.id
				}))
			: []
	);
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

<PageShell.Root density={isNewTemplate ? 'default' : 'compact'} width="full" aria-labelledby="duty-roster-title">
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
		<div class="grid min-w-0 gap-5">
			{#if actionForm?.error}
				<WarningSummary tone="destructive" title="Duty roster action failed" description={actionForm.error} />
			{/if}

			<PageShell.Header
				title={selectedTemplate.name}
				subtitle={`${selectedTemplate.slug} duty roster template. Settings affect future runs only.`}
			/>

			<PageShell.Tabs items={routeTabs} label="Duty Roster Template views" />

			<main class="grid min-w-0 gap-4" aria-labelledby="template-view-heading">
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
</PageShell.Root>
