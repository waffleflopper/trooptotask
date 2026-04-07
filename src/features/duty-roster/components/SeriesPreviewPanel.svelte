<script lang="ts">
	import type {
		DutyEventSeriesPreview,
		DutyEventSeriesEventOverrideInput,
		DutyEventPreviewSlotInstance,
		DutyTemplate
	} from '../duty-roster.types';
	import type { Personnel } from '$lib/types';
	import CollisionReviewPanel from './CollisionReviewPanel.svelte';
	import SlotPreviewItem from './SlotPreviewItem.svelte';
	import type { SlotExplanationSection } from './SlotPreviewItem.svelte';

	interface Props {
		preview: DutyEventSeriesPreview;
		template: DutyTemplate;
		overrides: DutyEventSeriesEventOverrideInput[];
		eyebrow?: string;
		meta?: string;
		applyLabel?: string;
		applyingLabel?: string;
		isRefreshing: boolean;
		isApplying: boolean;
		collisionReviewConfirmed: boolean;
		shortfallReviewConfirmed: boolean;
		previewCollisionMessages: string[];
		personnelOptions: Personnel[];
		formatAssignee: (id: string | null) => string;
		formatCoverageLabel: (event: {
			coverageMode: 'all-day' | 'timed';
			coverageStart: string;
			coverageEnd: string;
		}) => string;
		getExplanationSections: (slot: DutyEventPreviewSlotInstance) => SlotExplanationSection[];
		hasSeriesSlotOverride: (eventDate: string, slot: DutyEventPreviewSlotInstance) => boolean;
		onApply: () => void;
		onCollisionConfirmedChange: (confirmed: boolean) => void;
		onShortfallConfirmedChange: (confirmed: boolean) => void;
		onUpdateSlotAssignee: (eventDate: string, slot: DutyEventPreviewSlotInstance, assigneeId: string | null) => void;
		onToggleSlotLock: (eventDate: string, slot: DutyEventPreviewSlotInstance) => void;
		onClearSlot: (eventDate: string, slot: DutyEventPreviewSlotInstance) => void;
		onResetSlot: (eventDate: string, slot: DutyEventPreviewSlotInstance) => void;
	}

	let {
		preview,
		template,
		overrides,
		eyebrow = 'Series preview ready',
		meta = `${preview.eventDates.length} event${preview.eventDates.length === 1 ? '' : 's'} · ${preview.pattern}`,
		applyLabel = 'Apply Series',
		applyingLabel = 'Applying Series...',
		isRefreshing,
		isApplying,
		collisionReviewConfirmed,
		shortfallReviewConfirmed,
		previewCollisionMessages,
		personnelOptions,
		formatAssignee,
		formatCoverageLabel,
		getExplanationSections,
		hasSeriesSlotOverride,
		onApply,
		onCollisionConfirmedChange,
		onShortfallConfirmedChange,
		onUpdateSlotAssignee,
		onToggleSlotLock,
		onClearSlot,
		onResetSlot
	}: Props = $props();

	type ViewMode = 'by-date' | 'by-pool';
	let viewMode = $state<ViewMode>('by-date');

	const previewRequiresCollisionReview = $derived(previewCollisionMessages.length > 0);
	const previewHasShortfalls = $derived(preview.events.some((event) => event.fillSummary.unfilledSlots > 0));
	const canApply = $derived(
		!isApplying &&
			!isRefreshing &&
			!(previewRequiresCollisionReview && !collisionReviewConfirmed) &&
			!(previewHasShortfalls && !shortfallReviewConfirmed)
	);

	// Build pool-based view data
	const poolKeys = $derived([...new Set(template.slots.map((slot) => slot.rotationPoolKey))].sort());
	const poolView = $derived.by(() => {
		return poolKeys.map((poolKey) => {
			const poolSlotIds = new Set(
				template.slots.filter((slot) => slot.rotationPoolKey === poolKey).map((slot) => slot.id)
			);
			const entries = preview.events.flatMap((event) =>
				event.slotInstances
					.filter((slot) => slot.templateSlotId && poolSlotIds.has(slot.templateSlotId))
					.map((slot) => ({ eventDate: event.eventDate, slot }))
			);

			const seededCount = entries.filter((e) => e.slot.fairnessConfidence !== 'low').length;
			const totalCount = entries.length;
			const lowConfidenceCount = entries.filter((e) => e.slot.fairnessConfidence === 'low').length;

			return { poolKey, entries, seededCount, totalCount, lowConfidenceCount };
		});
	});
