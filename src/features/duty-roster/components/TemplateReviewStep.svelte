<script lang="ts">
	import Spinner from '$lib/components/ui/Spinner.svelte';
	interface Props {
		templateName: string;
		templateStatus: string;
		scopeType: 'organization' | 'groups';
		scopeGroupIds: string[];
		coverageMode: 'all-day' | 'timed';
		startTime: string;
		endTime: string;
		isBlocking: boolean;
		cooldownHours: number;
		draftSlots: Array<{ key: string; quantity: number; roleLabel: string }>;
		draftRotationBaselines: Array<{ key: string }>;
		exemptStatusTypeIds: string[];
		enabledSoftPreferenceSummary: string;
		saveError: string;
		isDirty: boolean;
		canSaveDraft: boolean;
		canSave: boolean;
		isSaving: boolean;
		onBack: () => void;
		onSaveDraft: () => void;
		onSave: () => void;
	}
	let props: Props = $props();
</script>

<div class="step-actions"><button class="btn btn-secondary" type="button" onclick={props.onBack}>Back</button></div>

<section class="builder-card summary-card" aria-label="Template summary">
	<p class="eyebrow">Review</p>
	<h3>{props.templateName || 'Untitled advanced duty template'}</h3>
	<p class="summary-line">Status: <strong>{props.templateStatus}</strong></p>
	<p class="summary-line">
		Scope: <strong
			>{props.scopeType === 'organization'
				? 'whole organization'
				: `${props.scopeGroupIds.length} selected group${props.scopeGroupIds.length === 1 ? '' : 's'}`}</strong
		>
	</p>
	<p class="summary-line">
		Coverage: <strong
			>{props.coverageMode === 'timed'
				? `${props.startTime || '--:--'} to ${props.endTime || '--:--'}`
				: 'all day'}</strong
		>
	</p>
	<p class="summary-line">
		Conflict policy: <strong>{props.isBlocking ? 'blocking duty' : 'non-blocking duty'}</strong>
	</p>
	<p class="summary-line">
		Cooldown: <strong>{props.cooldownHours} hour{props.cooldownHours === 1 ? '' : 's'}</strong>
	</p>
	<p class="summary-line">Slot definitions: <strong>{props.draftSlots.length}</strong></p>
	<p class="summary-line">Rotation starting points: <strong>{props.draftRotationBaselines.length}</strong></p>
	<p class="summary-line">Status-based exemptions: <strong>{props.exemptStatusTypeIds.length}</strong></p>

	<div class="policy-summary">
		<p class="eyebrow">Policy summary</p>
		<p class="summary-line">Soft order: <strong>{props.enabledSoftPreferenceSummary}</strong></p>
		<p class="summary-line">
			Blocking duty: <strong
				>{props.isBlocking
					? 'People on this duty are treated as unavailable for overlapping duties.'
					: 'This duty does not block overlapping assignments.'}</strong
			>
		</p>
		<p class="summary-line">
			Cooldown: <strong
				>{props.cooldownHours > 0
					? `After the shift ends, the same person stays protected for ${props.cooldownHours} hour${props.cooldownHours === 1 ? '' : 's'}.`
					: 'No extra recovery window is enforced after the shift ends.'}</strong
			>
		</p>
		<p class="summary-line">
			Fairness confidence: <strong
				>Low confidence means the queue is still learning because history or starting points are thin.</strong
			>
		</p>
	</div>

	{#if props.draftSlots.length === 0}
		<p class="summary-empty">
			No slot definitions — return to <strong>Slot Builder</strong> to add at least one slot before saving.
		</p>
	{:else}
		<ul class="summary-slots">
			{#each props.draftSlots as slot (slot.key)}<li>{slot.quantity} x {slot.roleLabel || 'Unnamed slot'}</li>{/each}
		</ul>
	{/if}

	{#if props.saveError}<p class="error-message">{props.saveError}</p>{/if}
	{#if props.isDirty}<p class="unsaved-notice">You have unsaved changes.</p>{/if}

	<div class="save-actions">
		<button
			class="btn btn-secondary"
			type="button"
			disabled={!props.canSaveDraft || props.isSaving}
			onclick={props.onSaveDraft}
			>{#if props.isSaving}<Spinner />{/if}Save Draft</button
		>
		<button class="btn btn-primary" type="button" disabled={!props.canSave || props.isSaving} onclick={props.onSave}
			>{#if props.isSaving}<Spinner />{/if}Save Template</button
		>
	</div>
</section>

<style>
	.builder-card {
		padding: var(--sp-5);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-lg);
		background: var(--surface-panel);
	}
	.eyebrow {
		margin: 0 0 var(--sp-2);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--text-tertiary);
	}
	h3 {
		margin: 0;
	}
	.summary-line,
	.summary-empty,
	.unsaved-notice,
	.error-message {
		margin: var(--sp-2) 0 0;
	}
	.policy-summary {
		margin-top: var(--sp-4);
		padding: var(--sp-4);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-md);
		background: var(--surface-subtle);
	}
	.summary-slots {
		margin: var(--sp-3) 0 0;
		padding-left: 1.25rem;
	}
	.save-actions,
	.step-actions {
		display: flex;
		gap: var(--sp-3);
		flex-wrap: wrap;
	}
	.save-actions {
		margin-top: var(--sp-4);
	}
	.step-actions {
		margin-bottom: var(--sp-4);
	}
</style>
