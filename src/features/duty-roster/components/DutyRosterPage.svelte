<script lang="ts">
	import PageToolbar from '$lib/components/PageToolbar.svelte';
	import SubNav from '$lib/components/ui/SubNav.svelte';
	import DutyRosterWizard from './DutyRosterWizard.svelte';
	import AdvancedDutyTemplateBuilder from './AdvancedDutyTemplateBuilder.svelte';
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
	import { scopePersonnelByGroup } from '$lib/utils/scopePersonnel';
	import { groupsStore } from '$lib/stores/groups.svelte';
	import { toastStore } from '$lib/stores/toast.svelte';
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
		DutyTemplate,
		DutyTemplateWriteInput
	} from '../duty-roster.types';
	import { cloneDefaultSoftPreferences } from '../duty-roster.types';

	interface Props {
		data: {
			orgId: string;
			orgName?: string;
			personnel?: Personnel[];
			allPersonnel?: Personnel[];
			calendar?: {
				data?: CalendarWorkspaceData;
			};
			scopedGroupId?: string | null;
			rosterHistory: RosterHistoryItem[];
			advancedDutyTemplates: DutyTemplate[];
			advancedDutyEvents: DutyEvent[];
		};
	}

	let { data }: Props = $props();

	const org = getOrgContext();
	const canManageConfig = $derived(org.isPrivileged || org.isFullEditor);
	const canMutate = $derived(!org.readOnly && canManageConfig);
	const canAccessAdvancedDuty = $derived(!data.scopedGroupId && (org.isPrivileged || org.isFullEditor));
	const canManageAdvancedTemplates = $derived(!org.readOnly && canAccessAdvancedDuty);
	const workspaceData = $derived(data.calendar?.data ?? data);
	let activeTab = $state<'wizard' | 'advanced-templates'>('wizard');
	let advancedDutyTemplates = $state<DutyTemplate[]>([]);
	let advancedDutyEvents = $state<DutyEvent[]>([]);

	const dutyRosterTabs = $derived.by(() => {
		const tabs = [{ label: 'Wizard', value: 'wizard' }];
		if (canManageAdvancedTemplates) {
			tabs.push({ label: 'Advanced Templates', value: 'advanced-templates', badge: advancedDutyTemplates.length });
		}
		return tabs;
	});

	$effect(() => {
		if (!canManageAdvancedTemplates && activeTab === 'advanced-templates') {
			activeTab = 'wizard';
		}
	});

	// ---- Load roster history on mount ----
	$effect(() => {
		dutyRosterHistoryStore.load(data.rosterHistory);
	});

	$effect(() => {
		advancedDutyTemplates = sortTemplates((data.advancedDutyTemplates ?? []).map(normalizeTemplate));
	});

	$effect(() => {
		advancedDutyEvents = [...data.advancedDutyEvents].sort((a, b) => b.coverageStart.localeCompare(a.coverageStart));
	});

	// ---- Personnel data ----
	const calendarPersonnel = $derived(workspaceData.allPersonnel ?? workspaceData.personnel ?? []);
	const personnelByGroup = $derived(
		groupAndSortPersonnel(calendarPersonnel, {
			pinnedGroups: pinnedGroupsStore.list,
			fallbackGroupName: data.orgName ?? ''
		})
	);
	const scopedPBG = $derived(scopePersonnelByGroup(personnelByGroup, data.scopedGroupId ?? null));

	function sortTemplates(items: DutyTemplate[]): DutyTemplate[] {
		return [...items].sort((a, b) => a.name.localeCompare(b.name));
	}

	function normalizeTemplate(template: DutyTemplate): DutyTemplate {
		return {
			...template,
			scopeGroupIds: Array.isArray(template.scopeGroupIds) ? template.scopeGroupIds : [],
			exemptPersonnelIds: Array.isArray(template.exemptPersonnelIds) ? template.exemptPersonnelIds : [],
			exemptStatusTypeIds: Array.isArray(template.exemptStatusTypeIds) ? template.exemptStatusTypeIds : [],
			softPreferences:
				Array.isArray(template.softPreferences) && template.softPreferences.length > 0
					? template.softPreferences
					: cloneDefaultSoftPreferences(),
			slots: Array.isArray(template.slots) ? template.slots : [],
			rotationBaselines: Array.isArray(template.rotationBaselines) ? template.rotationBaselines : []
		};
	}

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

			const item = normalizeTemplate((await res.json()) as DutyTemplate);
			advancedDutyTemplates = sortTemplates([...advancedDutyTemplates, item]);
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

			const item = normalizeTemplate((await res.json()) as DutyTemplate);
			advancedDutyTemplates = sortTemplates(
				advancedDutyTemplates.map((template) => (template.id === item.id ? item : template))
			);
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

			return (await res.json()) as DutyEventPreview;
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
			advancedDutyEvents = [event, ...advancedDutyEvents.filter((item) => item.id !== event.id)].sort((a, b) =>
				b.coverageStart.localeCompare(a.coverageStart)
			);
			toastStore.success('Advanced duty event applied');
			return event;
		} catch (error) {
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

			return (await res.json()) as DutyEventSeriesPreview;
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
			advancedDutyEvents = [
				...result.events,
				...advancedDutyEvents.filter((existing) => !result.events.some((event) => event.id === existing.id))
			].sort((a, b) => b.coverageStart.localeCompare(a.coverageStart));
			toastStore.success(`Applied ${result.events.length} advanced duty event${result.events.length === 1 ? '' : 's'}`);
			return result;
		} catch (error) {
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
			advancedDutyEvents = [event, ...advancedDutyEvents.filter((existing) => existing.id !== event.id)].sort((a, b) =>
				b.coverageStart.localeCompare(a.coverageStart)
			);
			toastStore.success('Applied duty event updated');
			return event;
		} catch (error) {
			toastStore.error(error instanceof Error ? error.message : 'Failed to save applied duty event');
			return null;
		}
	}

	async function handleDeleteAdvancedEvent(dutyEventId: string): Promise<boolean> {
		try {
			const res = await fetch(`/org/${org.orgId}/api/duty-events/${dutyEventId}`, { method: 'DELETE' });
			if (!res.ok) {
				throw new Error(await readResponseErrorMessage(res, 'Failed to delete applied duty event'));
			}
			advancedDutyEvents = advancedDutyEvents.filter((event) => event.id !== dutyEventId);
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
			advancedDutyEvents = advancedDutyEvents.filter((event) => event.runId !== runId);
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
			const removed = new Set(eventIds);
			advancedDutyEvents = advancedDutyEvents.filter((event) => !removed.has(event.id));
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
			const item = normalizeTemplate((await res.json()) as DutyTemplate);
			advancedDutyTemplates = sortTemplates(
				advancedDutyTemplates.map((template) => (template.id === item.id ? item : template))
			);
			toastStore.success('Duty template archived');
			return item;
		} catch (error) {
			toastStore.error(error instanceof Error ? error.message : 'Failed to archive duty template');
			return null;
		}
	}
