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

	<dl class="summary-grid">
		<div>
			<dt>Status</dt>
			<dd>{props.templateStatus}</dd>
		</div>
		<div>
			<dt>Scope</dt>
			<dd>
				{props.scopeType === 'organization'
					? 'Whole organization'
					: `${props.scopeGroupIds.length} selected group${props.scopeGroupIds.length === 1 ? '' : 's'}`}
			</dd>
		</div>
		<div>
			<dt>Coverage</dt>
			<dd>
				{props.coverageMode === 'timed' ? `${props.startTime || '--:--'} to ${props.endTime || '--:--'}` : 'All day'}
			</dd>
		</div>
		<div>
			<dt>Conflict</dt>
			<dd>{props.isBlocking ? 'Blocking' : 'Non-blocking'}</dd>
		</div>
		<div>
			<dt>Cooldown</dt>
			<dd>{props.cooldownHours} hour{props.cooldownHours === 1 ? '' : 's'}</dd>
		</div>
		<div>
			<dt>Slots</dt>
			<dd>{props.draftSlots.length}</dd>
		</div>
		<div>
			<dt>Baselines</dt>
			<dd>{props.draftRotationBaselines.length}</dd>
		</div>
		<div>
			<dt>Status Availability</dt>
			<dd>From status settings</dd>
		</div>
		<div class="summary-wide">
			<dt>DA6 Ranking</dt>
			<dd>{props.enabledSoftPreferenceSummary}</dd>
		</div>
	</dl>

	{#if props.draftSlots.length === 0}
		<p class="summary-empty">
			No slots yet. Return to <strong>Slot Builder</strong> before saving.
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
	.summary-empty,
	.unsaved-notice,
	.error-message {
		margin: var(--sp-2) 0 0;
	}
	.summary-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
		gap: var(--sp-3);
		margin-top: var(--sp-4);
	}
	.summary-grid div {
		padding-top: var(--sp-2);
		border-top: 1px solid var(--border-subtle);
	}
	.summary-grid dt {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-tertiary);
	}
	.summary-grid dd {
		margin: var(--sp-1) 0 0;
		color: var(--text-primary);
	}
	.summary-wide {
		grid-column: 1 / -1;
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
