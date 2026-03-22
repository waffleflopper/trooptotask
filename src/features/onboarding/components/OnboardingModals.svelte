<script lang="ts">
	import type { OnboardingPageContext, TrainingRecordPayload } from '../contexts/OnboardingPageContext.svelte';
	import { MODAL_IDS } from '../contexts/OnboardingPageContext.svelte';
	import { onboardingStore } from '../stores/onboarding.svelte';
	import { onboardingTemplateStore } from '../stores/onboardingTemplate.svelte';
	import { personnelStore } from '$features/personnel/stores/personnel.svelte';
	import { trainingTypesStore } from '$features/training/stores/trainingTypes.svelte';
	import { personnelTrainingsStore } from '$features/training/stores/personnelTrainings.svelte';
	import { groupsStore } from '$lib/stores/groups.svelte';
	import OnboardingTemplateManager from './OnboardingTemplateManager.svelte';
	import OnboardingReportModal from './OnboardingReportModal.svelte';
	import StartOnboardingModal from './StartOnboardingModal.svelte';
	import TrainingRecordModal from '$features/training/components/TrainingRecordModal.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';
	import Spinner from '$lib/components/ui/Spinner.svelte';

	interface Props {
		ctx: OnboardingPageContext;
	}

	let { ctx }: Props = $props();

	const trainingRecordPayload = $derived(ctx.modals.payload<TrainingRecordPayload>(MODAL_IDS.trainingRecord));
</script>

{#if ctx.modals.isOpen(MODAL_IDS.report)}
	<OnboardingReportModal
		onboardings={onboardingStore.list}
		personnel={personnelStore.list}
		trainingTypes={trainingTypesStore.items}
		personnelTrainings={personnelTrainingsStore.list}
		onClose={ctx.modals.closerFor(MODAL_IDS.report)}
	/>
{/if}

{#if ctx.modals.isOpen(MODAL_IDS.templateManager)}
	<OnboardingTemplateManager
		trainingTypes={trainingTypesStore.items}
		onClose={ctx.modals.closerFor(MODAL_IDS.templateManager)}
	/>
{/if}

{#if ctx.modals.isOpen(MODAL_IDS.startOnboarding)}
	<StartOnboardingModal
		personnel={personnelStore.list}
		existingOnboardingPersonnelIds={ctx.existingOnboardingPersonnelIds}
		groups={groupsStore.items}
		templates={onboardingTemplateStore.templates}
		hasTemplateSteps={ctx.hasTemplateSteps}
		onSubmit={(personnelId, startedAt, templateId) => ctx.handleStartOnboarding(personnelId, startedAt, templateId)}
		onAddPerson={ctx.handleAddPerson.bind(ctx)}
		onClose={ctx.modals.closerFor(MODAL_IDS.startOnboarding)}
	/>
{/if}

{#if ctx.cancellingId}
	<ConfirmDialog
		title="Cancel Onboarding"
		message="Are you sure you want to cancel this onboarding? This action cannot be undone."
		confirmLabel="Cancel Onboarding"
		variant="danger"
		onConfirm={() => ctx.handleCancelOnboarding(ctx.cancellingId!)}
		onCancel={() => (ctx.cancellingId = null)}
	/>
{/if}

{#if ctx.assigningTemplateId}
	<Modal
		title="Assign Template"
		onClose={() => ctx.closeAssignTemplate()}
		width="420px"
		titleId="assign-template-title"
	>
		<p class="assign-desc">
			This onboarding was started before templates were introduced. Assign it to a template to enable re-sync. Steps
			will be matched by name and type.
		</p>
		<div class="form-group">
			<label class="label" for="assign-template-select">Template</label>
			<select id="assign-template-select" class="select" bind:value={ctx.assignTemplateSelected}>
				{#each onboardingTemplateStore.templates as t (t.id)}
					<option value={t.id}>{t.name}</option>
				{/each}
			</select>
		</div>
		{#if ctx.assignTemplateError}
			<p class="error-text">{ctx.assignTemplateError}</p>
		{/if}

		{#snippet footer()}
			<div class="spacer"></div>
			<button class="btn btn-secondary" onclick={() => ctx.closeAssignTemplate()}>Cancel</button>
			<button
				class="btn btn-primary"
				onclick={() => ctx.handleAssignTemplate()}
				disabled={!ctx.assignTemplateSelected || ctx.assigningTemplate}
			>
				{#if ctx.assigningTemplate}<Spinner />{/if}
				Assign Template
			</button>
		{/snippet}
	</Modal>
{/if}

{#if trainingRecordPayload}
	<TrainingRecordModal
		person={trainingRecordPayload.person}
		trainingType={trainingRecordPayload.trainingType}
		existingTraining={trainingRecordPayload.existingTraining}
		onSave={(trainingData) => ctx.handleTrainingSave(trainingData)}
		onRemove={(id) => ctx.handleTrainingRemove(id)}
		onClose={ctx.modals.closerFor(MODAL_IDS.trainingRecord)}
		canBeExempted={trainingRecordPayload.trainingType.canBeExempted}
		isExempt={trainingRecordPayload.trainingType.canBeExempted &&
			trainingRecordPayload.trainingType.exemptPersonnelIds.includes(trainingRecordPayload.person.id)}
		onToggleExempt={(exempt) => ctx.handleTrainingToggleExempt(exempt)}
	/>
{/if}

<style>
	.assign-desc {
		font-size: var(--font-size-sm);
		color: var(--color-text-secondary);
		margin-bottom: var(--spacing-md);
		line-height: 1.5;
	}

	.error-text {
		font-size: var(--font-size-sm);
		color: var(--color-error);
		margin-top: var(--spacing-xs);
	}
</style>
