<script lang="ts">
	import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';
	import { toastStore } from '$lib/stores/toast.svelte';
	import AppliedEventsSection from './AppliedEventsSection.svelte';
	import AppliedEventEditorModal from './AppliedEventEditorModal.svelte';
	import AdvancedDa6Modal from './AdvancedDa6Modal.svelte';
	import type { Personnel } from '$lib/types';
	import { buildTeamDutyPacketExportModel } from '../advanced-run/advancedDutyRun';
	import { printAdvancedDutyDa6Matrices } from './advancedDutyDa6Print';
	import type {
		AdvancedDutyDa6Matrix,
		AdvancedDutyRunSnapshotRecord,
		AdvancedDutyRevisionDraftRecord,
		AdvancedDutyRevisionDraftSession,
		AdvancedDutyRevisionHistoryEntry,
		AdvancedDutyRevisionReapplyResult,
		DutyEvent,
		DutyEventPreview,
		DutyEventPreviewSlotInstance,
		DutyEventRunDeleteResult,
		DutyEventSlotOverrideInput,
		ExistingDutyEventInput
	} from '../duty-roster.types';
	import {
		buildAppliedEventGroups,
		buildDutyPacketMarkup,
		buildNextAppliedEventOverrides,
		buildSlotOverridesFromPreview,
		findAppliedEventSlotOverride,
		formatAppliedFillSummary,
		formatAppliedGroupRange,
		formatCoverageLabel,
		formatDisplayDate,
		formatSlotAssignee,
		getSlotExplanationSections,
		type AppliedEventRunGroup
	} from './dutyRosterWizard.helpers';

	interface Props {
		advancedDutyEvents: DutyEvent[];
		advancedDutySnapshots?: AdvancedDutyRunSnapshotRecord[];
		advancedDutyRevisionHistory?: AdvancedDutyRevisionHistoryEntry[];
		personnelById: Map<string, Personnel>;
		previewPersonnelOptions: Personnel[];
		onStartAdvancedRevisionDraft: (input: { dutyEventId: string }) => Promise<AdvancedDutyRevisionDraftSession | null>;
		onUpdateAdvancedRevisionDraft: (input: ExistingDutyEventInput) => Promise<AdvancedDutyRevisionDraftSession | null>;
		onDiscardAdvancedRevisionDraft: (input: { dutyEventId: string }) => Promise<AdvancedDutyRevisionDraftRecord | null>;
		onReapplyAdvancedRevisionDraft: (input: {
			dutyEventId: string;
			reason: string;
			reviewableConflictsConfirmed: boolean;
		}) => Promise<AdvancedDutyRevisionReapplyResult>;
		onDeleteAdvancedEvent: (dutyEventId: string) => Promise<boolean>;
		onDeleteAdvancedRun: (runId: string) => Promise<DutyEventRunDeleteResult | null>;
		onDeleteLegacyAdvancedGroup: (eventIds: string[]) => Promise<DutyEventRunDeleteResult | null>;
	}

	let {
		advancedDutyEvents,
		advancedDutySnapshots = [],
		advancedDutyRevisionHistory = [],
		personnelById,
		previewPersonnelOptions,
		onStartAdvancedRevisionDraft,
		onUpdateAdvancedRevisionDraft,
		onDiscardAdvancedRevisionDraft,
		onReapplyAdvancedRevisionDraft,
		onDeleteAdvancedEvent,
		onDeleteAdvancedRun,
		onDeleteLegacyAdvancedGroup
	}: Props = $props();

	let appliedAdvancedEvents = $derived(
		[...advancedDutyEvents].sort((a, b) => b.coverageStart.localeCompare(a.coverageStart))
	);
	let selectedAppliedEventId = $state<string | null>(null);
	let appliedEventPreview = $state<DutyEventPreview | null>(null);
	let appliedEventRevisionDraft = $state<AdvancedDutyRevisionDraftRecord | null>(null);
	let appliedEventOverrides = $state<DutyEventSlotOverrideInput[]>([]);
	let appliedEventCollisionReviewConfirmed = $state(false);
	let isLoadingAppliedEventPreview = $state(false);
	let isRefreshingAppliedEventPreview = $state(false);
	let isSavingAppliedEvent = $state(false);
	let isDiscardingRevisionDraft = $state(false);
	let isReapplyingRevisionDraft = $state(false);
	let revisionReapplyReason = $state('');
	let revisionReapplyError = $state<string | null>(null);
	let pendingEventDelete = $state<DutyEvent | null>(null);
	let pendingRunDelete = $state<AppliedEventRunGroup | null>(null);
	let selectedDa6Snapshot = $state<AdvancedDutyRunSnapshotRecord | null>(null);

	const appliedEventGroups = $derived.by(() => buildAppliedEventGroups(appliedAdvancedEvents));
	const revisionHistoryByRunId = $derived.by(() => {
		const historyByRun: Record<string, AdvancedDutyRevisionHistoryEntry[]> = {};
		for (const entry of advancedDutyRevisionHistory) {
			historyByRun[entry.appliedRunId] = [...(historyByRun[entry.appliedRunId] ?? []), entry];
		}
		for (const [runId, entries] of Object.entries(historyByRun)) {
			historyByRun[runId] = [...entries].sort((left, right) => right.appliedAt.localeCompare(left.appliedAt));
		}
		return historyByRun;
	});
	const selectedAppliedEvent = $derived(
		selectedAppliedEventId ? (appliedAdvancedEvents.find((event) => event.id === selectedAppliedEventId) ?? null) : null
	);
	const appliedEventCollisionMessages = $derived(appliedEventPreview?.collisionSummary.conflicts ?? []);
	const appliedSnapshotByRunId = $derived.by(
		() =>
			new Map(
				advancedDutySnapshots
					.filter((snapshot) => snapshot.status === 'applied' && snapshot.appliedRunId)
					.map((snapshot) => [snapshot.appliedRunId as string, snapshot] as const)
			)
	);
	const selectedDa6Matrices = $derived.by(() => getSnapshotDa6Matrices(selectedDa6Snapshot));
	const da6SnapshotByRunId = $derived.by(
		() =>
			new Map(
				advancedDutySnapshots
					.filter((snapshot) => snapshot.status === 'applied' && snapshot.appliedRunId)
					.map((snapshot) => [snapshot.appliedRunId as string, getSnapshotDa6Matrices(snapshot)] as const)
					.filter(([, matrices]) => matrices.length > 0)
			)
	);

	function getSnapshotDa6Matrices(snapshot: AdvancedDutyRunSnapshotRecord | null): AdvancedDutyDa6Matrix[] {
		const payload = snapshot?.snapshotPayload as { da6Matrices?: AdvancedDutyDa6Matrix[] } | undefined;
		return payload?.da6Matrices ?? [];
	}

	function clearDeleteRequests() {
		pendingEventDelete = null;
		pendingRunDelete = null;
	}

	function exportAppliedDutyPacket() {
		if (!selectedAppliedEvent || !appliedEventPreview) return;
		const packetMarkup = buildDutyPacketMarkup(
			buildTeamDutyPacketExportModel({
				templateName: selectedAppliedEvent.templateName,
				event: appliedEventPreview,
				personnelById,
				status: 'applied'
			})
		);
		const fileDate = appliedEventPreview.eventDate.replaceAll('-', '');
		const blob = new Blob([packetMarkup], { type: 'text/html;charset=utf-8' });
		const url = URL.createObjectURL(blob);
		const anchor = document.createElement('a');
		anchor.href = url;
		anchor.download = `${selectedAppliedEvent.templateName.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-')}-${fileDate}-team-duty-packet.html`;
		document.body.append(anchor);
		anchor.click();
		anchor.remove();
		URL.revokeObjectURL(url);
	}

	function openAppliedRunDa6(group: AppliedEventRunGroup) {
		if (!group.runId) return;
		const snapshot = appliedSnapshotByRunId.get(group.runId) ?? null;
		if (!snapshot || getSnapshotDa6Matrices(snapshot).length === 0) {
			toastStore.warning('DA6 audit data is not available for this applied run yet.');
			return;
		}
		selectedDa6Snapshot = snapshot;
	}

	function canViewAppliedRunDa6(group: AppliedEventRunGroup): boolean {
		return Boolean(group.runId && da6SnapshotByRunId.has(group.runId));
	}

	async function openAppliedEventEditor(event: DutyEvent) {
		const eventId = event.id;
		selectedAppliedEventId = eventId;
		appliedEventPreview = null;
		appliedEventOverrides = [];
		appliedEventCollisionReviewConfirmed = false;
		revisionReapplyReason = '';
		revisionReapplyError = null;
		isLoadingAppliedEventPreview = true;
		try {
			const session = await onStartAdvancedRevisionDraft({ dutyEventId: event.id });
			if (session && selectedAppliedEventId === eventId) {
				appliedEventRevisionDraft = session.draft;
				appliedEventPreview = session.preview;
				appliedEventOverrides = buildSlotOverridesFromPreview(session.preview.slotInstances);
			}
		} finally {
			if (selectedAppliedEventId === eventId) {
				isLoadingAppliedEventPreview = false;
			}
		}
	}

	async function refreshAppliedEventPreview(nextOverrides: DutyEventSlotOverrideInput[]) {
		if (!selectedAppliedEventId) return;
		const eventId = selectedAppliedEventId;
		isRefreshingAppliedEventPreview = true;
		appliedEventOverrides = nextOverrides;
		revisionReapplyError = null;
		try {
			const session = await onUpdateAdvancedRevisionDraft({ dutyEventId: eventId, slotOverrides: nextOverrides });
			if (session && selectedAppliedEventId === eventId) {
				appliedEventRevisionDraft = session.draft;
				appliedEventPreview = session.preview;
				appliedEventCollisionReviewConfirmed = false;
			}
		} finally {
			if (selectedAppliedEventId === eventId) {
				isRefreshingAppliedEventPreview = false;
			}
		}
	}

	async function updateAppliedEventSlotAssignee(slot: DutyEventPreviewSlotInstance, assigneeId: string | null) {
		const existingOverride = findAppliedEventSlotOverride(appliedEventOverrides, slot);
		await refreshAppliedEventPreview(
			buildNextAppliedEventOverrides(appliedEventOverrides, slot, {
				templateSlotId: slot.templateSlotId,
				slotIndex: slot.slotIndex,
				assigneeId,
				assignmentSource:
					existingOverride?.assignmentSource === 'locked' || slot.assignmentSource === 'locked' ? 'locked' : 'manual'
			})
		);
	}

	async function toggleAppliedEventSlotLock(slot: DutyEventPreviewSlotInstance) {
		const existingOverride = findAppliedEventSlotOverride(appliedEventOverrides, slot);
		await refreshAppliedEventPreview(
			buildNextAppliedEventOverrides(appliedEventOverrides, slot, {
				templateSlotId: slot.templateSlotId,
				slotIndex: slot.slotIndex,
				assigneeId: slot.assigneeId,
				assignmentSource:
					existingOverride?.assignmentSource === 'locked' || slot.assignmentSource === 'locked' ? 'manual' : 'locked'
			})
		);
	}

	async function clearAppliedEventSlot(slot: DutyEventPreviewSlotInstance) {
		const existingOverride = findAppliedEventSlotOverride(appliedEventOverrides, slot);
		await refreshAppliedEventPreview(
			buildNextAppliedEventOverrides(appliedEventOverrides, slot, {
				templateSlotId: slot.templateSlotId,
				slotIndex: slot.slotIndex,
				assigneeId: null,
				assignmentSource:
					existingOverride?.assignmentSource === 'locked' || slot.assignmentSource === 'locked' ? 'locked' : 'manual'
			})
		);
	}

	async function discardRevisionDraft() {
		if (!selectedAppliedEventId) return;
		isDiscardingRevisionDraft = true;
		try {
			const discarded = await onDiscardAdvancedRevisionDraft({ dutyEventId: selectedAppliedEventId });
			if (discarded) {
				closeAppliedEventEditor();
			}
		} finally {
			isDiscardingRevisionDraft = false;
		}
	}

	async function reapplyRevisionDraft() {
		if (!selectedAppliedEventId || !appliedEventRevisionDraft) return;
		const reason = revisionReapplyReason.trim();
		if (!reason) {
			revisionReapplyError = 'Enter a reason before reapplying this Advanced Duty revision.';
			return;
		}
		if (appliedEventCollisionMessages.length > 0 && !appliedEventCollisionReviewConfirmed) {
			revisionReapplyError = 'Confirm reviewable conflicts before reapplying this Advanced Duty revision.';
			return;
		}

		isReapplyingRevisionDraft = true;
		revisionReapplyError = null;
		try {
			const result = await onReapplyAdvancedRevisionDraft({
				dutyEventId: selectedAppliedEventId,
				reason,
				reviewableConflictsConfirmed: appliedEventCollisionReviewConfirmed
			});
			if (result.updatedEvents.length > 0) {
				const updatedById = new Map(result.updatedEvents.map((event) => [event.id, event] as const));
				appliedAdvancedEvents = appliedAdvancedEvents.map((event) => updatedById.get(event.id) ?? event);
			}
			closeAppliedEventEditor();
		} catch (error) {
			revisionReapplyError = error instanceof Error ? error.message : 'Advanced Duty revision could not be reapplied.';
		} finally {
			isReapplyingRevisionDraft = false;
		}
	}

	function closeAppliedEventEditor() {
		selectedAppliedEventId = null;
		appliedEventPreview = null;
		appliedEventRevisionDraft = null;
		appliedEventOverrides = [];
		appliedEventCollisionReviewConfirmed = false;
		isLoadingAppliedEventPreview = false;
		isRefreshingAppliedEventPreview = false;
		isDiscardingRevisionDraft = false;
		isReapplyingRevisionDraft = false;
		revisionReapplyReason = '';
		revisionReapplyError = null;
	}

	async function confirmDeleteAppliedEvent() {
		if (!pendingEventDelete) return;
		const eventId = pendingEventDelete.id;
		if (await onDeleteAdvancedEvent(eventId)) {
			appliedAdvancedEvents = appliedAdvancedEvents.filter((event) => event.id !== eventId);
		}
		if (selectedAppliedEventId === eventId) {
			closeAppliedEventEditor();
		}
		pendingEventDelete = null;
	}

	async function confirmDeleteAppliedRun() {
		if (!pendingRunDelete) return;
		const group = pendingRunDelete;
		if (group.runId) {
			const result = await onDeleteAdvancedRun(group.runId);
			if (result) {
				const remainingIds = new Set(group.events.map((event) => event.id));
				appliedAdvancedEvents = appliedAdvancedEvents.filter((event) => !remainingIds.has(event.id));
			}
		} else {
			const eventIds = group.events.map((event) => event.id);
			const result = await onDeleteLegacyAdvancedGroup(eventIds);
			if (result) {
				const removed = new Set(eventIds);
				appliedAdvancedEvents = appliedAdvancedEvents.filter((event) => !removed.has(event.id));
			}
		}

		if (selectedAppliedEventId && group.events.some((event) => event.id === selectedAppliedEventId)) {
			closeAppliedEventEditor();
		}
		pendingRunDelete = null;
	}
