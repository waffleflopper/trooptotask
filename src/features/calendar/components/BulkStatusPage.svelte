<script lang="ts">
	import { onDestroy } from 'svelte';
	import * as PageShell from '$lib/components/patterns/page-shell';
	import { Button } from '$lib/components/ui/button';
	import * as ToggleGroup from '$lib/components/ui/toggle-group';
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
	import { CalendarRangeCoordinator } from '$features/calendar/contexts/CalendarRangeCoordinator.svelte';
	import BulkStatusAdd from './BulkStatusAdd.svelte';
	import BulkStatusRemove from './BulkStatusRemove.svelte';
	import type { CalendarOperationsPageAccess } from '../contracts';
	import { statusTypesStore } from '$features/calendar/stores/statusTypes.svelte';
	import { availabilityStore } from '$features/calendar/stores/availability.svelte';
	import { groupsStore, pinnedGroupsStore } from '$features/personnel';
	import { createRosterReadModel } from '$features/personnel/contracts';
	import { page } from '$app/state';
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

	interface Props {
		org: CalendarOperationsPageAccess;
		data: {
			orgId: string;
			orgName?: string;
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

	function switchTab(tab: string) {
		// A single toggle group emits '' when the pressed item is clicked again.
		if (!TABS.some((option) => option.value === tab)) return;
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

	async function handleBulkApply(
		personnelIds: string[],
		statusTypeId: string,
		startDate: string,
		endDate: string,
		note: string | null
	): Promise<string[]> {
		const inserted = await availabilityStore.addBatch(
			buildAddRecords(personnelIds, statusTypeId, startDate, endDate, note)
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

	function handleComplete() {
		invalidate('app:calendar-data');
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
			<Button variant="outline" size="sm" href={`/org/${orgUrlSegment}/calendar`}>
				<ArrowLeftIcon aria-hidden="true" />
				Back to calendar
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
				<BulkStatusAdd
					personnelByGroup={scopedPBG}
					statusTypes={statusTypesStore.items}
					availabilityEntries={availabilityStore.items}
					orgId={data.orgId}
					{rangeCoordinator}
					onApply={handleBulkApply}
					onComplete={handleComplete}
				/>
			{:else if activeTab === 'remove'}
				<BulkStatusRemove
					personnelByGroup={scopedPBG}
					statusTypes={statusTypesStore.items}
					availabilityEntries={availabilityStore.items}
					personnelList={calendarPersonnel}
					loadAvailabilityRange={loadAvailabilityEntriesForRange}
					onRemove={handleBulkRemove}
					onComplete={handleComplete}
				/>
			{/if}
		</div>
	{/if}
</div>
