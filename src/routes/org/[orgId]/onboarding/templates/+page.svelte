<script lang="ts">
	import { tick, untrack } from 'svelte';
	import {
		WorkspaceToolbar,
		type ToolbarItem,
		type WorkspaceToolbarProps
	} from '$lib/components/patterns/workspace-toolbar';
	import * as Alert from '$lib/components/ui/alert';
	import { Button } from '$lib/components/ui/button';
	import * as Empty from '$lib/components/ui/empty';
	import { Spinner } from '$lib/components/ui/spinner';
	import * as TypeWorkspace from '$lib/components/patterns/type-management-workspace';
	import { getAppShellContext } from '$features/app-shell';
	import { POLICY_ACTION_CATALOG, type PolicyResource } from '$lib/access/policyEvaluator';
	import {
		createOnboardingTemplateWorkspace,
		onboardingStore,
		onboardingTemplateStore,
		type OnboardingTemplateDeleteTarget
	} from '$features/onboarding';
	import type { OnboardingTemplateStep } from '$features/onboarding/contracts';
	import type { PersonnelOnboarding } from '$features/onboarding/onboarding.types';
	import { describeTemplateSync, syncTemplatePackets } from '$features/onboarding/templateSync';
	import TemplateHeader from '$features/onboarding/components/templates/TemplateHeader.svelte';
	import TemplateSteps from '$features/onboarding/components/templates/TemplateSteps.svelte';
	import TemplateSyncNotice from '$features/onboarding/components/templates/TemplateSyncNotice.svelte';
	import { rosterStore } from '$features/personnel';
	import { trainingTypeSource } from '$features/training';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	let emptyAddTemplate = $state<HTMLElement | null>(null);
	let templateList = $state<ReturnType<typeof TypeWorkspace.ItemList>>();
	let ConfirmDialog = $state<typeof import('$lib/components/ui/confirm-dialog').ConfirmDialog | null>(null);
	let query = $state('');
	let pendingDiscard = $state<(() => void) | null>(null);
	let syncing = $state(false);
	let syncOutcome = $state<{ templateId: string; message: string } | null>(null);

	const org = getAppShellContext();
	const orgId = $derived(org.orgId);
	const orgUrlSegment = $derived(org.orgUrlSegment ?? data.orgId ?? org.orgId);

	const configureAffordance = $derived(
		org.affordanceForFeatureAction(POLICY_ACTION_CATALOG.onboarding.configureWorkflows, { kind: 'organization' })
	);
	const canMutate = $derived(configureAffordance.visible && !configureAffordance.disabled);
	const hydrated = $derived(onboardingTemplateStore.orgId === orgId);
	let appliedHydrationVersion = -1;
	function sharedTemplateData() {
		return {
			templates: onboardingTemplateStore.templates,
			templateSteps: onboardingTemplateStore.allSteps,
			trainingTypes: trainingTypeSource.items
		};
	}
	const workspace = createOnboardingTemplateWorkspace({
		organization: {
			get orgId() {
				return orgId;
			},
			get routeSegment() {
				return orgUrlSegment;
			},
			get canConfigure() {
				return canMutate;
			}
		},
		data: untrack(sharedTemplateData)
	});
	const model = $derived(workspace.model);

	$effect(() => {
		const organization = {
			orgId,
			routeSegment: orgUrlSegment,
			canConfigure: canMutate
		};
		const ready = hydrated;
		const version = onboardingTemplateStore.hydrationVersion;

		untrack(() => {
			workspace.replaceOrganization(organization);
			if (!ready) return;
			workspace.replaceData(sharedTemplateData());
			appliedHydrationVersion = version;
		});
	});

	// The board reads the shared template store, so saved edits here must reach it without a reload.
	$effect(() => {
		const templates = model.templates;
		const steps = workspace.steps;
		if (!hydrated || appliedHydrationVersion !== onboardingTemplateStore.hydrationVersion) return;
		onboardingTemplateStore.publish(templates, steps, orgId);
	});

	$effect(() => {
		if ((!model.confirmDelete && !pendingDiscard) || ConfirmDialog) return;

		let cancelled = false;
		void import('$lib/components/ui/confirm-dialog').then((module) => {
			if (!cancelled) {
				ConfirmDialog = module.ConfirmDialog;
			}
		});

		return () => {
			cancelled = true;
		};
	});

	const needle = $derived(query.trim().toLowerCase());
	const visibleTemplates = $derived.by(() => {
		if (!needle) return model.templates;
		const steps = workspace.steps;
		return model.templates.filter(
			(template) =>
				template.name.toLowerCase().includes(needle) ||
				steps.some((step) => step.templateId === template.id && step.name.toLowerCase().includes(needle))
		);
	});

	const toolbarItems = $derived<ToolbarItem[]>([
		{
			kind: 'action',
			id: 'active-onboarding',
			label: 'Active onboarding',
			icon: 'arrow-left',
			href: `/org/${orgUrlSegment}/onboarding`
		}
	]);
	const toolbarSearch = $derived({
		label: 'Search templates and steps',
		placeholder: 'Search templates and steps',
		value: query,
		onValueChange: (value: string) => (query = value)
	} satisfies NonNullable<WorkspaceToolbarProps['search']>);
	const toolbarPrimary = $derived.by<WorkspaceToolbarProps['primary']>(() =>
		model.canMutate
			? {
					kind: 'action',
					id: 'new-template',
					label: 'New template',
					icon: 'plus',
					onclick: () => workspace.startCreateTemplate(),
					disabled: model.templateActionDisabled
				}
			: undefined
	);

	function activePacketsFor(templateId: string): number {
		return data.activePacketCounts[templateId] ?? 0;
	}

	const selectedActivePackets = $derived(model.selectedTemplate ? activePacketsFor(model.selectedTemplate.id) : 0);
	const packetsReady = $derived(onboardingStore.orgId === orgId && !onboardingStore.loading);
	const syncMessage = $derived(
		syncOutcome && syncOutcome.templateId === model.selectedTemplate?.id ? syncOutcome.message : null
	);

	function mayManagePacket(packet: PersonnelOnboarding): boolean {
		const groupId = rosterStore.readModel().full().getById(packet.personnelId)?.groupId;
		const resource: PolicyResource = groupId ? { kind: 'group', groupId } : { kind: 'organization' };
		return (
			org.affordanceForFeatureAction(POLICY_ACTION_CATALOG.onboarding.manageWorkflows, resource).visible &&
			org.affordanceForFeatureAction(POLICY_ACTION_CATALOG.onboarding.configureWorkflows, resource).visible
		);
	}

	async function syncActivePackets(): Promise<void> {
		const template = model.selectedTemplate;
		if (!template || syncing) return;
		syncing = true;
		syncOutcome = null;
		try {
			const result = await syncTemplatePackets({
				packets: onboardingStore.activeList.filter((packet) => packet.templateId === template.id),
				counted: activePacketsFor(template.id),
				mayManage: mayManagePacket,
				resync: (onboardingId) => onboardingStore.resync(onboardingId)
			});
			syncOutcome = { templateId: template.id, message: describeTemplateSync(result) };
		} finally {
			syncing = false;
		}
	}

	function guardStepDraft(action: () => void): void {
		if (model.stepDraftDirty) pendingDiscard = action;
		else action();
	}

	function startAddStep(): void {
		if (model.addingStep) return;
		guardStepDraft(() => workspace.startAddStep());
	}

	function startEditStep(step: OnboardingTemplateStep): void {
		if (model.editingStepId === step.id) return;
		guardStepDraft(() => workspace.startEditStep(step));
	}

	function confirmDiscard(): void {
		const action = pendingDiscard;
		pendingDiscard = null;
		action?.();
	}

	async function returnFocusFromStepForm(stepId: string | null): Promise<void> {
		await tick();
		const edit = stepId ? document.querySelector<HTMLElement>(`[data-edit-step="${CSS.escape(stepId)}"]`) : null;
		(edit ?? document.querySelector<HTMLElement>('[data-add-step]'))?.focus();
	}

	async function saveStep(): Promise<void> {
		const stepId = model.editingStepId;
		const result = await workspace.saveStep();
		if (result.ok) await returnFocusFromStepForm(stepId);
	}

	function cancelStep(): void {
		const stepId = model.editingStepId;
		if (stepId) workspace.cancelEditStep();
		else workspace.cancelAddStep();
		void returnFocusFromStepForm(stepId);
	}

	async function saveTemplate(): Promise<void> {
		const wasCreating = model.creatingTemplate;
		const result = await workspace.saveTemplate();
		if (!result.ok || !wasCreating) return;
		await tick();
		templateList?.focusSelected();
	}

	function requestDelete(target: OnboardingTemplateDeleteTarget) {
		workspace.requestDelete(target);
	}

	function deleteMessage(target: OnboardingTemplateDeleteTarget): string {
		if (target.type === 'step') {
			return `Delete ${target.name}? Active packets get this change when you sync them.`;
		}
		const packets = activePacketsFor(target.id);
		if (packets === 0) return `Delete ${target.name}? Its steps are deleted.`;
		return `Delete ${target.name}? Its steps are deleted. ${packets} active ${
			packets === 1 ? 'packet keeps its steps but loses its link' : 'packets keep their steps but lose their link'
		} to this template.`;
	}

	async function handleConfirmDelete(): Promise<void> {
		const target = model.confirmDelete;
		const stepIndex = model.selectedTemplateSteps.findIndex((step) => step.id === target?.id);
		const result = await workspace.confirmDelete();
		if (!result.ok || !target) return;
		await tick();
		if (target.type === 'template') {
			if (templateList) templateList.focusSelected();
			else emptyAddTemplate?.focus();
			return;
		}
		const steps = model.selectedTemplateSteps;
		const survivor = steps[Math.min(stepIndex, steps.length - 1)];
		await returnFocusFromStepForm(survivor?.id ?? null);
	}
