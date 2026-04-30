<script lang="ts">
	import type { DutyEventSeriesPattern } from '../duty-roster.types';
	import type { weekdayOptions as weekdayOptionsConst } from './dutyRosterWizard.helpers';
	interface Props {
		advancedPattern: DutyEventSeriesPattern;
		advancedStartDate: string;
		advancedEndDate: string;
		selectedWeekdays: Set<number>;
		weekdayOptions: typeof weekdayOptionsConst;
		customDateDraft: string;
		customDateEntries: string[];
		isPreviewing: boolean;
		canPreviewSingle: boolean;
		canPreviewSeries: boolean;
		onBack: () => void;
		onPatternChange: (pattern: DutyEventSeriesPattern) => void;
		onStartDateChange: (value: string) => void;
		onEndDateChange: (value: string) => void;
		onToggleWeekday: (day: number) => void;
		onCustomDateDraftChange: (value: string) => void;
		onAddCustomDate: () => void;
		onRemoveCustomDate: (date: string) => void;
		onReviewCandidates: () => void;
		onPreviewSingle: () => void;
		onPreviewSeries: () => void;
	}
	let props: Props = $props();
	const patternNeedsRange = (pattern: DutyEventSeriesPattern) => pattern !== 'custom-dates';
</script>

<section class="step-card card card-flat">
	<div class="list-header">
		<div>
			<p class="eyebrow">Run dates</p>
			<h3>Set the date pattern</h3>
		</div>
		<button class="btn btn-secondary btn-sm" type="button" onclick={props.onBack}>Back</button>
	</div>
	<div class="advanced-form">
		{#if patternNeedsRange(props.advancedPattern)}
			<label class="field"
				><span class="label">Start Date</span><input
					class="input"
					type="date"
					value={props.advancedStartDate}
					oninput={(e) => props.onStartDateChange((e.currentTarget as HTMLInputElement).value)}
				/></label
			>
			<label class="field"
				><span class="label">End Date</span><input
					class="input"
					type="date"
					value={props.advancedEndDate}
					oninput={(e) => props.onEndDateChange((e.currentTarget as HTMLInputElement).value)}
				/></label
			>
		{/if}
		<label class="field"
			><span class="label">Pattern</span><select
				class="select"
				value={props.advancedPattern}
				aria-label="Date Pattern"
				onchange={(e) => props.onPatternChange((e.currentTarget as HTMLSelectElement).value as DutyEventSeriesPattern)}
				><option value="daily">Daily</option><option value="weekday-only">Weekdays Only</option><option
					value="weekend-only">Weekends Only</option
				><option value="selected-weekdays">Selected Weekdays</option><option value="holiday-closure-only"
					>Holiday/DONSA Only</option
				><option value="custom-dates">Custom Dates</option></select
			></label
		>
	</div>
	{#if props.advancedPattern === 'selected-weekdays'}<div class="weekday-picker">
			{#each props.weekdayOptions as option (option.value)}<label class="weekday-option"
					><input
						type="checkbox"
						checked={props.selectedWeekdays.has(option.value)}
						onchange={() => props.onToggleWeekday(option.value)}
						aria-label={option.label}
					/><span>{option.label}</span></label
				>{/each}
		</div>{/if}
	{#if props.advancedPattern === 'custom-dates'}<div class="custom-dates-panel">
			<label class="field"
				><span class="label">Add Date</span><input
					class="input"
					type="date"
					value={props.customDateDraft}
					oninput={(e) => props.onCustomDateDraftChange((e.currentTarget as HTMLInputElement).value)}
				/></label
			><button class="btn btn-secondary" type="button" onclick={props.onAddCustomDate}>Add</button>
			<div class="slot-chip-list">
				{#each props.customDateEntries as date (date)}<button
						class="slot-chip slot-chip-action"
						type="button"
						onclick={() => props.onRemoveCustomDate(date)}>{date}</button
					>{/each}
			</div>
		</div>{/if}
	<div class="step-actions">
		<button class="btn btn-secondary" type="button" onclick={props.onReviewCandidates}>Edit Candidate Pool</button
		><button
			class="btn btn-secondary"
			type="button"
			disabled={!props.canPreviewSingle || props.isPreviewing}
			onclick={props.onPreviewSingle}>{props.isPreviewing ? 'Generating...' : 'Preview One Date'}</button
		><button
			class="btn btn-primary"
			type="button"
			disabled={!props.canPreviewSeries || props.isPreviewing}
			onclick={props.onPreviewSeries}>{props.isPreviewing ? 'Generating...' : 'Preview Run'}</button
		>
	</div>
</section>

<style>
	.step-card {
		padding: var(--sp-5);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-lg);
		background: var(--surface-panel);
	}
	.list-header {
		display: flex;
		justify-content: space-between;
		gap: var(--sp-4);
	}
	.advanced-form,
	.weekday-picker,
	.custom-dates-panel,
	.step-actions {
		display: flex;
		gap: var(--sp-3);
		flex-wrap: wrap;
		margin-top: var(--sp-4);
	}
	.step-actions {
		justify-content: flex-end;
		padding-top: var(--sp-3);
		border-top: 1px solid var(--border-subtle);
	}
	.step-actions :global(.btn) {
		min-width: max-content;
	}
	.field {
		display: grid;
		gap: var(--sp-2);
		min-width: min(220px, 100%);
	}
	.label,
	.eyebrow {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-secondary);
	}
	h3 {
		margin: 0;
	}
	@media (max-width: 640px) {
		.step-actions {
			display: grid;
		}
		.step-actions,
		.step-actions :global(.btn) {
			width: 100%;
		}
	}
</style>
