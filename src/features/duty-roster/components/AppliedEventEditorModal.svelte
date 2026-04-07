<script lang="ts">
	import Modal from '$lib/components/Modal.svelte';
	import Spinner from '$lib/components/ui/Spinner.svelte';
	import AppliedEventEditor from './AppliedEventEditor.svelte';
	import type { Personnel } from '$lib/types';
	import type { DutyEvent, DutyEventPreview, DutyEventPreviewSlotInstance } from '../duty-roster.types';
	import type { SlotExplanationSection } from './dutyRosterWizard.helpers';
	interface Props {
		event: DutyEvent | null;
		preview: DutyEventPreview | null;
		isLoadingPreview: boolean;
		isRefreshing: boolean;
		isSaving: boolean;
		collisionReviewConfirmed: boolean;
		collisionMessages: string[];
		personnelOptions: Personnel[];
		formatAssignee: (id: string | null) => string;
		formatDisplayDate: (date: string) => string;
		formatCoverageLabel: (event: {
			coverageMode: 'all-day' | 'timed';
			coverageStart: string;
			coverageEnd: string;
		}) => string;
		getExplanationSections: (slot: DutyEventPreviewSlotInstance) => SlotExplanationSection[];
		onClose: () => void;
		onSave: () => void;
		onRegenerate: () => void;
		onExportPacket: () => void;
		onCollisionConfirmedChange: (value: boolean) => void;
		onUpdateSlotAssignee: (slot: DutyEventPreviewSlotInstance, assigneeId: string | null) => void;
		onToggleSlotLock: (slot: DutyEventPreviewSlotInstance) => void;
		onClearSlot: (slot: DutyEventPreviewSlotInstance) => void;
		onRegenerateSlot: (slot: DutyEventPreviewSlotInstance) => void;
	}
	let props: Props = $props();
</script>

{#if props.event}
	<Modal
		title={`Edit applied event: ${props.event.templateName} · ${props.formatDisplayDate(props.event.eventDate)}`}
		onClose={props.onClose}
		width="1100px"
		titleId="applied-event-editor-title"
		canClose={!props.isRefreshing && !props.isSaving}
	>
		{#if props.preview}
			<AppliedEventEditor
				event={props.event}
				preview={props.preview}
				isLoadingPreview={props.isLoadingPreview}
				isRefreshing={props.isRefreshing}
				isSaving={props.isSaving}
				collisionReviewConfirmed={props.collisionReviewConfirmed}
				collisionMessages={props.collisionMessages}
				personnelOptions={props.personnelOptions}
				formatAssignee={props.formatAssignee}
				formatDisplayDate={props.formatDisplayDate}
				formatCoverageLabel={props.formatCoverageLabel}
				getExplanationSections={props.getExplanationSections}
				onSave={props.onSave}
				onRegenerate={props.onRegenerate}
				onExportPacket={props.onExportPacket}
				onCollisionConfirmedChange={props.onCollisionConfirmedChange}
				onUpdateSlotAssignee={props.onUpdateSlotAssignee}
				onToggleSlotLock={props.onToggleSlotLock}
				onClearSlot={props.onClearSlot}
				onRegenerateSlot={props.onRegenerateSlot}
			/>
		{:else}
			<div class="applied-editor-loading" aria-live="polite">
				<Spinner size={20} color="var(--text-secondary)" />
				<p>Loading applied event editor...</p>
			</div>
		{/if}
	</Modal>
{/if}

<style>
	.applied-editor-loading {
		display: flex;
		align-items: center;
		gap: var(--sp-3);
		padding: var(--sp-6);
	}
</style>
