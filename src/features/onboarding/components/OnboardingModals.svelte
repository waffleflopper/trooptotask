<script lang="ts">
	import type { OnboardingPageContext } from '../contexts/OnboardingPageContext.svelte';
	import { MODAL_IDS } from '../contexts/OnboardingPageContext.svelte';
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
		onboardings={ctx.onboardings}
		personnel={ctx.personnel}
		templates={ctx.templates}
		trainingTypeNames={ctx.trainingTypeNames}
		onClose={ctx.modals.closerFor(MODAL_IDS.report)}
	/>
{/if}

{#if ctx.modals.isOpen(MODAL_IDS.startOnboarding)}
	<StartOnboardingModal
		personnel={ctx.personnel}
		existingOnboardingPersonnelIds={ctx.existingOnboardingPersonnelIds}
		groups={ctx.groups}
		templates={ctx.templates}
		hasTemplateSteps={ctx.hasTemplateSteps}
		onSubmit={(personnelId, _startedAt, templateId) => ctx.handleStartOnboarding(personnelId, templateId)}
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
		width="520px"
		titleId="switch-template-title"
	>
		<div class="action-shell">
			<div class="action-summary">
				<p class="action-eyebrow">Template change</p>
				<p>
					Switch this onboarding to a different template. Removed steps stay on the record as inactive, new steps are
					added, and matching steps are refreshed.
				</p>
			</div>

			<label class="action-field" for="switch-template-select">
				<span class="label">New Template</span>
				<select id="switch-template-select" class="select" bind:value={ctx.switchTemplateSelected}>
					{#each ctx.templates as t (t.id)}
						<option value={t.id}>{t.name}</option>
					{/each}
				</select>
			</label>

			{#if ctx.switchTemplateError}
				<p class="error-text">{ctx.switchTemplateError}</p>
			{/if}
		</div>

		{#snippet footer()}
			<div class="spacer"></div>
			<button class="btn btn-secondary" type="button" onclick={() => ctx.closeSwitchTemplate()}>Cancel</button>
			<button
				class="btn btn-primary"
				type="button"
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
		width="520px"
		titleId="assign-template-title"
	>
		<div class="action-shell">
			<div class="action-summary">
				<p class="action-eyebrow">Template assignment</p>
				<p>
					This onboarding started before templates were introduced. Assign a template so future syncs can match steps by
					name and type.
				</p>
			</div>

			<label class="action-field" for="assign-template-select">
				<span class="label">Template</span>
				<select id="assign-template-select" class="select" bind:value={ctx.assignTemplateSelected}>
					{#each ctx.templates as t (t.id)}
						<option value={t.id}>{t.name}</option>
					{/each}
				</select>
			</label>

			{#if ctx.assignTemplateError}
				<p class="error-text">{ctx.assignTemplateError}</p>
			{/if}
		</div>

		{#snippet footer()}
			<div class="spacer"></div>
			<button class="btn btn-secondary" type="button" onclick={() => ctx.closeAssignTemplate()}>Cancel</button>
			<button
				class="btn btn-primary"
				type="button"
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
	.action-shell {
		display: flex;
		flex-direction: column;
		gap: var(--sp-3);
	}

	.action-summary,
	.action-field {
		padding: var(--sp-3);
		border: var(--border-thin);
		border-radius: var(--radius-md);
		background: var(--surface-panel);
	}

	.action-summary {
		background: color-mix(in srgb, var(--surface-panel) 90%, var(--surface-subtle) 10%);
	}

	.action-eyebrow {
		margin: 0;
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--amber);
	}

	.action-summary p:last-child {
		margin: var(--sp-2) 0 0;
		font-size: var(--text-sm);
		line-height: 1.55;
		color: var(--text-secondary);
	}

	.action-field {
		display: flex;
		flex-direction: column;
		gap: var(--sp-1);
	}

	.error-text {
		margin: 0;
		font-size: var(--text-sm);
		color: var(--danger);
	}
</style>
