<script lang="ts">
	import { onDestroy } from 'svelte';
	import * as PageShell from '$lib/components/patterns/page-shell';
	import { Button } from '$lib/components/ui/button';
	import * as ToggleGroup from '$lib/components/ui/toggle-group';
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
	import { CalendarRangeCoordinator } from '$features/calendar/contexts/CalendarRangeCoordinator.svelte';
	import { readAvailabilityPrefill, taskingHref } from '$features/calendar/taskings/staffing/availabilityPrefill';
	import BulkStatusAdd from './BulkStatusAdd.svelte';
	import BulkStatusRemove from './BulkStatusRemove.svelte';
	import type { CalendarOperationsPageAccess } from '../contracts';
	import { statusTypesStore } from '$features/calendar/stores/statusTypes.svelte';
	import { availabilityStore } from '$features/calendar/stores/availability.svelte';
	import { groupsStore, pinnedGroupsStore } from '$features/personnel';
	import { createRosterReadModel } from '$features/personnel/contracts';
	import { navigating, page } from '$app/state';
	import { goto, invalidate } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
	import { buildAddRecords } from '$features/calendar/utils/availabilityMutation';
	import {
		beginCalendarRangeRead,
		loadCalendarRange,
		mergeCalendarRangeIntoStores
	} from '$features/calendar/utils/calendarRangeLoader';
	import type { Personnel } from '$features/personnel/contracts';
	import type { AvailabilityEntry } from '$features/calendar/contracts';
	import type { CalendarWorkspaceData } from '$features/calendar/calendar.types';
	import type { FeatureKey } from '$lib/access/featureSwitches';

	interface Props {
		org: CalendarOperationsPageAccess;
		data: {
			orgId: string;
			orgName?: string;
			disabledFeatures?: readonly FeatureKey[];
			personnel?: Personnel[];
			allPersonnel?: Personnel[];
			calendar?: {
				data?: CalendarWorkspaceData;
			};
		};
	}

	let { data, org }: Props = $props();

	const orgUrlSegment = $derived(org.orgUrlSegment);
	const availabilityAffordance = $derived(
		org.affordanceForFeatureAction(POLICY_ACTION_CATALOG.calendar.manageAvailability, { kind: 'unscoped' })
	);
	const canMutate = $derived(availabilityAffordance.allowed);
	const workspaceData = $derived(data.calendar?.data ?? data);
	type Tab = 'add' | 'remove';
	const TABS: { value: Tab; label: string }[] = [
		{ value: 'add', label: 'Add' },
		{ value: 'remove', label: 'Remove' }
	];

	const activeTab = $derived.by<Tab>(() => {
		const param = page.url.searchParams.get('tab');
		if (param === 'remove') return param;
		return 'add';
	});

	// Only the Add form takes a prefill, and only while Taskings exist; it travels in the link so a reload keeps it.
	const prefill = $derived(
		activeTab === 'add' && !data.disabledFeatures?.includes('eventsAndTaskings')
			? readAvailabilityPrefill(page.url.searchParams)
			: null
	);
	const prefillKey = $derived(prefill ? JSON.stringify(prefill) : '');
	const backHref = $derived(prefill ? taskingHref(orgUrlSegment, prefill.taskingId) : `/org/${orgUrlSegment}/calendar`);

	// Switching tabs replaces the form, so a save that finishes later belongs to a form that is gone.
	let formGeneration = 0;
	let applyingGeneration = -1;

	function switchTab(tab: string) {
		// A single toggle group emits '' when the pressed item is clicked again.
		if (!TABS.some((option) => option.value === tab)) return;
		formGeneration++;
		const url = new URL(page.url);
		url.searchParams.set('tab', tab);
		const target = `${url.pathname}${url.search}` as `/org/${string}/calendar/bulk?${string}`;
		goto(resolve(target), { replaceState: true, noScroll: true, keepFocus: true });
	}

	const calendarPersonnel = $derived(workspaceData.allPersonnel ?? workspaceData.personnel ?? []);
	const rosterView = $derived(
		createRosterReadModel({
			personnel: calendarPersonnel,
			groups: groupsStore.items,
			pinnedGroups: pinnedGroupsStore.list,
			fallbackGroupName: data.orgName ?? ''
		}).scoped(org.scopeSet, { status: 'active' })
	);
	const scopedPBG = $derived(rosterView.personnelByGroup);
	// Add previews read through a coordinator of their own, seeded with what the Calendar workspace already loaded.
	const rangeCoordinator = new CalendarRangeCoordinator();
	$effect.pre(() => {
		const { rangeStart, rangeEnd, availabilityRange } = data.calendar?.data ?? {};
		rangeCoordinator.reset();
		if (rangeStart && rangeEnd && availabilityRange) {
			rangeCoordinator.includeBootstrap({ rangeStart, rangeEnd, availabilityRange });
		}
		return () => rangeCoordinator.reset();
	});

	// Each mounted scope owns its pending range loads, even after A → B → A.
	let active = true;
	onDestroy(() => {
		active = false;
	});

	let applyingOrgId = '';

	async function handleBulkApply(
		personnelIds: string[],
		statusTypeId: string,
		startDate: string,
		endDate: string,
		note: string | null
	): Promise<string[]> {
		applyingOrgId = data.orgId;
		applyingGeneration = formGeneration;
		const inserted = await availabilityStore.addBatch(
			buildAddRecords(personnelIds, statusTypeId, startDate, endDate, note).map((record) => ({
				...record,
				setForTaskingId: prefill?.taskingId ?? null
			}))
		);
		return inserted.map((entry) => entry.personnelId);
	}

	function handleBulkRemove(ids: string[]) {
		return availabilityStore.removeBatch(ids);
	}

	async function loadAvailabilityEntriesForRange(range: {
		rangeStart: string;
		rangeEnd: string;
	}): Promise<AvailabilityEntry[]> {
		const orgId = data.orgId;
		const read = beginCalendarRangeRead();
		try {
			const rangeData = await loadCalendarRange(orgId, { ...range, collections: ['availability'] });
			if (!active || data.orgId !== orgId) {
				throw new Error('Organization changed while loading availability range');
			}
			mergeCalendarRangeIntoStores(orgId, rangeData, read);
			return availabilityStore.items;
		} finally {
			read.close();
		}
	}

	function refreshCalendar() {
		invalidate('app:calendar-data');
	}

	function handleAddComplete() {
		// The reader already chose to go elsewhere; returning or refreshing now would cancel that navigation.
		if (navigating.to) return;
		const sameForm = applyingGeneration === formGeneration;
		const returnTo = prefill && sameForm && active && data.orgId === applyingOrgId ? backHref : null;
		// A separate invalidate would cancel a navigation started before it, so refresh as part of leaving.
		if (returnTo) {
			void goto(resolve(returnTo as `/org/${string}/calendar/taskings/${string}`), {
				invalidate: ['app:calendar-data']
			});
			return;
		}
		refreshCalendar();
	}
