<script lang="ts">
	import type { DutyEvent, DutyEventPreview, DutyEventPreviewSlotInstance } from '../duty-roster.types';
	import type { Personnel } from '$lib/types';
	import CollisionReviewPanel from './CollisionReviewPanel.svelte';
	import SlotPreviewItem from './SlotPreviewItem.svelte';
	import type { SlotExplanationSection } from './SlotPreviewItem.svelte';

	interface Props {
		event: DutyEvent;
		preview: DutyEventPreview;
		isLoadingPreview: boolean;
		isRefreshing: boolean;
		isSaving: boolean;
		collisionReviewConfirmed: boolean;
		collisionMessages: string[];
		personnelOptions: Personnel[];
		formatAssignee: (id: string | null) => string;
		formatDisplayDate: (date: string) => string;
		formatCoverageLabel: (event: DutyEvent) => string;
		getExplanationSections: (slot: DutyEventPreviewSlotInstance) => SlotExplanationSection[];
		onSave: () => void;
		onRegenerate: () => void;
		onExportPacket: () => void;
		onCollisionConfirmedChange: (confirmed: boolean) => void;
		onUpdateSlotAssignee: (slot: DutyEventPreviewSlotInstance, assigneeId: string | null) => void;
		onToggleSlotLock: (slot: DutyEventPreviewSlotInstance) => void;
		onClearSlot: (slot: DutyEventPreviewSlotInstance) => void;
		onRegenerateSlot: (slot: DutyEventPreviewSlotInstance) => void;
	}

	let {
		event,
		preview,
		isLoadingPreview,
		isRefreshing,
		isSaving,
		collisionReviewConfirmed,
		collisionMessages,
		personnelOptions,
		formatAssignee,
		formatDisplayDate,
		formatCoverageLabel,
		getExplanationSections,
		onSave,
		onRegenerate,
		onExportPacket,
		onCollisionConfirmedChange,
		onUpdateSlotAssignee,
		onToggleSlotLock,
		onClearSlot,
		onRegenerateSlot
	}: Props = $props();

	const requiresCollisionReview = $derived(collisionMessages.length > 0);
	const canSave = $derived(
		!isLoadingPreview && !isRefreshing && !isSaving && !(requiresCollisionReview && !collisionReviewConfirmed)
	);
	const isLocked = $derived(isLoadingPreview || isRefreshing || isSaving);
</script>

<section class="applied-event-editor" aria-label="Applied duty event editor">
	<div class="editor-header">
		<div>
			<p class="eyebrow">Applied event editor</p>
			<h4>Edit applied duty event</h4>
			<p class="editor-meta">
				{event.templateName} · {formatDisplayDate(event.eventDate)} · {formatCoverageLabel(event)}
			</p>
			{#if isLoadingPreview || isRefreshing}
				<p class="editor-meta">Refreshing this event around your edits...</p>
			{/if}
		</div>
		<div class="editor-actions">
			<button class="btn btn-secondary btn-sm" type="button" disabled={isLocked} onclick={onExportPacket}>
				Export Duty Packet
			</button>
			<button class="btn btn-secondary btn-sm" type="button" disabled={isRefreshing || isSaving} onclick={onRegenerate}>
				Regenerate Event
			</button>
			<button class="btn btn-primary" type="button" disabled={!canSave} onclick={onSave}>
				{isSaving ? 'Saving Event...' : 'Save Event'}
			</button>
		</div>
	</div>

	{#if requiresCollisionReview}
		<div class="collision-wrapper">
			<CollisionReviewPanel
				messages={collisionMessages}
				confirmed={collisionReviewConfirmed}
				onConfirmedChange={onCollisionConfirmedChange}
				applyLabel="saving this event"
			/>
		</div>
	{/if}

	<div class="slot-list">
		<article class="event-card">
			<div class="event-card-header">
				<h5>{formatDisplayDate(preview.eventDate)}</h5>
				<p class="editor-meta">
					{formatCoverageLabel(event)} · {preview.fillSummary.filledSlots}/{preview.fillSummary.totalSlots} filled
				</p>
			</div>
			<div class="slot-grid">
				{#each preview.slotInstances as slot (`${slot.roleLabel}-${slot.slotIndex}`)}
					<SlotPreviewItem
						{slot}
						eventDate={preview.eventDate}
						{personnelOptions}
						{formatAssignee}
						{getExplanationSections}
						isLoading={isLocked}
						onUpdateAssignee={(id) => onUpdateSlotAssignee(slot, id)}
						onToggleLock={() => onToggleSlotLock(slot)}
						onClear={() => onClearSlot(slot)}
						onRegenerateSlot={() => onRegenerateSlot(slot)}
					/>
				{/each}
			</div>
		</article>
	</div>
</section>

<style>
	.applied-event-editor {
		padding: var(--sp-4);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-lg);
		background: var(--surface-panel);
	}

	.editor-header {
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

	.editor-meta {
		margin: var(--sp-2) 0 0;
		color: var(--text-secondary);
	}

	.editor-actions {
		display: flex;
		gap: var(--sp-2);
		flex-wrap: wrap;
		justify-content: flex-end;
		flex-shrink: 0;
	}

	.collision-wrapper {
		margin-top: var(--sp-4);
	}

	.slot-list {
		margin-top: var(--sp-4);
	}

	.event-card {
		display: grid;
		gap: var(--sp-3);
		padding: var(--sp-4);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-md);
		background: var(--surface-subtle);
	}

	.event-card-header {
		display: grid;
		gap: 4px;
	}

	.slot-grid {
		display: grid;
		gap: var(--sp-2);
	}
</style>