</script>

<section class="preview-card" aria-label="Advanced event preview">
	<div class="preview-header">
		<div>
			<p class="eyebrow">{eyebrow}</p>
			<h4>{preview.templateName}</h4>
			<p class="template-meta">{meta}</p>
			{#if isRefreshing}
				<p class="template-meta">Refreshing preview around your edits...</p>
			{/if}
		</div>
		<button class="btn btn-primary" type="button" disabled={!canApply} onclick={onApply}>
			{isApplying ? applyingLabel : applyLabel}
		</button>
	</div>

	{#if previewRequiresCollisionReview}
		<div class="collision-wrapper">
			<CollisionReviewPanel
				messages={previewCollisionMessages}
				confirmed={collisionReviewConfirmed}
				onConfirmedChange={onCollisionConfirmedChange}
				applyLabel="applying the run"
			/>
		</div>
	{/if}

	{#if previewHasShortfalls}
		<div class="collision-wrapper">
			<label class="checkbox-row">
				<input
					type="checkbox"
					checked={shortfallReviewConfirmed}
					onchange={(event) => onShortfallConfirmedChange((event.currentTarget as HTMLInputElement).checked)}
				/>
				<span>I understand this run still has unfilled duty slots</span>
			</label>
		</div>
	{/if}

	<div class="view-toggle">
		<button
			class="btn btn-sm"
			class:btn-secondary={viewMode !== 'by-date'}
			class:btn-primary={viewMode === 'by-date'}
			type="button"
			onclick={() => (viewMode = 'by-date')}
		>
			By Date
		</button>
		<button
			class="btn btn-sm"
			class:btn-secondary={viewMode !== 'by-pool'}
			class:btn-primary={viewMode === 'by-pool'}
			type="button"
			onclick={() => (viewMode = 'by-pool')}
		>
			By Pool
		</button>
	</div>

	{#if viewMode === 'by-date'}
		<div class="slot-preview-list">
			{#each preview.events as event (event.eventDate)}
				<article class="slot-preview-item">
					<div>
						<h5>{event.eventDate}</h5>
						<p class="template-meta">{formatCoverageLabel(event)}</p>
						<p class="summary-line">
							Fill: <strong>{event.fillSummary.filledSlots}/{event.fillSummary.totalSlots}</strong>
						</p>
					</div>
					<div class="slot-preview-list nested-list">
						{#each event.slotInstances as slot (`${event.eventDate}-${slot.roleLabel}-${slot.slotIndex}`)}
							<SlotPreviewItem
								{slot}
								eventDate={event.eventDate}
								{personnelOptions}
								{formatAssignee}
								{getExplanationSections}
								isLoading={isRefreshing || isApplying}
								hasOverride={hasSeriesSlotOverride(event.eventDate, slot)}
								showResetButton={true}
								onUpdateAssignee={(id) => onUpdateSlotAssignee(event.eventDate, slot, id)}
								onToggleLock={() => onToggleSlotLock(event.eventDate, slot)}
								onClear={() => onClearSlot(event.eventDate, slot)}
								onReset={() => onResetSlot(event.eventDate, slot)}
							/>
						{/each}
					</div>
				</article>
			{/each}
		</div>
	{:else}
		<div class="pool-view-list">
			{#each poolView as pool (pool.poolKey)}
				<article class="pool-card">
					<div class="pool-header">
						<div>
							<p class="eyebrow">Rotation pool</p>
							<h5>{pool.poolKey}</h5>
							<p class="template-meta">
								{pool.entries.length} slot{pool.entries.length === 1 ? '' : 's'} across series
								{#if pool.lowConfidenceCount > 0}
									· <span class="confidence-warn">{pool.lowConfidenceCount} low confidence</span>
								{/if}
							</p>
						</div>
					</div>
					<div class="pool-entry-list">
						{#each pool.entries as entry (`${entry.eventDate}-${entry.slot.roleLabel}-${entry.slot.slotIndex}`)}
							<div class="pool-entry-row">
								<span class="pool-entry-date">{entry.eventDate}</span>
								<span class="pool-entry-role">{entry.slot.roleLabel} #{entry.slot.slotIndex + 1}</span>
								<span class="pool-entry-assignee">{formatAssignee(entry.slot.assigneeId)}</span>
								{#if entry.slot.fairnessConfidence === 'low'}
									<span class="confidence-badge confidence-low">Low</span>
								{:else if entry.slot.fairnessConfidence === 'medium'}
									<span class="confidence-badge confidence-med">Medium</span>
								{:else}
									<span class="confidence-badge confidence-high">High</span>
								{/if}
							</div>
						{/each}
					</div>
				</article>
			{/each}
		</div>
	{/if}
</section>

<style>
	.preview-card {
		padding: var(--sp-4);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-lg);
		background: var(--surface-panel);
	}

	.preview-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--sp-4);
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

	h4,
	h5 {
		margin: 0;
	}

	.template-meta,
	.summary-line {
		margin: var(--sp-2) 0 0;
		color: var(--text-secondary);
	}

	.collision-wrapper {
		margin-top: var(--sp-4);
	}

	.view-toggle {
		display: flex;
		gap: var(--sp-2);
		margin-top: var(--sp-4);
	}

	.slot-preview-list {
		display: grid;
		gap: var(--sp-3);
		margin-top: var(--sp-4);
	}

	.slot-preview-item {
		display: grid;
		gap: var(--sp-3);
		padding: var(--sp-4);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-md);
		background: var(--surface-subtle);
	}

	.nested-list {
		margin-top: 0;
	}

	.pool-view-list {
		display: grid;
		gap: var(--sp-4);
		margin-top: var(--sp-4);
	}

	.pool-card {
		border: 1px solid var(--border-default);
		border-radius: var(--radius-lg);
		background: var(--surface-panel);
		overflow: clip;
	}

	.pool-header {
		padding: var(--sp-4);
		border-bottom: 1px solid var(--border-subtle);
	}

	.pool-entry-list {
		display: grid;
	}

	.pool-entry-row {
		display: grid;
		grid-template-columns: 120px 1fr 1fr auto;
		gap: var(--sp-3);
		align-items: center;
		padding: 10px var(--sp-4);
		border-top: 1px solid var(--border-subtle);
		font-size: var(--text-sm);
	}

	.pool-entry-row:first-child {
		border-top: none;
	}

	.pool-entry-date {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		color: var(--text-secondary);
	}

	.pool-entry-role {
		color: var(--text-secondary);
	}

	.pool-entry-assignee {
		color: var(--text-primary);
		font-weight: var(--font-weight-medium);
	}

	.confidence-badge {
		display: inline-flex;
		align-items: center;
		padding: 2px 6px;
		border-radius: 999px;
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
	}

	.confidence-high {
		background: color-mix(in srgb, var(--surface-subtle) 40%, transparent);
		color: var(--text-tertiary);
	}

	.confidence-med {
		background: color-mix(in srgb, var(--amber-light) 50%, var(--surface-panel) 50%);
		color: var(--amber-dark);
	}

	.confidence-low {
		background: color-mix(in srgb, var(--amber-light) 78%, var(--surface-panel) 22%);
		color: var(--amber-dark);
	}

	.confidence-warn {
		color: var(--amber-dark);
	}

	@media (max-width: 640px) {
		.pool-entry-row {
			grid-template-columns: 1fr;
			gap: var(--sp-1);
			padding: var(--sp-3);
		}
	}
</style>
