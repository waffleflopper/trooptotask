<script lang="ts">
	import type {
		AdvancedDutyRevisionDraftRecord,
		DutyEvent,
		DutyEventPreview,
		DutyEventPreviewSlotInstance
	} from '../duty-roster.types';
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
		isDiscardingDraft: boolean;
		revisionDraft: AdvancedDutyRevisionDraftRecord | null;
		collisionReviewConfirmed: boolean;
		collisionMessages: string[];
		personnelOptions: Personnel[];
		formatAssignee: (id: string | null) => string;
		formatDisplayDate: (date: string) => string;
		formatCoverageLabel: (event: DutyEvent) => string;
		getExplanationSections: (slot: DutyEventPreviewSlotInstance) => SlotExplanationSection[];
		onDiscardDraft: () => void;
		onExportPacket: () => void;
		onCollisionConfirmedChange: (confirmed: boolean) => void;
		onUpdateSlotAssignee: (slot: DutyEventPreviewSlotInstance, assigneeId: string | null) => void;
		onToggleSlotLock: (slot: DutyEventPreviewSlotInstance) => void;
		onClearSlot: (slot: DutyEventPreviewSlotInstance) => void;
	}

	let {
		event,
		preview,
		isLoadingPreview,
		isRefreshing,
		isSaving,
		isDiscardingDraft,
		revisionDraft,
		collisionReviewConfirmed,
		collisionMessages,
		personnelOptions,
		formatAssignee,
		formatDisplayDate,
		formatCoverageLabel,
		getExplanationSections,
		onDiscardDraft,
		onExportPacket,
		onCollisionConfirmedChange,
		onUpdateSlotAssignee,
		onToggleSlotLock,
		onClearSlot
	}: Props = $props();

	const requiresCollisionReview = $derived(collisionMessages.length > 0);
	const canSave = $derived(
		!isLoadingPreview && !isRefreshing && !isSaving && !(requiresCollisionReview && !collisionReviewConfirmed)
	);
	const isLocked = $derived(isLoadingPreview || isRefreshing || isSaving || isDiscardingDraft);
</script>

<section class="applied-event-editor" aria-label="Applied duty event editor">
	<div class="editor-header">
		<div>
			<p class="eyebrow">Revision draft</p>
			<h4>Review applied duty revision</h4>
			<p class="editor-meta">
				{event.templateName} · {formatDisplayDate(event.eventDate)} · {formatCoverageLabel(event)}
			</p>
			{#if revisionDraft}
				<p class="draft-state">
					Draft v{revisionDraft.draftVersion} pending. Changes are staged for review and have not updated the applied event.
				</p>
			{/if}
			{#if isLoadingPreview || isRefreshing}
				<p class="editor-meta">Updating the revision draft around your edits...</p>
			{/if}
		</div>
		<div class="editor-actions">
			<button class="btn btn-secondary btn-sm" type="button" disabled={isLocked} onclick={onExportPacket}>
				Export Duty Packet
			</button>
			<button
				class="btn btn-danger btn-sm"
				type="button"
				disabled={isLocked || !revisionDraft}
				onclick={onDiscardDraft}
			>
				{isDiscardingDraft ? 'Discarding...' : 'Discard Draft'}
			</button>
			<button class="btn btn-secondary btn-sm" type="button" disabled>
				{canSave ? 'Draft Autosaved' : 'Review Required'}
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

	.draft-state {
		margin: var(--sp-3) 0 0;
		padding: 8px 10px;
		border: 1px solid color-mix(in srgb, var(--amber) 34%, var(--border-default) 66%);
		border-radius: var(--radius-sm);
		background: color-mix(in srgb, var(--amber-light) 58%, var(--surface-panel) 42%);
		color: var(--amber-dark);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		letter-spacing: 0.04em;
		text-transform: uppercase;
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
