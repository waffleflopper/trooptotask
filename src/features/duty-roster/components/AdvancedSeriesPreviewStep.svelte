<script lang="ts">
	import SeriesPreviewPanel from './SeriesPreviewPanel.svelte';
	import type {
		AdvancedRunUiState,
		DutyEventPreviewSlotInstance,
		DutyEventSeriesEventOverrideInput,
		DutyEventSeriesPattern,
		DutyEventSeriesPreview,
		DutyTemplate,
		DutyTemplateCoverageMode
	} from '../duty-roster.types';
	import type { Personnel } from '$lib/types';
	import type { SlotExplanationSection } from './dutyRosterWizard.helpers';
	interface Props {
		preview: DutyEventSeriesPreview;
		template: DutyTemplate;
		overrides: DutyEventSeriesEventOverrideInput[];
		previewMode: 'series' | 'single' | null;
		isRefreshing: boolean;
		isApplying: boolean;
		collisionReviewConfirmed: boolean;
		shortfallReviewConfirmed: boolean;
		previewCollisionMessages: string[];
		personnelOptions: Personnel[];
		snapshotState?: AdvancedRunUiState;
		canRetryApply?: boolean;
		canRecoverPartialApply?: boolean;
		formatAssignee: (id: string | null) => string;
		formatCoverageLabel: (event: {
			coverageMode: DutyTemplateCoverageMode;
			coverageStart: string;
			coverageEnd: string;
		}) => string;
		formatSeriesPatternLabel: (pattern: DutyEventSeriesPattern) => string;
		getExplanationSections: (slot: DutyEventPreviewSlotInstance) => SlotExplanationSection[];
		hasSeriesSlotOverride: (eventDate: string, slot: DutyEventPreviewSlotInstance) => boolean;
		onBack: () => void;
		onApply: () => void;
		onRegenerate: () => void;
		onExportPreview: () => void;
		onRetryApply?: () => void;
		onRecoverPartialApply?: () => void;
		onCollisionConfirmedChange: (value: boolean) => void;
		onShortfallConfirmedChange: (value: boolean) => void;
		onUpdateSlotAssignee: (eventDate: string, slot: DutyEventPreviewSlotInstance, assigneeId: string | null) => void;
		onToggleSlotLock: (eventDate: string, slot: DutyEventPreviewSlotInstance) => void;
		onClearSlot: (eventDate: string, slot: DutyEventPreviewSlotInstance) => void;
		onResetSlot: (eventDate: string, slot: DutyEventPreviewSlotInstance) => void;
	}
	let props: Props = $props();
</script>

<div class="step-back-row">
	<button class="btn btn-secondary btn-sm" type="button" onclick={props.onBack}>Edit Dates</button>
</div>
<SeriesPreviewPanel
	preview={props.preview}
	template={props.template}
	eyebrow={props.previewMode === 'single' ? 'One-time preview ready' : 'Series preview ready'}
	meta={props.previewMode === 'single'
		? props.formatCoverageLabel(props.preview.events[0])
		: `${props.preview.eventDates.length} event${props.preview.eventDates.length === 1 ? '' : 's'} · ${props.formatSeriesPatternLabel(props.preview.pattern)}`}
	applyLabel={props.previewMode === 'single' ? 'Apply Event' : 'Apply Series'}
	applyingLabel={props.previewMode === 'single' ? 'Applying Event...' : 'Applying Series...'}
	isRefreshing={props.isRefreshing}
	isApplying={props.isApplying}
	collisionReviewConfirmed={props.collisionReviewConfirmed}
	shortfallReviewConfirmed={props.shortfallReviewConfirmed}
	previewCollisionMessages={props.previewCollisionMessages}
	personnelOptions={props.personnelOptions}
	snapshotState={props.snapshotState}
	canRetryApply={props.canRetryApply}
	canRecoverPartialApply={props.canRecoverPartialApply}
	formatAssignee={props.formatAssignee}
	formatCoverageLabel={props.formatCoverageLabel}
	getExplanationSections={props.getExplanationSections}
	hasSeriesSlotOverride={props.hasSeriesSlotOverride}
	onApply={props.onApply}
	onRegenerate={props.onRegenerate}
	onExportPreview={props.onExportPreview}
	onRetryApply={props.onRetryApply}
	onRecoverPartialApply={props.onRecoverPartialApply}
	onCollisionConfirmedChange={props.onCollisionConfirmedChange}
	onShortfallConfirmedChange={props.onShortfallConfirmedChange}
	onUpdateSlotAssignee={props.onUpdateSlotAssignee}
	onToggleSlotLock={props.onToggleSlotLock}
	onClearSlot={props.onClearSlot}
	onResetSlot={props.onResetSlot}
/>

<style>
	.step-back-row {
		margin-bottom: var(--sp-3);
	}
</style>
