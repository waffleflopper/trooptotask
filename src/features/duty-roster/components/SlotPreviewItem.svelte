<script lang="ts">
	import type { DutyEventPreviewSlotInstance } from '../duty-roster.types';
	import type { Personnel } from '$lib/types';

	export type SlotExplanationSection = {
		label: string;
		tone: 'default' | 'warning' | 'conflict';
		lines: string[];
	};

	interface Props {
		slot: DutyEventPreviewSlotInstance;
		eventDate: string;
		personnelOptions: Personnel[];
		formatAssignee: (id: string | null) => string;
		getExplanationSections: (slot: DutyEventPreviewSlotInstance) => SlotExplanationSection[];
		isLoading: boolean;
		hasOverride?: boolean;
		showResetButton?: boolean;
		onUpdateAssignee: (id: string | null) => void;
		onToggleLock: () => void;
		onClear: () => void;
		onReset?: () => void;
		onRegenerateSlot?: () => void;
	}

	let {
		slot,
		eventDate,
		personnelOptions,
		formatAssignee,
		getExplanationSections,
		isLoading,
		hasOverride = false,
		showResetButton = false,
		onUpdateAssignee,
		onToggleLock,
		onClear,
		onReset,
		onRegenerateSlot
	}: Props = $props();

	const ariaBase = $derived(`${eventDate} ${slot.roleLabel} #${slot.slotIndex + 1}`);
	const explanationSections = $derived(getExplanationSections(slot));
</script>

<div class="slot-preview-subitem">
	<div class="slot-preview-heading">
		<strong>{slot.roleLabel} #{slot.slotIndex + 1}</strong>
		<div class="slot-status-badges">
			{#if slot.assignmentSource === 'locked'}
				<span class="slot-status slot-status-lock">Locked</span>
			{:else if slot.assignmentSource === 'manual'}
				<span class="slot-status slot-status-manual">Manual</span>
			{/if}
			{#if slot.warningState === 'warning'}
				<span class="slot-status slot-status-warning">Soft warning</span>
			{:else if slot.warningState === 'conflict'}
				<span class="slot-status slot-status-conflict">Hard conflict</span>
			{/if}
			{#if slot.fairnessConfidence === 'low'}
				<span class="slot-status slot-status-warning">Low confidence</span>
			{:else if slot.fairnessConfidence === 'medium'}
				<span class="slot-status slot-status-info">Med confidence</span>
			{/if}
		</div>
	</div>

	<span class="slot-assignee">{formatAssignee(slot.assigneeId)}</span>

	<label class="field">
		<span class="label sr-only">Assignee for {ariaBase}</span>
		<select
			class="select"
			aria-label={`Assignee for ${ariaBase}`}
			value={slot.assigneeId ?? ''}
			disabled={isLoading}
			onchange={(e) => onUpdateAssignee((e.currentTarget as HTMLSelectElement).value || null)}
		>
			<option value="">Leave Unfilled</option>
			{#each personnelOptions as person (person.id)}
				<option value={person.id}>{person.rank} {person.lastName}</option>
			{/each}
		</select>
	</label>

	<div class="slot-action-row">
		<button
			class="btn btn-secondary btn-sm"
			type="button"
			disabled={isLoading}
			aria-label={`${slot.assignmentSource === 'locked' ? 'Unlock' : 'Lock'} ${ariaBase}`}
			onclick={onToggleLock}
		>
			{slot.assignmentSource === 'locked' ? 'Unlock' : 'Lock'}
		</button>
		<button
			class="btn btn-secondary btn-sm"
			type="button"
			disabled={isLoading}
			aria-label={`Clear ${ariaBase}`}
			onclick={onClear}
		>
			Clear
		</button>
		{#if showResetButton && onReset}
			<button
				class="btn btn-secondary btn-sm"
				type="button"
				disabled={isLoading || !hasOverride}
				aria-label={`Reset ${ariaBase}`}
				onclick={onReset}
			>
				Reset
			</button>
		{/if}
		{#if onRegenerateSlot}
			<button
				class="btn btn-secondary btn-sm"
				type="button"
				disabled={isLoading}
				aria-label={`Regenerate ${ariaBase}`}
				onclick={onRegenerateSlot}
			>
				Regenerate
			</button>
		{/if}
	</div>

	{#if explanationSections.length > 0}
		<div class="slot-explanation-list">
			{#each explanationSections as section (`${slot.slotIndex}-${section.label}`)}
				<div class="slot-explanation-card">
					<p class="slot-explanation-label">{section.label}</p>
					<div class="slot-message-list">
						{#each section.lines as line (`${section.label}-${line}`)}
							<span
								class={`slot-message ${section.tone === 'conflict' ? 'slot-message-conflict' : section.tone === 'warning' ? 'slot-message-warning' : ''}`}
								>{line}</span
							>
						{/each}
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>

<style>
	.slot-preview-subitem {
		display: grid;
		gap: var(--sp-2);
		padding: 10px 12px;
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-sm);
		background: var(--surface-panel);
		color: var(--text-secondary);
	}

	.slot-preview-heading,
	.slot-status-badges,
	.slot-action-row,
	.slot-message-list {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-2);
	}

	.slot-preview-heading {
		align-items: center;
		justify-content: space-between;
	}

	.slot-message-list {
		flex-direction: column;
		align-items: flex-start;
	}

	.slot-assignee {
		font-size: var(--text-sm);
	}

	.field {
		display: grid;
		gap: var(--sp-2);
	}

	.label {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-secondary);
	}

	.slot-status {
		display: inline-flex;
		align-items: center;
		padding: 2px 8px;
		border-radius: 999px;
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
	}

	.slot-status-lock,
	.slot-status-manual {
		background: color-mix(in srgb, var(--surface-subtle) 55%, var(--surface-panel) 45%);
		color: var(--text-secondary);
	}

	.slot-status-warning {
		background: color-mix(in srgb, var(--amber-light) 78%, var(--surface-panel) 22%);
		color: var(--amber-dark);
	}

	.slot-status-info {
		background: color-mix(in srgb, var(--surface-subtle) 60%, var(--surface-panel) 40%);
		color: var(--text-secondary);
	}

	.slot-status-conflict {
		background: color-mix(in srgb, var(--danger-light) 82%, var(--surface-panel) 18%);
		color: var(--danger-dark);
	}

	.slot-message {
		display: block;
		width: 100%;
		font-size: var(--text-sm);
		color: var(--text-secondary);
	}

	.slot-message-warning {
		color: var(--amber-dark);
	}

	.slot-message-conflict {
		color: var(--danger-dark);
	}

	.slot-explanation-list {
		display: grid;
		gap: var(--sp-2);
	}

	.slot-explanation-card {
		display: grid;
		gap: 4px;
		padding: 10px 12px;
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-sm);
		background: color-mix(in srgb, var(--surface-subtle) 65%, var(--surface-panel) 35%);
	}

	.slot-explanation-label {
		margin: 0;
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-tertiary);
	}
</style>