</script>

<PageToolbar
	title="Duty Roster"
	breadcrumbs={[{ label: 'Calendar', href: `/org/${org.orgId}/calendar` }, { label: 'Duty Roster' }]}
>
	<a href={`/org/${org.orgId}/calendar`} class="btn btn-sm">Back</a>
</PageToolbar>

<div class="duty-roster-page">
	{#if !canMutate}
		<section class="restricted-hero">
			<h1>Access restricted.</h1>
			<p>Only organization admins and full editors can manage duty rosters.</p>
		</section>
	{:else}
		<SubNav tabs={dutyRosterTabs} active={activeTab} onChange={(value) => (activeTab = value as typeof activeTab)} />

		{#if activeTab === 'wizard'}
			<DutyRosterWizard
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
		{:else}
			<AdvancedDutyTemplateBuilder
				templates={advancedDutyTemplates}
				groups={groupsStore.items}
				personnel={calendarPersonnel}
				statusTypes={statusTypesStore.items}
				canManageTemplates={canManageAdvancedTemplates}
				onCreateTemplate={handleCreateAdvancedTemplate}
				onUpdateTemplate={handleUpdateAdvancedTemplate}
				onArchiveTemplate={handleArchiveAdvancedTemplate}
			/>
		{/if}
	{/if}
</div>

<style>
	.duty-roster-page {
		padding: var(--sp-6);
		max-width: 1200px;
		margin: 0 auto;
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
</style>
