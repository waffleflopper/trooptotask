<script lang="ts">
	import type { OnboardingPageContext } from '../contexts/OnboardingPageContext.svelte';
	import { MODAL_IDS } from '../contexts/OnboardingPageContext.svelte';
	import { onboardingStore } from '../stores/onboarding.svelte';
	import { onboardingTemplateStore } from '../stores/onboardingTemplate.svelte';
	import { personnelStore } from '$features/personnel/stores/personnel.svelte';
	import { trainingTypesStore } from '$features/training/stores/trainingTypes.svelte';
	import { groupsStore } from '$lib/stores/groups.svelte';
	import OnboardingReportModal from './OnboardingReportModal.svelte';
	import StartOnboardingModal from './StartOnboardingModal.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';
	import Spinner from '$lib/components/ui/Spinner.svelte';

	interface Props {
		ctx: OnboardingPageContext;
	}

	let { ctx }: Props = $props();
</script>

{#if ctx.modals.isOpen(MODAL_IDS.report)}
	<OnboardingReportModal
		onboardings={onboardingStore.items}
		personnel={personnelStore.items}
		trainingTypes={trainingTypesStore.items}
		personnelTrainings={[]}
		onClose={ctx.modals.closerFor(MODAL_IDS.report)}
	/>
{/if}

{#if ctx.modals.isOpen(MODAL_IDS.startOnboarding)}
	<StartOnboardingModal
		personnel={personnelStore.items}
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

{#if ctx.completingId}
	<ConfirmDialog
		title="Complete Onboarding"
		message={ctx.completingIncompleteCount > 0
			? `Are you sure? There ${ctx.completingIncompleteCount === 1 ? 'is 1 step' : `are ${ctx.completingIncompleteCount} steps`} still incomplete.`
			: 'Mark this onboarding as complete?'}
		confirmLabel="Mark Complete"
		variant={ctx.completingIncompleteCount > 0 ? 'warning' : undefined}
		onConfirm={() => ctx.confirmCompleteOnboarding()}
		onCancel={() => ctx.cancelComplete()}
	/>
{/if}

{#if ctx.switchingTemplateId}
	<Modal
		title="Switch Template"
		onClose={() => ctx.closeSwitchTemplate()}
		width="420px"
		titleId="switch-template-title"
	>
		<p class="assign-desc">
			Switch this onboarding to a different template. Steps will be diffed: removed steps become inactive (preserving
			progress), new steps are added, and changed steps are updated.
		</p>
		<div class="form-group">
			<label class="label" for="switch-template-select">New Template</label>
			<select id="switch-template-select" class="select" bind:value={ctx.switchTemplateSelected}>
				{#each onboardingTemplateStore.templates as t (t.id)}
					<option value={t.id}>{t.name}</option>
				{/each}
			</select>
		</div>
		{#if ctx.switchTemplateError}
			<p class="error-text">{ctx.switchTemplateError}</p>
		{/if}

		{#snippet footer()}
			<div class="spacer"></div>
			<button class="btn btn-secondary" onclick={() => ctx.closeSwitchTemplate()}>Cancel</button>
			<button
				class="btn btn-primary"
				onclick={() => ctx.handleSwitchTemplate()}
				disabled={!ctx.switchTemplateSelected || ctx.switchingTemplate}
			>
				{#if ctx.switchingTemplate}<Spinner />{/if}
				Switch Template
			</button>
		{/snippet}
	</Modal>
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
