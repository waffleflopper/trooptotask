<script lang="ts">
	import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';
	import AppliedEventsSection from './AppliedEventsSection.svelte';
	import AppliedEventEditorModal from './AppliedEventEditorModal.svelte';
	import AdvancedDa6Modal from './AdvancedDa6Modal.svelte';
	import type { Personnel } from '$lib/types';
	import { buildTeamDutyPacketExportModel } from '../advanced-run/advancedDutyRun';
	import { printAdvancedDutyDa6Matrices } from './advancedDutyDa6Print';
	import type {
		AdvancedDutyDa6Matrix,
		AdvancedDutyRunSnapshotRecord,
		DutyEvent,
		DutyEventPreview,
		DutyEventPreviewSlotInstance,
		DutyEventRunDeleteResult,
		DutyEventSlotOverrideInput,
		ExistingDutyEventInput,
		ExistingDutyEventUpdateInput
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
		personnelById: Map<string, Personnel>;
		previewPersonnelOptions: Personnel[];
		onPreviewExistingAdvancedEvent: (input: ExistingDutyEventInput) => Promise<DutyEventPreview | null>;
		onUpdateExistingAdvancedEvent: (input: ExistingDutyEventUpdateInput) => Promise<DutyEvent | null>;
		onDeleteAdvancedEvent: (dutyEventId: string) => Promise<boolean>;
		onDeleteAdvancedRun: (runId: string) => Promise<DutyEventRunDeleteResult | null>;
		onDeleteLegacyAdvancedGroup: (eventIds: string[]) => Promise<DutyEventRunDeleteResult | null>;
	}

	let {
		advancedDutyEvents,
		advancedDutySnapshots = [],
		personnelById,
		previewPersonnelOptions,
		onPreviewExistingAdvancedEvent,
		onUpdateExistingAdvancedEvent,
		onDeleteAdvancedEvent,
		onDeleteAdvancedRun,
		onDeleteLegacyAdvancedGroup
	}: Props = $props();

	let appliedAdvancedEvents = $derived(
		[...advancedDutyEvents].sort((a, b) => b.coverageStart.localeCompare(a.coverageStart))
	);
	let selectedAppliedEventId = $state<string | null>(null);
	let appliedEventPreview = $state<DutyEventPreview | null>(null);
	let appliedEventOverrides = $state<DutyEventSlotOverrideInput[]>([]);
	let appliedEventCollisionReviewConfirmed = $state(false);
	let isLoadingAppliedEventPreview = $state(false);
	let isRefreshingAppliedEventPreview = $state(false);
	let isSavingAppliedEvent = $state(false);
	let pendingEventDelete = $state<DutyEvent | null>(null);
	let pendingRunDelete = $state<AppliedEventRunGroup | null>(null);
	let selectedDa6Snapshot = $state<AdvancedDutyRunSnapshotRecord | null>(null);

	const appliedEventGroups = $derived.by(() => buildAppliedEventGroups(appliedAdvancedEvents));
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
		selectedDa6Snapshot = appliedSnapshotByRunId.get(group.runId) ?? null;
	}

	async function openAppliedEventEditor(event: DutyEvent) {
		const eventId = event.id;
		selectedAppliedEventId = eventId;
		appliedEventPreview = null;
		appliedEventOverrides = [];
		appliedEventCollisionReviewConfirmed = false;
		isLoadingAppliedEventPreview = true;
		try {
			const preview = await onPreviewExistingAdvancedEvent({ dutyEventId: event.id });
			if (preview && selectedAppliedEventId === eventId) {
				appliedEventPreview = preview;
				appliedEventOverrides = buildSlotOverridesFromPreview(preview.slotInstances);
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
		try {
			const preview = await onPreviewExistingAdvancedEvent({ dutyEventId: eventId, slotOverrides: nextOverrides });
			if (preview && selectedAppliedEventId === eventId) {
				appliedEventPreview = preview;
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

	async function regenerateAppliedEventSlot(slot: DutyEventPreviewSlotInstance) {
		await refreshAppliedEventPreview(buildNextAppliedEventOverrides(appliedEventOverrides, slot, null));
	}

	async function regenerateAppliedEvent() {
		await refreshAppliedEventPreview([]);
	}

	async function handleSaveAppliedEvent() {
		if (!selectedAppliedEventId) return;
		isSavingAppliedEvent = true;
		try {
			const result = await onUpdateExistingAdvancedEvent({
				dutyEventId: selectedAppliedEventId,
				slotOverrides: appliedEventOverrides,
				collisionReviewConfirmed:
					appliedEventCollisionMessages.length > 0 ? appliedEventCollisionReviewConfirmed : undefined
			});
			if (result) {
				appliedAdvancedEvents = [result, ...appliedAdvancedEvents.filter((existing) => existing.id !== result.id)].sort(
					(a, b) => b.coverageStart.localeCompare(a.coverageStart)
				);
				appliedEventPreview = {
					templateId: result.templateId,
					templateName: result.templateName,
					eventDate: result.eventDate,
					coverageMode: result.coverageMode,
					coverageStart: result.coverageStart,
					coverageEnd: result.coverageEnd,
					isBlocking: result.isBlocking,
					cooldownHours: result.cooldownHours,
					rulesSnapshot: result.rulesSnapshot,
					fillSummary: result.fillSummary,
					collisionSummary: result.collisionSummary,
					slotInstances: result.slotInstances.map((slot) => ({
						templateSlotId: slot.templateSlotId,
						roleLabel: slot.roleLabel,
						slotIndex: slot.slotIndex,
						assigneeId: slot.assigneeId,
						assignmentSource: slot.assignmentSource,
						warningState: slot.warningState,
						fairnessConfidence: slot.fairnessConfidence,
						selectionReason: slot.selectionReason,
						unfilledReason: slot.unfilledReason,
						sortOrder: slot.sortOrder
					}))
				};
				appliedEventOverrides = buildSlotOverridesFromPreview(appliedEventPreview.slotInstances);
				appliedEventCollisionReviewConfirmed = false;
			}
		} finally {
			isSavingAppliedEvent = false;
		}
	}

	function closeAppliedEventEditor() {
		selectedAppliedEventId = null;
		appliedEventPreview = null;
		appliedEventOverrides = [];
		appliedEventCollisionReviewConfirmed = false;
		isLoadingAppliedEventPreview = false;
		isRefreshingAppliedEventPreview = false;
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
	onRequestDeleteEvent={(event) => (pendingEventDelete = event)}
	onRequestDeleteRun={(group) => (pendingRunDelete = group)}
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
	collisionReviewConfirmed={appliedEventCollisionReviewConfirmed}
	collisionMessages={appliedEventCollisionMessages}
	personnelOptions={previewPersonnelOptions}
	formatAssignee={(id) => formatSlotAssignee(id, personnelById)}
	{formatDisplayDate}
	{formatCoverageLabel}
	getExplanationSections={getSlotExplanationSections}
	onClose={closeAppliedEventEditor}
	onSave={handleSaveAppliedEvent}
	onRegenerate={regenerateAppliedEvent}
	onExportPacket={exportAppliedDutyPacket}
	onCollisionConfirmedChange={(value) => (appliedEventCollisionReviewConfirmed = value)}
	onUpdateSlotAssignee={updateAppliedEventSlotAssignee}
	onToggleSlotLock={toggleAppliedEventSlotLock}
	onClearSlot={clearAppliedEventSlot}
	onRegenerateSlot={regenerateAppliedEventSlot}
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
