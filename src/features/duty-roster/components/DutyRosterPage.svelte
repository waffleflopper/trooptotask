<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { tick } from 'svelte';
	import { Toolbar, ToolbarNavGroup, ToolbarViewToggle } from '$lib/components/ui/toolbar';
	import DutyRosterWizard from './DutyRosterWizard.svelte';
	import AdvancedDutyTemplateBuilder from './AdvancedDutyTemplateBuilder.svelte';
	import AppliedEventManager from './AppliedEventManager.svelte';
	import AdvancedSnapshotList from './AdvancedSnapshotList.svelte';
	import { getOrgContext } from '$lib/stores/orgContext.svelte';
	import { statusTypesStore } from '$features/calendar/stores/statusTypes.svelte';
	import { availabilityStore } from '$features/calendar/stores/availability.svelte';
	import { dailyAssignmentsStore } from '$features/calendar/stores/dailyAssignments.svelte';
	import { specialDaysStore } from '$features/calendar/stores/specialDays.svelte';
	import {
		dutyRosterHistoryStore,
		type RosterHistoryItem
	} from '$features/duty-roster/stores/dutyRosterHistory.svelte';
	import { pinnedGroupsStore } from '$lib/stores/pinnedGroups.svelte';
	import { groupAndSortPersonnel } from '$features/personnel/utils/personnelGrouping';
	import { scopePersonnelByGroupScopeSet } from '$lib/utils/scopePersonnel';
	import { groupsStore } from '$lib/stores/groups.svelte';
	import { toastStore } from '$lib/stores/toast.svelte';
	import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
	import type { Personnel } from '$lib/types';
	import type { CalendarWorkspaceData } from '$features/calendar/calendar.types';
	import type {
		DutyEvent,
		DutyEventApplyInput,
		DutyEventPreview,
		DutyEventRunDeleteResult,
		DutyEventSeriesApplyResult,
		DutyEventSeriesInput,
		DutyEventSeriesPreview,
		ExistingDutyEventInput,
		ExistingDutyEventUpdateInput,
		AdvancedDutyRunSnapshotRecord,
		AdvancedDutyRevisionDraftRecord,
		AdvancedDutyRevisionDraftSession,
		AdvancedDutyRevisionHistoryEntry,
		DutyTemplate,
		DutyTemplateWriteInput
	} from '../duty-roster.types';
	import { isResumableAdvancedDutyRunSnapshotStatus } from '../duty-roster.types';
	import {
		mergeDutyEventsIntoTimeline,
		normalizeDutyTemplate,
		normalizeDutyTemplates,
		removeDutyEventsById,
		removeDutyEventsByRunId,
		removeLegacyDutyEvents,
		sortDutyTemplates,
		sortDutyEventsByCoverageStart,
		upsertDutyEventIntoTimeline
	} from '../advancedDutyCollections';

	interface Props {
		data: {
			orgId: string;
			orgName?: string;
			personnel?: Personnel[];
			allPersonnel?: Personnel[];
			calendar?: {
				data?: CalendarWorkspaceData;
			};
			rosterHistory: RosterHistoryItem[];
			advancedDutyTemplates: DutyTemplate[];
			advancedDutyEvents: DutyEvent[];
			advancedDutySnapshots?: AdvancedDutyRunSnapshotRecord[];
			advancedDutyRevisionHistory?: AdvancedDutyRevisionHistoryEntry[];
		};
	}

	let { data }: Props = $props();

	type DutyRosterSection = 'simple-roster' | 'advanced-workspace' | 'advanced-templates';
	type AdvancedWorkspaceView = 'active-run' | 'draft-snapshots' | 'applied-events';

	const org = getOrgContext();
	const canManageCalendarAssignments = $derived(
		org.affordanceForFeatureAction(POLICY_ACTION_CATALOG.calendar.manageAssignments).allowed
	);
	const hasOrganizationScope = $derived(org.scopeSet.kind === 'organization');
	const canMutate = $derived(!org.readOnly && canManageCalendarAssignments);
	const canAccessAdvancedDuty = $derived(hasOrganizationScope && canManageCalendarAssignments);
	const canManageAdvancedTemplates = $derived(!org.readOnly && canAccessAdvancedDuty && org.isPrivileged);
	const workspaceData = $derived(data.calendar?.data ?? data);
	let activeTab = $state<DutyRosterSection>('advanced-workspace');
	let activeAdvancedWorkspaceView = $state<AdvancedWorkspaceView>('active-run');
	let advancedDutySnapshots = $state<AdvancedDutyRunSnapshotRecord[]>([]);
	let loadedSnapshotKey = $state('');
	let resumeSnapshot = $state<AdvancedDutyRunSnapshotRecord | null>(null);
	const resumableAdvancedDutySnapshots = $derived(
		advancedDutySnapshots.filter((snapshot) => isResumableAdvancedDutyRunSnapshotStatus(snapshot.status))
	);
	let advancedDutyTemplates = $derived(normalizeDutyTemplates(data.advancedDutyTemplates ?? []));
	let advancedDutyEvents = $derived(sortDutyEventsByCoverageStart(data.advancedDutyEvents));
	const visibleAdvancedTemplateCount = $derived(
		advancedDutyTemplates.filter((template) => template.status !== 'archived').length
	);

	const dutyRosterTabs = $derived.by(() => {
		const tabs: Array<{ label: string; value: DutyRosterSection; title?: string }> = [
			{
				label: 'Assignments / Taskings',
				value: 'simple-roster',
				title: 'Build daily assignment and tasking rosters'
			}
		];
		if (canAccessAdvancedDuty) {
			tabs.push({
				label: 'Advanced Workspace',
				value: 'advanced-workspace',
				title: 'Configure, review, apply, and inspect advanced duty runs'
			});
		}
		if (canManageAdvancedTemplates) {
			tabs.push({
				label: `Advanced Templates (${visibleAdvancedTemplateCount})`,
				value: 'advanced-templates',
				title: `${visibleAdvancedTemplateCount} active advanced duty templates`
			});
		}
		return tabs;
	});

	const advancedWorkspaceViews = $derived([
		{ label: 'Active Run', value: 'active-run' },
		{ label: `Draft Snapshots (${resumableAdvancedDutySnapshots.length})`, value: 'draft-snapshots' },
		{ label: 'Applied Events', value: 'applied-events' }
	] satisfies Array<{ label: string; value: AdvancedWorkspaceView }>);

	const relatedLinks = $derived([
		{ label: 'Assignments', href: `/org/${org.orgId}/calendar/assignments` },
		{ label: 'Calendar', href: `/org/${org.orgId}/calendar` }
	]);

	$effect(() => {
		if (!canManageAdvancedTemplates && activeTab === 'advanced-templates') {
			activeTab = canAccessAdvancedDuty ? 'advanced-workspace' : 'simple-roster';
		}
		if (!canAccessAdvancedDuty && activeTab === 'advanced-workspace') {
			activeTab = 'simple-roster';
		}
	});

	$effect(() => {
		const snapshots = data.advancedDutySnapshots ?? [];
		const nextKey = snapshots.map((snapshot) => `${snapshot.id}:${snapshot.updatedAt}`).join('|');
		if (nextKey === loadedSnapshotKey) return;
		loadedSnapshotKey = nextKey;
		advancedDutySnapshots = snapshots;
	});

	// ---- Load roster history on mount ----
	$effect(() => {
		dutyRosterHistoryStore.load(data.rosterHistory);
	});

	// ---- Personnel data ----
	const calendarPersonnel = $derived(workspaceData.allPersonnel ?? workspaceData.personnel ?? []);
	const personnelByGroup = $derived(
		groupAndSortPersonnel(calendarPersonnel, {
			pinnedGroups: pinnedGroupsStore.list,
			fallbackGroupName: data.orgName ?? ''
		})
	);
	const scopedPBG = $derived(scopePersonnelByGroupScopeSet(personnelByGroup, org.scopeSet));
	const personnelById = $derived.by(
		() => new Map(scopedPBG.flatMap((group) => group.personnel.map((person) => [person.id, person] as const)))
	);
	const previewPersonnelOptions = $derived.by(() =>
		[...personnelById.values()].sort(
			(a, b) =>
				a.lastName.localeCompare(b.lastName, 'en-US') ||
				a.firstName.localeCompare(b.firstName, 'en-US') ||
				a.id.localeCompare(b.id)
		)
	);

	async function readResponseErrorMessage(res: Response, fallback: string): Promise<string> {
		const raw = await res.text();
		if (!raw) return fallback;
		try {
			const parsed = JSON.parse(raw) as { message?: string; error?: string };
			return parsed.message ?? parsed.error ?? raw;
		} catch {
			return raw;
		}
	}

	async function refreshAdvancedDutyData(): Promise<void> {
		await invalidateAll();
	}

	// ---- Handlers ----
	async function handleApplyRoster(
		assignments: { date: string; assignmentTypeId: string; assigneeId: string }[]
	): Promise<boolean> {
		return await dailyAssignmentsStore.setAssignmentBatch(assignments);
	}

	async function handleSaveRoster(
		payload: Omit<RosterHistoryItem, 'id' | 'createdAt'>
	): Promise<RosterHistoryItem | null> {
		try {
			const res = await fetch(`/org/${org.orgId}/api/duty-roster-history`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload)
			});
			if (!res.ok) return null;
			const item: RosterHistoryItem = await res.json();
			dutyRosterHistoryStore.add(item);
			return item;
		} catch {
			return null;
		}
	}

	async function handleDeleteRoster(id: string): Promise<void> {
		dutyRosterHistoryStore.remove(id);
		try {
			const res = await fetch(`/org/${org.orgId}/api/duty-roster-history/${id}`, { method: 'DELETE' });
			if (!res.ok) {
				dutyRosterHistoryStore.load(data.rosterHistory);
				toastStore.error('Failed to delete roster entry');
			}
		} catch {
			dutyRosterHistoryStore.load(data.rosterHistory);
			toastStore.error('Failed to delete roster entry');
		}
	}

	async function handleUpdateExemptions(assignmentTypeId: string, personnelIds: string[]): Promise<void> {
		await dailyAssignmentsStore.updateType(assignmentTypeId, {
			exemptPersonnelIds: personnelIds
		});
	}

	async function handleCreateAdvancedTemplate(payload: DutyTemplateWriteInput): Promise<DutyTemplate | null> {
		try {
			const res = await fetch(`/org/${org.orgId}/api/duty-templates`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload)
			});

			if (!res.ok) {
				throw new Error(await readResponseErrorMessage(res, 'Failed to save advanced duty template'));
			}

			const item = normalizeDutyTemplate((await res.json()) as DutyTemplate);
			advancedDutyTemplates = sortDutyTemplates([...advancedDutyTemplates, item]);
			await refreshAdvancedDutyData();
			toastStore.success('Advanced duty template saved');
			return item;
		} catch (error) {
			toastStore.error(error instanceof Error ? error.message : 'Failed to save advanced duty template');
			return null;
		}
	}

	async function handleUpdateAdvancedTemplate(
		payload: DutyTemplateWriteInput & { id: string }
	): Promise<DutyTemplate | null> {
		try {
			const res = await fetch(`/org/${org.orgId}/api/duty-templates`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload)
			});

			if (!res.ok) {
				throw new Error(await readResponseErrorMessage(res, 'Failed to update advanced duty template'));
			}

			const item = normalizeDutyTemplate((await res.json()) as DutyTemplate);
			advancedDutyTemplates = sortDutyTemplates(
				advancedDutyTemplates.map((template) => (template.id === item.id ? item : template))
			);
			await refreshAdvancedDutyData();
			toastStore.success('Advanced duty template updated');
			return item;
		} catch (error) {
			toastStore.error(error instanceof Error ? error.message : 'Failed to update advanced duty template');
			return null;
		}
	}

	function handleManageAdvancedTemplates() {
		activeTab = 'advanced-templates';
	}

	function handleRecoverPartialApply() {
		activeAdvancedWorkspaceView = 'applied-events';
	}

	function isSameDraftSnapshotLineage(
		left: AdvancedDutyRunSnapshotRecord,
		right: AdvancedDutyRunSnapshotRecord
	): boolean {
		return (
			left.status === 'draft' &&
			right.status === 'draft' &&
			left.templateId === right.templateId &&
			left.pattern === right.pattern &&
			left.eventDates.join('|') === right.eventDates.join('|')
		);
	}

	function upsertDraftSnapshot(snapshot: AdvancedDutyRunSnapshotRecord | null) {
		if (!snapshot) return;
		advancedDutySnapshots = [
			snapshot,
			...advancedDutySnapshots.filter((item) => item.id !== snapshot.id && !isSameDraftSnapshotLineage(item, snapshot))
		];
	}

	function removeDraftSnapshot(snapshotId: string | undefined) {
		if (!snapshotId) return;
		advancedDutySnapshots = advancedDutySnapshots.filter((snapshot) => snapshot.id !== snapshotId);
		if (resumeSnapshot?.id === snapshotId) {
			resumeSnapshot = null;
		}
	}

	function buildAppliedSnapshotFromDraft(
		snapshotId: string | undefined,
		result: DutyEventSeriesApplyResult
	): AdvancedDutyRunSnapshotRecord | null {
		if (!snapshotId) return null;
		const draft = advancedDutySnapshots.find((snapshot) => snapshot.id === snapshotId);
		if (!draft) return null;
		const previewPayload = draft.previewPayload as { da6Matrices?: unknown };
		const snapshotPayload = draft.snapshotPayload as { da6Matrices?: unknown };
		const da6Matrices = Array.isArray(snapshotPayload.da6Matrices)
			? snapshotPayload.da6Matrices
			: Array.isArray(previewPayload.da6Matrices)
				? previewPayload.da6Matrices
				: undefined;
		const now = new Date().toISOString();
		return {
			...draft,
			status: 'applied',
			appliedRunId: result.run.id,
			appliedAt: now,
			snapshotPayload: da6Matrices ? { ...draft.snapshotPayload, da6Matrices } : draft.snapshotPayload,
			updatedAt: now
		};
	}

	function buildDraftSnapshotFromPreview(
		input: DutyEventSeriesInput | DutyEventApplyInput,
		preview: DutyEventSeriesPreview | DutyEventPreview
	): AdvancedDutyRunSnapshotRecord | null {
		if (!preview.snapshotId || !preview.snapshotFingerprint) return null;
		const isSeriesPreview = 'events' in preview;
		const eventDates = isSeriesPreview ? preview.eventDates : [preview.eventDate];
		const now = new Date();
		return {
			id: preview.snapshotId,
			orgId: org.orgId,
			templateId: preview.templateId,
			templateName: preview.templateName,
			pattern: isSeriesPreview ? preview.pattern : 'single',
			startDate: eventDates[0],
			endDate: eventDates[eventDates.length - 1],
			eventCount: eventDates.length,
			eventDates,
			candidatePersonnelIds: input.candidatePersonnelIds ?? [],
			draftLineageKey: `${preview.templateId}:${isSeriesPreview ? preview.pattern : 'single'}:${eventDates.join('|')}`,
			snapshotFingerprint: preview.snapshotFingerprint,
			snapshotVersion: preview.snapshotVersion ?? 1,
			status: 'draft',
			inputPayload: input as unknown as Record<string, unknown>,
			snapshotPayload: {},
			previewPayload: preview as unknown as Record<string, unknown>,
			exportModel: null,
			createdByUserId: null,
			appliedRunId: null,
			applyError: null,
			expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
			appliedAt: null,
			createdAt: now.toISOString(),
			updatedAt: now.toISOString()
		};
	}

	function hasSnapshotResumePayload(snapshot: AdvancedDutyRunSnapshotRecord): boolean {
		const previewPayload = snapshot.previewPayload;
		return Boolean(
			previewPayload &&
			typeof previewPayload === 'object' &&
			(('events' in previewPayload && Array.isArray((previewPayload as { events?: unknown }).events)) ||
				('eventDate' in previewPayload && typeof (previewPayload as { eventDate?: unknown }).eventDate === 'string'))
		);
	}

	async function loadSnapshotForResume(
		snapshot: AdvancedDutyRunSnapshotRecord
	): Promise<AdvancedDutyRunSnapshotRecord | null> {
		if (hasSnapshotResumePayload(snapshot)) return snapshot;
		try {
			const res = await fetch(`/org/${org.orgId}/api/duty-events/snapshots/${encodeURIComponent(snapshot.id)}`);
			if (!res.ok) {
				throw new Error(await readResponseErrorMessage(res, 'Failed to load advanced duty snapshot'));
			}
			return (await res.json()) as AdvancedDutyRunSnapshotRecord;
		} catch (error) {
			toastStore.error(error instanceof Error ? error.message : 'Failed to load advanced duty snapshot');
			return null;
		}
	}

	async function handleResumeSnapshot(snapshot: AdvancedDutyRunSnapshotRecord) {
		const fullSnapshot = await loadSnapshotForResume(snapshot);
		if (!fullSnapshot) return;
		upsertDraftSnapshot(fullSnapshot);
		resumeSnapshot = fullSnapshot;
		activeAdvancedWorkspaceView = 'active-run';
	}

	async function handleDeleteSnapshot(snapshot: AdvancedDutyRunSnapshotRecord): Promise<boolean> {
		try {
			const res = await fetch(`/org/${org.orgId}/api/duty-events/snapshots/${encodeURIComponent(snapshot.id)}`, {
				method: 'DELETE'
			});
			if (!res.ok) {
				throw new Error(await readResponseErrorMessage(res, 'Failed to delete advanced duty snapshot'));
			}
			removeDraftSnapshot(snapshot.id);
			await refreshAdvancedDutyData();
			toastStore.success('Draft snapshot deleted');
			return true;
		} catch (error) {
			toastStore.error(error instanceof Error ? error.message : 'Failed to delete advanced duty snapshot');
			return false;
		}
	}

	async function refreshResumeSnapshot(snapshotId: string | undefined): Promise<AdvancedDutyRunSnapshotRecord | null> {
		if (!snapshotId) return null;
		await refreshAdvancedDutyData();
		await tick();
		const nextSnapshot = advancedDutySnapshots.find((snapshot) => snapshot.id === snapshotId) ?? null;
		resumeSnapshot = nextSnapshot;
		return nextSnapshot;
	}

	async function handlePreviewAdvancedEvent(payload: DutyEventApplyInput): Promise<DutyEventPreview | null> {
		try {
			const res = await fetch(`/org/${org.orgId}/api/duty-events/preview`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload)
			});

			if (!res.ok) {
				throw new Error(await readResponseErrorMessage(res, 'Failed to preview advanced duty event'));
			}

			const preview = (await res.json()) as DutyEventPreview;
			upsertDraftSnapshot(buildDraftSnapshotFromPreview(payload, preview));
			return preview;
		} catch (error) {
			toastStore.error(error instanceof Error ? error.message : 'Failed to preview advanced duty event');
			return null;
		}
	}

	async function handleApplyAdvancedEvent(payload: DutyEventApplyInput): Promise<DutyEvent | null> {
		try {
			const res = await fetch(`/org/${org.orgId}/api/duty-events`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload)
			});

			if (!res.ok) {
				throw new Error(await readResponseErrorMessage(res, 'Failed to apply advanced duty event'));
			}

			const event = (await res.json()) as DutyEvent;
			removeDraftSnapshot(payload.snapshotId);
			advancedDutyEvents = upsertDutyEventIntoTimeline(advancedDutyEvents, event);
			await refreshAdvancedDutyData();
			toastStore.success('Advanced duty event applied');
			return event;
		} catch (error) {
			await refreshResumeSnapshot(payload.snapshotId);
			toastStore.error(error instanceof Error ? error.message : 'Failed to apply advanced duty event');
			return null;
		}
	}

	async function handlePreviewAdvancedSeries(payload: DutyEventSeriesInput): Promise<DutyEventSeriesPreview | null> {
		try {
			const res = await fetch(`/org/${org.orgId}/api/duty-events/series/preview`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload)
			});

			if (!res.ok) {
				throw new Error(await readResponseErrorMessage(res, 'Failed to preview advanced duty series'));
			}

			const preview = (await res.json()) as DutyEventSeriesPreview;
			upsertDraftSnapshot(buildDraftSnapshotFromPreview(payload, preview));
			return preview;
		} catch (error) {
			toastStore.error(error instanceof Error ? error.message : 'Failed to preview advanced duty series');
			return null;
		}
	}

	async function handleApplyAdvancedSeries(payload: DutyEventSeriesInput): Promise<DutyEventSeriesApplyResult | null> {
		try {
			const res = await fetch(`/org/${org.orgId}/api/duty-events/series`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload)
			});

			if (!res.ok) {
				throw new Error(await readResponseErrorMessage(res, 'Failed to apply advanced duty series'));
			}

			const result = (await res.json()) as DutyEventSeriesApplyResult;
			const appliedSnapshot = buildAppliedSnapshotFromDraft(payload.snapshotId, result);
			if (appliedSnapshot) {
				upsertDraftSnapshot(appliedSnapshot);
			} else {
				removeDraftSnapshot(payload.snapshotId);
			}
			advancedDutyEvents = mergeDutyEventsIntoTimeline(advancedDutyEvents, result.events);
			await refreshAdvancedDutyData();
			toastStore.success(`Applied ${result.events.length} advanced duty event${result.events.length === 1 ? '' : 's'}`);
			return result;
		} catch (error) {
			await refreshResumeSnapshot(payload.snapshotId);
			toastStore.error(error instanceof Error ? error.message : 'Failed to apply advanced duty series');
			return null;
		}
	}

	async function handlePreviewExistingAdvancedEvent(payload: ExistingDutyEventInput): Promise<DutyEventPreview | null> {
		try {
			const res = await fetch(`/org/${org.orgId}/api/duty-events/${payload.dutyEventId}/preview`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					slotOverrides: payload.slotOverrides
				})
			});

			if (!res.ok) {
				throw new Error(await readResponseErrorMessage(res, 'Failed to preview applied duty event'));
			}

			return (await res.json()) as DutyEventPreview;
		} catch (error) {
			toastStore.error(error instanceof Error ? error.message : 'Failed to preview applied duty event');
			return null;
		}
	}

	async function handleUpdateExistingAdvancedEvent(payload: ExistingDutyEventUpdateInput): Promise<DutyEvent | null> {
		try {
			const res = await fetch(`/org/${org.orgId}/api/duty-events/${payload.dutyEventId}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					slotOverrides: payload.slotOverrides,
					collisionReviewConfirmed: payload.collisionReviewConfirmed
				})
			});

			if (!res.ok) {
				throw new Error(await readResponseErrorMessage(res, 'Failed to save applied duty event'));
			}

			const event = (await res.json()) as DutyEvent;
			advancedDutyEvents = upsertDutyEventIntoTimeline(advancedDutyEvents, event);
			await refreshAdvancedDutyData();
			toastStore.success('Applied duty event updated');
			return event;
		} catch (error) {
			toastStore.error(error instanceof Error ? error.message : 'Failed to save applied duty event');
			return null;
		}
	}

	async function handleStartAdvancedRevisionDraft(input: {
		dutyEventId: string;
	}): Promise<AdvancedDutyRevisionDraftSession | null> {
		try {
			const res = await fetch(`/org/${org.orgId}/api/duty-events/${input.dutyEventId}/revision-draft`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' }
			});

			if (!res.ok) {
				throw new Error(await readResponseErrorMessage(res, 'Failed to open revision draft'));
			}

			const session = (await res.json()) as AdvancedDutyRevisionDraftSession;
			toastStore.success(session.action === 'reopened' ? 'Revision draft reopened' : 'Revision draft started');
			return session;
		} catch (error) {
			toastStore.error(error instanceof Error ? error.message : 'Failed to open revision draft');
			return null;
		}
	}

	async function handleUpdateAdvancedRevisionDraft(
		payload: ExistingDutyEventInput
	): Promise<AdvancedDutyRevisionDraftSession | null> {
		try {
			const res = await fetch(`/org/${org.orgId}/api/duty-events/${payload.dutyEventId}/revision-draft`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					slotOverrides: payload.slotOverrides
				})
			});

			if (!res.ok) {
				throw new Error(await readResponseErrorMessage(res, 'Failed to update revision draft'));
			}

			return (await res.json()) as AdvancedDutyRevisionDraftSession;
		} catch (error) {
			toastStore.error(error instanceof Error ? error.message : 'Failed to update revision draft');
			return null;
		}
	}

	async function handleDiscardAdvancedRevisionDraft(input: {
		dutyEventId: string;
	}): Promise<AdvancedDutyRevisionDraftRecord | null> {
		try {
			const res = await fetch(`/org/${org.orgId}/api/duty-events/${input.dutyEventId}/revision-draft`, {
				method: 'DELETE'
			});

			if (!res.ok) {
				throw new Error(await readResponseErrorMessage(res, 'Failed to discard revision draft'));
			}

			const draft = (await res.json()) as AdvancedDutyRevisionDraftRecord;
			toastStore.success('Revision draft discarded');
			return draft;
		} catch (error) {
			toastStore.error(error instanceof Error ? error.message : 'Failed to discard revision draft');
			return null;
		}
	}

	async function handleDeleteAdvancedEvent(dutyEventId: string): Promise<boolean> {
		try {
			const res = await fetch(`/org/${org.orgId}/api/duty-events/${dutyEventId}`, { method: 'DELETE' });
			if (!res.ok) {
				throw new Error(await readResponseErrorMessage(res, 'Failed to delete applied duty event'));
			}
			advancedDutyEvents = removeDutyEventsById(advancedDutyEvents, dutyEventId);
			await refreshAdvancedDutyData();
			toastStore.success('Applied duty event deleted');
			return true;
		} catch (error) {
			toastStore.error(error instanceof Error ? error.message : 'Failed to delete applied duty event');
			return false;
		}
	}

	async function handleDeleteAdvancedRun(runId: string): Promise<DutyEventRunDeleteResult | null> {
		try {
			const res = await fetch(`/org/${org.orgId}/api/duty-events/runs/${runId}`, { method: 'DELETE' });
			if (!res.ok) {
				throw new Error(await readResponseErrorMessage(res, 'Failed to delete applied duty run'));
			}
			const result = (await res.json()) as DutyEventRunDeleteResult;
			advancedDutyEvents = removeDutyEventsByRunId(advancedDutyEvents, runId);
			await refreshAdvancedDutyData();
			toastStore.success(
				`Deleted ${result.deletedEvents} applied duty event${result.deletedEvents === 1 ? '' : 's'} from history`
			);
			return result;
		} catch (error) {
			toastStore.error(error instanceof Error ? error.message : 'Failed to delete applied duty run');
			return null;
		}
	}

	async function handleDeleteLegacyAdvancedGroup(eventIds: string[]): Promise<DutyEventRunDeleteResult | null> {
		try {
			const res = await fetch(`/org/${org.orgId}/api/duty-events/runs/legacy`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ eventIds })
			});
			if (!res.ok) {
				throw new Error(await readResponseErrorMessage(res, 'Failed to delete legacy duty history group'));
			}
			const result = (await res.json()) as DutyEventRunDeleteResult;
			advancedDutyEvents = removeLegacyDutyEvents(advancedDutyEvents, eventIds);
			await refreshAdvancedDutyData();
			toastStore.success(
				`Deleted ${result.deletedEvents} legacy duty event${result.deletedEvents === 1 ? '' : 's'} from history`
			);
			return result;
		} catch (error) {
			toastStore.error(error instanceof Error ? error.message : 'Failed to delete legacy duty history group');
			return null;
		}
	}

	async function handleArchiveAdvancedTemplate(templateId: string): Promise<DutyTemplate | null> {
		try {
			const res = await fetch(`/org/${org.orgId}/api/duty-templates/${templateId}`, { method: 'DELETE' });
			if (!res.ok) {
				throw new Error(await readResponseErrorMessage(res, 'Failed to archive duty template'));
			}
			const item = normalizeDutyTemplate((await res.json()) as DutyTemplate);
			advancedDutyTemplates = sortDutyTemplates(
				advancedDutyTemplates.map((template) => (template.id === item.id ? item : template))
			);
			await refreshAdvancedDutyData();
			toastStore.success('Duty template archived');
			return item;
		} catch (error) {
			toastStore.error(error instanceof Error ? error.message : 'Failed to archive duty template');
			return null;
		}
	}
</script>

<div class="duty-roster-page">
	<Toolbar ariaLabel="Duty roster controls" collapse="medium" leadingMin="24rem">
		{#snippet leading()}
			{#if canMutate}
				<ToolbarViewToggle
					ariaLabel="Duty roster sections"
					options={dutyRosterTabs}
					mode="full"
					value={activeTab}
					onValueChange={(value) => (activeTab = value as typeof activeTab)}
				/>
			{/if}
		{/snippet}

		<ToolbarNavGroup ariaLabel="Related calendar pages" items={relatedLinks} />
	</Toolbar>

	{#if !canMutate}
		<section class="restricted-hero">
			<h1>Access restricted.</h1>
			<p>Calendar operation access is required to manage duty rosters.</p>
		</section>
	{:else if activeTab === 'simple-roster'}
		<DutyRosterWizard
			initialView="simple-template-list"
			assignmentTypes={dailyAssignmentsStore.types}
			assignments={dailyAssignmentsStore.assignments}
			personnelByGroup={scopedPBG}
			groups={groupsStore.names}
			availabilityEntries={availabilityStore.items}
			statusTypes={statusTypesStore.items}
			specialDays={specialDaysStore.items}
			rosterHistory={dutyRosterHistoryStore.items}
			{advancedDutyTemplates}
			{advancedDutyEvents}
			onApplyRoster={handleApplyRoster}
			onSaveRoster={handleSaveRoster}
			onDeleteRoster={handleDeleteRoster}
			onUpdateExemptions={handleUpdateExemptions}
			onPreviewAdvancedEvent={handlePreviewAdvancedEvent}
			onApplyAdvancedEvent={handleApplyAdvancedEvent}
			onPreviewAdvancedSeries={handlePreviewAdvancedSeries}
			onApplyAdvancedSeries={handleApplyAdvancedSeries}
			onPreviewExistingAdvancedEvent={handlePreviewExistingAdvancedEvent}
			onUpdateExistingAdvancedEvent={handleUpdateExistingAdvancedEvent}
			onDeleteAdvancedEvent={handleDeleteAdvancedEvent}
			onDeleteAdvancedRun={handleDeleteAdvancedRun}
			onDeleteLegacyAdvancedGroup={handleDeleteLegacyAdvancedGroup}
			onCreateAdvancedTemplate={handleCreateAdvancedTemplate}
			{canManageAdvancedTemplates}
			onManageAdvancedTemplates={handleManageAdvancedTemplates}
		/>
	{:else if activeTab === 'advanced-workspace'}
		<section class="advanced-workspace" aria-label="Advanced Duty Workspace">
			<div class="advanced-workspace__bar">
				<ToolbarViewToggle
					ariaLabel="Advanced Duty Workspace views"
					options={advancedWorkspaceViews}
					mode="full"
					value={activeAdvancedWorkspaceView}
					onValueChange={(value) => (activeAdvancedWorkspaceView = value as AdvancedWorkspaceView)}
				/>
			</div>

			{#if activeAdvancedWorkspaceView === 'active-run'}
				<DutyRosterWizard
					initialView="advanced-template-list"
					assignmentTypes={dailyAssignmentsStore.types}
					assignments={dailyAssignmentsStore.assignments}
					personnelByGroup={scopedPBG}
					groups={groupsStore.names}
					availabilityEntries={availabilityStore.items}
					statusTypes={statusTypesStore.items}
					specialDays={specialDaysStore.items}
					rosterHistory={dutyRosterHistoryStore.items}
					{advancedDutyTemplates}
					{advancedDutyEvents}
					onApplyRoster={handleApplyRoster}
					onSaveRoster={handleSaveRoster}
					onDeleteRoster={handleDeleteRoster}
					onUpdateExemptions={handleUpdateExemptions}
					onPreviewAdvancedEvent={handlePreviewAdvancedEvent}
					onApplyAdvancedEvent={handleApplyAdvancedEvent}
					onPreviewAdvancedSeries={handlePreviewAdvancedSeries}
					onApplyAdvancedSeries={handleApplyAdvancedSeries}
					onPreviewExistingAdvancedEvent={handlePreviewExistingAdvancedEvent}
					onUpdateExistingAdvancedEvent={handleUpdateExistingAdvancedEvent}
					onDeleteAdvancedEvent={handleDeleteAdvancedEvent}
					onDeleteAdvancedRun={handleDeleteAdvancedRun}
					onDeleteLegacyAdvancedGroup={handleDeleteLegacyAdvancedGroup}
					onCreateAdvancedTemplate={handleCreateAdvancedTemplate}
					{canManageAdvancedTemplates}
					onManageAdvancedTemplates={handleManageAdvancedTemplates}
					onRecoverPartialApply={handleRecoverPartialApply}
					{resumeSnapshot}
				/>
			{:else if activeAdvancedWorkspaceView === 'draft-snapshots'}
				<AdvancedSnapshotList
					snapshots={resumableAdvancedDutySnapshots}
					onResumeSnapshot={handleResumeSnapshot}
					onDeleteSnapshot={handleDeleteSnapshot}
				/>
			{:else}
				<AppliedEventManager
					{advancedDutyEvents}
					{advancedDutySnapshots}
					advancedDutyRevisionHistory={data.advancedDutyRevisionHistory ?? []}
					{personnelById}
					{previewPersonnelOptions}
					onStartAdvancedRevisionDraft={handleStartAdvancedRevisionDraft}
					onUpdateAdvancedRevisionDraft={handleUpdateAdvancedRevisionDraft}
					onDiscardAdvancedRevisionDraft={handleDiscardAdvancedRevisionDraft}
					onDeleteAdvancedEvent={handleDeleteAdvancedEvent}
					onDeleteAdvancedRun={handleDeleteAdvancedRun}
					onDeleteLegacyAdvancedGroup={handleDeleteLegacyAdvancedGroup}
				/>
			{/if}
		</section>
	{:else}
		<AdvancedDutyTemplateBuilder
			templates={advancedDutyTemplates}
			groups={groupsStore.items}
			personnel={calendarPersonnel}
			canManageTemplates={canManageAdvancedTemplates}
			onCreateTemplate={handleCreateAdvancedTemplate}
			onUpdateTemplate={handleUpdateAdvancedTemplate}
			onArchiveTemplate={handleArchiveAdvancedTemplate}
		/>
	{/if}
</div>

<style>
	.duty-roster-page {
		max-width: 1500px;
		margin: 0 auto;
		padding: var(--sp-4) var(--sp-6) var(--sp-6);
		display: flex;
		flex-direction: column;
		gap: var(--sp-4);
		min-width: 0;
	}

	.advanced-workspace {
		display: grid;
		gap: var(--sp-4);
	}

	.advanced-workspace__bar {
		display: flex;
		align-items: center;
		justify-content: flex-start;
		padding-bottom: var(--sp-2);
		border-bottom: 1px solid var(--border-default);
		overflow-x: auto;
	}

	.restricted-hero {
		text-align: center;
		padding: var(--sp-8) var(--sp-6);
		color: var(--text-secondary);
	}

	.restricted-hero h1 {
		font-family: var(--font-display);
		font-size: var(--text-ui-xl);
		margin: 0 0 var(--sp-2);
	}

	@media (max-width: 720px) {
		.duty-roster-page {
			padding-inline: var(--sp-3);
		}
	}
</style>
