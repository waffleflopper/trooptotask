<script lang="ts">
	import type { DutyTemplate, SoftPreferenceConfig } from '../duty-roster.types';
	interface Props {
		template: DutyTemplate;
		enabledSoftPrefs: SoftPreferenceConfig[];
		hasRotationBaselines: boolean;
		onBack: () => void;
		onEditTemplate: () => void;
		onContinue: () => void;
	}
	let { template, enabledSoftPrefs, hasRotationBaselines, onBack, onEditTemplate, onContinue }: Props = $props();
</script>

<section class="step-card card card-flat">
	<div class="list-header">
		<div>
			<p class="eyebrow">Template policy</p>
			<h3>{template.name}</h3>
		</div>
		<div class="header-actions">
			<button class="btn btn-secondary btn-sm" type="button" onclick={onBack}>Back</button><button
				class="btn btn-secondary btn-sm"
				type="button"
				onclick={onEditTemplate}>Edit Template</button
			>
		</div>
	</div>
	<dl class="policy-list">
		<div class="policy-row">
			<dt>Coverage</dt>
			<dd>
				{template.coverageMode === 'timed'
					? `${template.startTime ?? '--:--'} to ${template.endTime ?? '--:--'}`
					: 'All day'}
			</dd>
		</div>
		<div class="policy-row">
			<dt>Blocking</dt>
			<dd>{template.isBlocking ? 'Blocks overlapping duties' : 'Does not block overlapping assignments'}</dd>
		</div>
		<div class="policy-row">
			<dt>Cooldown</dt>
			<dd>
				{template.cooldownHours > 0
					? `${template.cooldownHours} hour${template.cooldownHours === 1 ? '' : 's'}`
					: 'None'}
			</dd>
		</div>
		<div class="policy-row">
			<dt>Status availability</dt>
			<dd>Handled by Calendar status treatments</dd>
		</div>
		<div class="policy-row">
			<dt>Slots</dt>
			<dd>{template.slots.reduce((total, slot) => total + slot.quantity, 0)} positions</dd>
		</div>
	</dl>

	<div class="slot-list" aria-label="Template slots">
		{#each template.slots as slot (slot.id)}
			<p>
				<strong>{slot.roleLabel} × {slot.quantity}</strong>
				<span
					>{slot.rotationPoolKey}{#if slot.allowedRanks.length > 0}
						· {slot.allowedRanks.join(', ')}{/if}</span
				>
			</p>
		{/each}
	</div>

	{#if enabledSoftPrefs.length > 0 || !hasRotationBaselines}
		<div class="policy-note">
			{#if enabledSoftPrefs.length > 0}
				<p>
					Ranking: {enabledSoftPrefs
						.map((pref) =>
							pref.type === 'longest-break'
								? 'longest break'
								: pref.type === 'holiday-closure'
									? 'holiday volunteers'
									: pref.type === 'weekend'
										? 'weekend volunteers'
										: 'preferred group'
						)
						.join(', ')}.
				</p>
			{/if}
			{#if !hasRotationBaselines}
				<p>No baseline history yet. First-run ranking starts from equal freshness.</p>
			{/if}
		</div>
	{/if}
	<div class="step-actions">
		<button class="btn btn-primary" type="button" onclick={onContinue}>Set Date Pattern</button>
	</div>
</section>

<style>
	.step-card {
		padding: var(--sp-5);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-lg);
		background: var(--surface-panel);
	}
	.list-header,
	.header-actions {
		display: flex;
		gap: var(--sp-4);
		justify-content: space-between;
		flex-wrap: wrap;
	}
	.policy-list {
		display: grid;
		margin: var(--sp-4) 0 0;
		border-top: 1px solid var(--border-subtle);
	}
	.policy-row {
		display: grid;
		grid-template-columns: minmax(120px, 0.36fr) minmax(0, 1fr);
		gap: var(--sp-3);
		padding: var(--sp-2) 0;
		border-bottom: 1px solid var(--border-subtle);
	}
	.policy-row dt,
	.eyebrow {
		margin: 0;
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-tertiary);
	}
	.policy-row dd {
		margin: 0;
		color: var(--text-secondary);
	}
	.slot-list {
		display: grid;
		gap: var(--sp-2);
		margin-top: var(--sp-4);
	}
	.slot-list p {
		display: flex;
		justify-content: space-between;
		gap: var(--sp-3);
		margin: 0;
		padding: var(--sp-2) var(--sp-3);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-sm);
		background: var(--surface-subtle);
	}
	.slot-list span {
		color: var(--text-secondary);
	}
	.policy-note {
		display: grid;
		gap: var(--sp-1);
		margin-top: var(--sp-4);
		padding: var(--sp-3);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-md);
		background: var(--surface-panel);
		color: var(--text-secondary);
	}
	.policy-note p {
		margin: 0;
	}
	.step-actions {
		margin-top: var(--sp-4);
	}
	h3 {
		margin: 0;
	}
	@media (max-width: 640px) {
		.policy-row,
		.slot-list p {
			grid-template-columns: 1fr;
		}
		.slot-list p {
			display: grid;
		}
	}
</style>