</script>

<div class="mx-auto flex max-w-[1480px] flex-col gap-4 px-4 py-4 sm:px-6 sm:pb-6">
	<PageShell.Header eyebrow="Calendar · Bulk status" title="Bulk status">
		{#snippet aside()}
			{#if canMutate}
				<ToggleGroup.Root
					type="single"
					size="sm"
					bind:value={() => activeTab, switchTab}
					aria-label="Bulk status sections"
				>
					{#each TABS as tab (tab.value)}
						<ToggleGroup.Item value={tab.value}>{tab.label}</ToggleGroup.Item>
					{/each}
				</ToggleGroup.Root>
			{/if}
			<Button variant="outline" size="sm" href={backHref}>
				<ArrowLeftIcon aria-hidden="true" />
				{prefill ? 'Back to tasking' : 'Back to calendar'}
			</Button>
		{/snippet}
	</PageShell.Header>

	{#if !canMutate}
		<section class="bg-card text-muted-foreground rounded-lg border px-6 py-8 text-center sm:px-8 sm:py-12">
			<h1 class="mb-2 text-xl font-semibold">Access restricted.</h1>
			<p>Calendar operation access is required to perform bulk status operations.</p>
		</section>
	{:else}
		<div class="min-w-0">
			{#if activeTab === 'add'}
				{#key prefillKey}
					<BulkStatusAdd
						personnelByGroup={scopedPBG}
						statusTypes={statusTypesStore.items}
						availabilityEntries={availabilityStore.items}
						orgId={data.orgId}
						{rangeCoordinator}
						onApply={handleBulkApply}
						onComplete={handleAddComplete}
						{prefill}
					/>
				{/key}
			{:else if activeTab === 'remove'}
				<BulkStatusRemove
					personnelByGroup={scopedPBG}
					statusTypes={statusTypesStore.items}
					availabilityEntries={availabilityStore.items}
					personnelList={calendarPersonnel}
					loadAvailabilityRange={loadAvailabilityEntriesForRange}
					onRemove={handleBulkRemove}
					onComplete={refreshCalendar}
				/>
			{/if}
		</div>
	{/if}
</div>