</script>

<svelte:head>
	<title>Onboarding Templates - Troop to Task</title>
</svelte:head>

{#if !hydrated}
	<section class="flex items-center justify-center gap-2 p-6 text-muted-foreground" role="status">
		<Spinner />
		<p>Loading onboarding templates...</p>
	</section>
{/if}

<TypeWorkspace.Root
	aria-label="Onboarding template management workspace"
	class={hydrated ? 'overflow-hidden' : 'hidden'}
>
	<WorkspaceToolbar
		ariaLabel="Onboarding template controls"
		items={toolbarItems}
		search={toolbarSearch}
		primary={toolbarPrimary}
	/>

	{#if model.error && !model.confirmDelete}
		<Alert.Root variant="destructive">
			<Alert.Description>{model.error.message}</Alert.Description>
		</Alert.Root>
	{/if}

	<TypeWorkspace.Layout>
		<TypeWorkspace.List mobileHidden={model.mobileDetailOpen || model.creatingTemplate || model.editingTemplate}>
			{#if model.templates.length === 0 && !model.creatingTemplate}
				<Empty.Root>
					<Empty.Header>
						<Empty.Title level={3}>No templates yet.</Empty.Title>
						<Empty.Description>Create one to get started.</Empty.Description>
					</Empty.Header>
					{#if model.canMutate}
						<Empty.Content>
							<Button
								bind:ref={emptyAddTemplate}
								variant="outline"
								size="sm"
								type="button"
								onclick={() => workspace.startCreateTemplate()}
							>
								New template
							</Button>
						</Empty.Content>
					{/if}
				</Empty.Root>
			{:else if visibleTemplates.length === 0}
				<Empty.Root>
					<Empty.Header>
						<Empty.Title level={3}>No matches.</Empty.Title>
						<Empty.Description>No template or step is named like "{query.trim()}".</Empty.Description>
					</Empty.Header>
				</Empty.Root>
			{:else}
				<TypeWorkspace.ItemList bind:this={templateList} aria-label="Onboarding templates">
					{#each visibleTemplates as template (template.id)}
						<TypeWorkspace.ListItem
							selected={model.selectedTemplate?.id === template.id && !model.creatingTemplate}
							title={template.name}
							description={workspace.getTemplateSummary(template, activePacketsFor(template.id))}
							onselect={() => workspace.selectTemplate(template.id)}
							disabled={model.templateActionDisabled}
						/>
					{/each}
				</TypeWorkspace.ItemList>
			{/if}
		</TypeWorkspace.List>

		<TypeWorkspace.Detail
			mobileHidden={!model.mobileDetailOpen && !model.creatingTemplate && !model.editingTemplate}
			class={model.creatingTemplate || model.selectedTemplate ? 'flex flex-col overflow-hidden pr-0' : undefined}
		>
			{#if model.creatingTemplate || model.selectedTemplate}
				<TypeWorkspace.MobileBack onclick={() => workspace.closeMobileDetail()}>Templates</TypeWorkspace.MobileBack>
				<div class="min-h-0 flex-1 overflow-y-auto pr-2 pb-8 [scrollbar-gutter:stable]">
					<TypeWorkspace.Stack>
						<TemplateHeader
							{workspace}
							template={model.selectedTemplate}
							stepCount={model.selectedTemplateSteps.length}
							onsave={saveTemplate}
							ondelete={() =>
								model.selectedTemplate &&
								requestDelete({ type: 'template', id: model.selectedTemplate.id, name: model.selectedTemplate.name })}
							onduplicate={() => workspace.duplicateTemplate(model.selectedTemplate?.id)}
						/>

						{#if model.selectedTemplate && !model.creatingTemplate}
							{#if selectedActivePackets > 0}
								<TemplateSyncNotice
									activePackets={selectedActivePackets}
									{syncing}
									ready={packetsReady}
									result={syncMessage}
									onsync={syncActivePackets}
								/>
							{/if}

							<TypeWorkspace.FormSection title="Steps">
								<p class="m-0 text-xs text-muted-foreground">
									In the order Soldiers see them.
									{#if model.canMutate}Drag the grip, or focus it and press Arrow Up or Arrow Down, to reorder.{/if}
								</p>
								<TemplateSteps
									{workspace}
									steps={model.selectedTemplateSteps}
									trainingTypes={model.trainingTypes}
									onedit={startEditStep}
									onadd={startAddStep}
									ondelete={(step) => requestDelete({ type: 'step', id: step.id, name: step.name })}
									onsave={saveStep}
									oncancel={cancelStep}
								/>
							</TypeWorkspace.FormSection>
						{/if}
					</TypeWorkspace.Stack>
				</div>
			{:else}
				<Empty.Root>
					<Empty.Header>
						<Empty.Title level={3}>Select a template</Empty.Title>
						<Empty.Description>Choose a template from the list to view details.</Empty.Description>
					</Empty.Header>
				</Empty.Root>
			{/if}
		</TypeWorkspace.Detail>
	</TypeWorkspace.Layout>
</TypeWorkspace.Root>

{#if model.confirmDelete && ConfirmDialog}
	<ConfirmDialog
		title="Delete {model.confirmDelete.type === 'template' ? 'template' : 'step'}"
		message={deleteMessage(model.confirmDelete)}
		confirmLabel="Delete"
		onConfirm={handleConfirmDelete}
		onCancel={() => workspace.cancelDelete()}
	>
		{#if model.error}
			<Alert.Root variant="destructive">
				<Alert.Description>{model.error.message}</Alert.Description>
			</Alert.Root>
		{/if}
	</ConfirmDialog>
{/if}

{#if pendingDiscard && ConfirmDialog}
	<ConfirmDialog
		title="Discard unsaved changes?"
		message="The step you have open has edits that are not saved. Opening another step discards them."
		confirmLabel="Discard"
		onConfirm={confirmDiscard}
		onCancel={() => (pendingDiscard = null)}
	/>
{/if}