</script>

<AppliedEventsSection
	groups={appliedEventGroups}
	selectedEventId={selectedAppliedEventId}
	{formatDisplayDate}
	formatGroupRange={formatAppliedGroupRange}
	{formatCoverageLabel}
	formatFillSummary={formatAppliedFillSummary}
	formatSlotAssignee={(id) => formatSlotAssignee(id, personnelById)}
	onOpenEvent={openAppliedEventEditor}
	onViewRunDa6={openAppliedRunDa6}
	canViewRunDa6={canViewAppliedRunDa6}
	onRequestDeleteEvent={(event) => (pendingEventDelete = event)}
	onRequestDeleteRun={(group) => (pendingRunDelete = group)}
	getRevisionHistory={(runId) => (runId ? (revisionHistoryByRunId[runId] ?? []) : [])}
/>

{#if selectedDa6Snapshot && selectedDa6Matrices.length > 0}
	<AdvancedDa6Modal
		title={`${selectedDa6Snapshot.templateName} DA6 matrices`}
		matrices={selectedDa6Matrices}
		onClose={() => (selectedDa6Snapshot = null)}
		onPrint={() =>
			printAdvancedDutyDa6Matrices(
				`${selectedDa6Snapshot?.templateName ?? 'Applied duty run'} DA6 matrices`,
				selectedDa6Matrices
			)}
	/>
{/if}

<AppliedEventEditorModal
	event={selectedAppliedEvent}
	preview={appliedEventPreview}
	isLoadingPreview={isLoadingAppliedEventPreview}
	isRefreshing={isRefreshingAppliedEventPreview}
	isSaving={isSavingAppliedEvent}
	isDiscardingDraft={isDiscardingRevisionDraft}
	isReapplyingDraft={isReapplyingRevisionDraft}
	revisionDraft={appliedEventRevisionDraft}
	reapplyReason={revisionReapplyReason}
	reapplyError={revisionReapplyError}
	collisionReviewConfirmed={appliedEventCollisionReviewConfirmed}
	collisionMessages={appliedEventCollisionMessages}
	personnelOptions={previewPersonnelOptions}
	formatAssignee={(id) => formatSlotAssignee(id, personnelById)}
	{formatDisplayDate}
	{formatCoverageLabel}
	getExplanationSections={getSlotExplanationSections}
	onClose={closeAppliedEventEditor}
	onDiscardDraft={discardRevisionDraft}
	onReapplyDraft={reapplyRevisionDraft}
	onReapplyReasonChange={(reason) => {
		revisionReapplyReason = reason;
		revisionReapplyError = null;
	}}
	onExportPacket={exportAppliedDutyPacket}
	onCollisionConfirmedChange={(value) => (appliedEventCollisionReviewConfirmed = value)}
	onUpdateSlotAssignee={updateAppliedEventSlotAssignee}
	onToggleSlotLock={toggleAppliedEventSlotLock}
	onClearSlot={clearAppliedEventSlot}
/>

{#if pendingRunDelete}
	<ConfirmDialog
		title="Delete Applied History Run?"
		message={`Delete ${pendingRunDelete.eventCount} applied event${pendingRunDelete.eventCount === 1 ? '' : 's'} from ${formatAppliedGroupRange(pendingRunDelete)}? This removes every generated day in this history item.`}
		confirmLabel="Delete Run"
		cancelLabel="Cancel"
		variant="danger"
		onConfirm={confirmDeleteAppliedRun}
		onCancel={clearDeleteRequests}
	/>
{/if}

{#if pendingEventDelete}
	<ConfirmDialog
		title="Delete Applied Day?"
		message={`Delete ${formatDisplayDate(pendingEventDelete.eventDate)} from applied history? If this is the last day in its run, the history item is removed automatically.`}
		confirmLabel="Delete Day"
		cancelLabel="Cancel"
		variant="danger"
		onConfirm={confirmDeleteAppliedEvent}
		onCancel={clearDeleteRequests}
	/>
{/if}
