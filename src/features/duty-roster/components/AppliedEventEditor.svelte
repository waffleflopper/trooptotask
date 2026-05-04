<script lang="ts">
	import type {
		AdvancedDutyRevisionDraftRecord,
		DutyEvent,
		DutyEventPreview,
		DutyEventPreviewSlotInstance
	} from '../duty-roster.types';
	import { listAdvancedDutyRevisionDraftSlotChanges } from '../advanced-run/advancedDutyRevision';
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
		isReapplyingDraft: boolean;
		revisionDraft: AdvancedDutyRevisionDraftRecord | null;
		reapplyReason: string;
		reapplyError: string | null;
		collisionReviewConfirmed: boolean;
		collisionMessages: string[];
		personnelOptions: Personnel[];
		formatAssignee: (id: string | null) => string;
		formatDisplayDate: (date: string) => string;
		formatCoverageLabel: (event: DutyEvent) => string;
		getExplanationSections: (slot: DutyEventPreviewSlotInstance) => SlotExplanationSection[];
		onDiscardDraft: () => void;
		onReapplyDraft: () => void;
		onReapplyReasonChange: (reason: string) => void;
		onOpenDraftChangeDate: (eventDate: string) => void;
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
		isReapplyingDraft,
		revisionDraft,
		reapplyReason,
		reapplyError,
		collisionReviewConfirmed,
		collisionMessages,
		personnelOptions,
		formatAssignee,
		formatDisplayDate,
		formatCoverageLabel,
		getExplanationSections,
		onDiscardDraft,
		onReapplyDraft,
		onReapplyReasonChange,
		onOpenDraftChangeDate,
		onExportPacket,
		onCollisionConfirmedChange,
		onUpdateSlotAssignee,
		onToggleSlotLock,
		onClearSlot
	}: Props = $props();

	interface RevisionDraftRecoveryState {
		title: string;
		message: string;
		blocksEdits: boolean;
		blocksReapply: boolean;
	}

	function isExpired(timestamp: string): boolean {
		const value = new Date(timestamp).getTime();
		return Number.isFinite(value) && value <= Date.now();
	}

	function recoveryFromReapplyError(error: string | null): RevisionDraftRecoveryState | null {
		if (!error) return null;
		if (/source applied run changed/i.test(error)) {
			return {
				title: 'Applied run changed',
				message:
					'This draft was opened before the applied run changed. Discard this draft and open the event again. Operational duty records were not changed.',
				blocksEdits: true,
				blocksReapply: true
			};
		}
		if (/not found|only active advanced duty revision drafts/i.test(error)) {
			return {
				title: 'Draft changed in another tab',
				message:
					'This draft is no longer the active draft. It may have been applied or discarded in another tab or session. Close this editor and reopen the event to load the current state.',
				blocksEdits: true,
				blocksReapply: true
			};
		}
		if (/expired/i.test(error)) {
			return {
				title: 'Draft expired',
				message:
					'This draft passed its 7-day window. Discard it and open the event again to start a fresh draft. Operational duty records were not changed.',
				blocksEdits: true,
				blocksReapply: true
			};
		}
		return null;
	}

	const requiresCollisionReview = $derived(collisionMessages.length > 0);
	const draftSlotChanges = $derived(revisionDraft ? listAdvancedDutyRevisionDraftSlotChanges(revisionDraft) : []);
	const hasStagedChanges = $derived((revisionDraft?.slotChanges.length ?? 0) > 0);
	const expiredRecoveryState = $derived(
		revisionDraft && isExpired(revisionDraft.expiresAt)
			? {
					title: 'Draft expired',
					message:
						'This draft passed its 7-day window. Discard it and open the event again to start a fresh draft. Operational duty records were not changed.',
					blocksEdits: true,
					blocksReapply: true
				}
			: null
	);
	const recoveryState = $derived(expiredRecoveryState ?? recoveryFromReapplyError(reapplyError));
	const canSave = $derived(
		!isLoadingPreview && !isRefreshing && !isSaving && !(requiresCollisionReview && !collisionReviewConfirmed)
	);
	const isLocked = $derived(isLoadingPreview || isRefreshing || isSaving || isDiscardingDraft || isReapplyingDraft);
	const isDraftRecoveryLocked = $derived(Boolean(recoveryState?.blocksEdits));
	const isEditorInputLocked = $derived(isLocked || isDraftRecoveryLocked);
	const canReapplyDraft = $derived(!isEditorInputLocked && hasStagedChanges && !recoveryState?.blocksReapply);
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

	{#if revisionDraft}
		<form
			class="reapply-panel"
			aria-label="Reapply revision draft"
			onsubmit={(event) => {
				event.preventDefault();
				onReapplyDraft();
			}}
		>
			<div class="reapply-copy">
				<p class="eyebrow">Reapply revision</p>
				<p>
					Enter the leader-approved reason, confirm any reviewable conflicts, then reapply this draft into the
					operational duty record.
				</p>
			</div>
			{#if draftSlotChanges.length > 0}
				<div class="draft-change-list" aria-label="Staged revision changes">
					{#each draftSlotChanges as change (`${change.eventDate}-${change.slotKey}`)}
						<button
							class="draft-change"
							type="button"
							disabled={isEditorInputLocked}
							onclick={() => onOpenDraftChangeDate(change.eventDate)}
						>
							<span>{formatDisplayDate(change.eventDate)}</span>
							<strong>{change.roleLabel ?? change.slotKey} #{(change.slotIndex ?? 0) + 1}</strong>
							<em>{formatAssignee(change.newPersonnelId ?? null)}</em>
						</button>
					{/each}
				</div>
			{/if}
			{#if recoveryState}
				<div class="draft-recovery" role="alert">
					<strong>{recoveryState.title}</strong>
					<p>{recoveryState.message}</p>
				</div>
			{/if}
			<label class="reason-field">
				<span>Reason</span>
				<textarea
					value={reapplyReason}
					rows="3"
					disabled={isEditorInputLocked}
					aria-describedby={reapplyError ? 'revision-reapply-error' : undefined}
					oninput={(event) => onReapplyReasonChange(event.currentTarget.value)}
				></textarea>
			</label>
			{#if reapplyError && !recoveryState}
				<p id="revision-reapply-error" class="reapply-error" role="alert">{reapplyError}</p>
			{/if}
			<div class="reapply-actions">
				<p class="editor-meta">
					{hasStagedChanges
						? `${revisionDraft.slotChanges.length} staged change${revisionDraft.slotChanges.length === 1 ? '' : 's'} ready for review.`
						: 'Stage at least one slot change before reapplying.'}
				</p>
				<button class="btn btn-primary btn-sm" type="submit" disabled={!canReapplyDraft}>
					{isReapplyingDraft ? 'Reapplying...' : 'Reapply Revision'}
				</button>
			</div>
		</form>
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
						isLoading={isEditorInputLocked}
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

	.reapply-panel {
		display: grid;
		gap: var(--sp-3);
		margin-top: var(--sp-4);
		padding: var(--sp-4);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-md);
		background: var(--surface-base);
	}

	.reapply-copy p:last-child {
		margin: 0;
		color: var(--text-secondary);
	}

	.draft-recovery {
		display: grid;
		gap: var(--sp-1);
		padding: 10px 12px;
		border: 1px solid color-mix(in srgb, var(--danger) 30%, var(--border-default) 70%);
		border-radius: var(--radius-sm);
		background: color-mix(in srgb, var(--danger-light) 54%, var(--surface-panel) 46%);
		color: var(--danger-dark);
	}

	.draft-recovery strong {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.draft-recovery p {
		margin: 0;
	}

	.draft-change-list {
		display: grid;
		gap: var(--sp-2);
	}

	.draft-change {
		display: grid;
		grid-template-columns: minmax(110px, 0.7fr) minmax(120px, 1fr) minmax(120px, 1fr);
		gap: var(--sp-2);
		width: 100%;
		padding: var(--sp-2);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-sm);
		background: var(--surface-panel);
		text-align: left;
		color: var(--text-primary);
		cursor: pointer;
	}

	.draft-change:hover:not(:disabled),
	.draft-change:focus-visible {
		border-color: var(--amber);
		background: color-mix(in srgb, var(--amber-light) 34%, var(--surface-panel) 66%);
	}

	.draft-change span,
	.draft-change em {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--text-secondary);
		font-style: normal;
	}

	.draft-change strong {
		color: var(--text-primary);
	}

	.reason-field {
		display: grid;
		gap: var(--sp-2);
		font-weight: var(--font-weight-semibold);
		color: var(--text-primary);
	}

	.reason-field span {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-secondary);
	}

	.reason-field textarea {
		width: 100%;
		min-height: 86px;
		resize: vertical;
		border: 1px solid var(--border-default);
		border-radius: var(--radius-sm);
		background: var(--surface-panel);
		color: var(--text-primary);
		padding: 10px 12px;
		font: inherit;
	}

	.reason-field textarea:focus {
		outline: 2px solid color-mix(in srgb, var(--amber) 40%, transparent);
		border-color: var(--amber);
	}

	.reapply-error {
		margin: 0;
		padding: 8px 10px;
		border: 1px solid color-mix(in srgb, var(--danger) 34%, var(--border-default) 66%);
		border-radius: var(--radius-sm);
		background: color-mix(in srgb, var(--danger-light) 60%, var(--surface-panel) 40%);
		color: var(--danger-dark);
	}

	.reapply-actions {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--sp-3);
		flex-wrap: wrap;
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
