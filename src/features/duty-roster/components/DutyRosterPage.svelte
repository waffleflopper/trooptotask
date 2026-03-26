<script lang="ts">
	import PageToolbar from '$lib/components/PageToolbar.svelte';
	import DutyRosterGenerator from './DutyRosterGenerator.svelte';
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
	import type { Personnel } from '$lib/types';

	interface Props {
		data: {
			orgId: string;
			orgName?: string;
			personnel?: Personnel[];
			allPersonnel?: Personnel[];
			scopedGroupId?: string | null;
			rosterHistory: RosterHistoryItem[];
		};
	}

	let { data }: Props = $props();

	const org = getOrgContext();
	const canManageConfig = $derived(org.isPrivileged || org.isFullEditor);
	const canMutate = $derived(!org.readOnly && canManageConfig);

	// ---- Load roster history on mount ----
	$effect(() => {
		dutyRosterHistoryStore.load(data.rosterHistory);
	});

	// ---- Personnel data ----
	const calendarPersonnel = $derived(data.allPersonnel ?? data.personnel ?? []);
	const personnelByGroup = $derived(
		groupAndSortPersonnel(calendarPersonnel, {
			pinnedGroups: pinnedGroupsStore.list,
			fallbackGroupName: data.orgName ?? ''
		})
	);
	const scopedPBG = $derived(scopePersonnelByGroup(personnelByGroup, data.scopedGroupId ?? null));

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
			await fetch(`/org/${org.orgId}/api/duty-roster-history/${id}`, { method: 'DELETE' });
		} catch {
			// Silently fail - history will re-sync on next page load
		}
	}

	async function handleUpdateExemptions(assignmentTypeId: string, personnelIds: string[]): Promise<void> {
		await dailyAssignmentsStore.updateType(assignmentTypeId, {
			exemptPersonnelIds: personnelIds
		});
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
		<DutyRosterGenerator
			assignmentTypes={dailyAssignmentsStore.types}
			assignments={dailyAssignmentsStore.assignments}
			personnelByGroup={scopedPBG}
			groups={groupsStore.names}
			availabilityEntries={availabilityStore.items}
			statusTypes={statusTypesStore.items}
			specialDays={specialDaysStore.items}
			rosterHistory={dutyRosterHistoryStore.items}
			onApplyRoster={handleApplyRoster}
			onSaveRoster={handleSaveRoster}
			onDeleteRoster={handleDeleteRoster}
			onUpdateExemptions={handleUpdateExemptions}
		/>
	{/if}
</div>

<style>
	.duty-roster-page {
		padding: var(--spacing-lg);
		max-width: 1200px;
		margin: 0 auto;
	}

	.restricted-hero {
		text-align: center;
		padding: var(--spacing-xl) var(--spacing-lg);
		color: var(--color-text-secondary);
	}

	.restricted-hero h1 {
		font-family: var(--font-display);
		font-size: var(--font-size-xl);
		margin: 0 0 var(--spacing-sm);
	}
</style>
