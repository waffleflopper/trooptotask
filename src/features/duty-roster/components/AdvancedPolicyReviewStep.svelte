<script lang="ts">
	import type { DutyTemplate, SoftPreferenceConfig } from '../duty-roster.types';
	interface Props {
		template: DutyTemplate;
		enabledSoftPrefs: SoftPreferenceConfig[];
		hasRotationBaselines: boolean;
		statusTypeNameById: Map<string, string>;
		onBack: () => void;
		onEditTemplate: () => void;
		onContinue: () => void;
	}
	let {
		template,
		enabledSoftPrefs,
		hasRotationBaselines,
		statusTypeNameById,
		onBack,
		onEditTemplate,
		onContinue
	}: Props = $props();
</script>

<section class="step-card card card-flat">
	<div class="list-header">
		<div>
			<p class="eyebrow">Step 2 of 4 · Review policy</p>
			<h3>{template.name}</h3>
			<p class="wizard-copy">Confirm the rules for this duty before generating the series.</p>
		</div>
		<div class="header-actions">
			<button class="btn btn-secondary btn-sm" type="button" onclick={onBack}>Back</button><button
				class="btn btn-secondary btn-sm"
				type="button"
				onclick={onEditTemplate}>Edit Template</button
			>
		</div>
	</div>
	<div class="policy-grid">
		<div class="policy-item">
			<p class="policy-label">Coverage</p>
			<p class="policy-value">
				{template.coverageMode === 'timed'
					? `${template.startTime ?? '--:--'} to ${template.endTime ?? '--:--'}`
					: 'All day'}
			</p>
		</div>
		<div class="policy-item">
			<p class="policy-label">Blocking duty</p>
			<p class="policy-value">
				{template.isBlocking
					? 'Yes — placed Soldiers are unavailable for overlapping duties.'
					: 'No — does not block overlapping assignments.'}
			</p>
		</div>
		<div class="policy-item">
			<p class="policy-label">Cooldown</p>
			<p class="policy-value">
				{template.cooldownHours > 0
					? `${template.cooldownHours} hour${template.cooldownHours === 1 ? '' : 's'} after the shift ends.`
					: 'No cooldown window.'}
			</p>
		</div>
		<div class="policy-item">
			<p class="policy-label">Status exemptions</p>
			<p class="policy-value">
				{#if (template.exemptStatusTypeIds ?? []).length > 0}{(template.exemptStatusTypeIds ?? [])
						.map((statusTypeId) => statusTypeNameById.get(statusTypeId) ?? statusTypeId)
						.join(', ')}{:else}None configured.{/if}
			</p>
		</div>
		<div class="policy-item">
			<p class="policy-label">Positions to fill</p>
			<p class="policy-value">
				{template.slots.reduce((total, slot) => total + slot.quantity, 0)} total across {template.slots.length} slot definition{template
					.slots.length === 1
					? ''
					: 's'}.
			</p>
		</div>
		{#each template.slots as slot (slot.id)}<div class="policy-item policy-slot">
				<p class="policy-label">{slot.roleLabel} × {slot.quantity}</p>
				<p class="policy-value policy-value-secondary">
					Pool: {slot.rotationPoolKey}{#if slot.allowedRanks.length > 0}
						· Ranks: {slot.allowedRanks.join(', ')}{/if}
				</p>
			</div>{/each}
		{#if enabledSoftPrefs.length > 0}<div class="policy-item policy-full-width">
				<p class="policy-label">Candidate ranking order</p>
				<ol class="policy-pref-list">
					{#each enabledSoftPrefs as pref (pref.type)}<li>
							{#if pref.type === 'longest-break'}Longest break since last duty — favors whoever has gone the longest
								without serving.{:else if pref.type === 'holiday-closure'}Holiday or closure day volunteers preferred.{:else if pref.type === 'weekend'}Weekend
								volunteers preferred.{:else if pref.type === 'preferred-group'}Preferred group alignment — favors
								candidates from the template's preferred groups.{/if}
						</li>{/each}
				</ol>
			</div>{/if}
		{#if !hasRotationBaselines}<div class="policy-item policy-full-width policy-notice">
				<p class="policy-value">
					<strong>No baseline duty history on file</strong> — the generator will treat all candidates as equally fresh for
					the first run. Set manual baselines in the template to improve ranking accuracy.
				</p>
			</div>{/if}
	</div>
	<div class="step-actions">
		<button class="btn btn-primary" type="button" onclick={onContinue}>Looks Good — Set Date Pattern</button>
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
	.policy-grid {
		display: grid;
		gap: var(--sp-3);
		grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
		margin-top: var(--sp-4);
	}
	.policy-item {
		padding: var(--sp-3);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-md);
		background: var(--surface-subtle);
	}
	.policy-slot {
		border-left: 3px solid color-mix(in srgb, var(--amber-light) 80%, transparent);
	}
	.policy-full-width {
		grid-column: 1 / -1;
	}
	.policy-label,
	.eyebrow {
		margin: 0 0 4px;
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-tertiary);
	}
	.policy-value,
	.wizard-copy {
		margin: 0;
		color: var(--text-secondary);
	}
	.policy-value-secondary {
		font-weight: var(--font-weight-normal);
	}
	.policy-pref-list {
		margin: var(--sp-2) 0 0 1.25rem;
	}
	.step-actions {
		margin-top: var(--sp-4);
	}
	h3 {
		margin: 0;
	}
</style>
