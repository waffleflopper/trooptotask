<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import * as ButtonGroup from '$lib/components/ui/button-group';
	import * as WorkspaceToolbar from '$lib/components/ui/workspace-toolbar';
	import BulkStatusAdd from './BulkStatusAdd.svelte';
	import BulkStatusRemove from './BulkStatusRemove.svelte';
	import BulkStatusImport from './BulkStatusImport.svelte';
	import { getOrgContext } from '$lib/stores/orgContext.svelte';
	import { statusTypesStore } from '$features/calendar/stores/statusTypes.svelte';
	import { availabilityStore } from '$features/calendar/stores/availability.svelte';
	import { pinnedGroupsStore } from '$lib/stores/pinnedGroups.svelte';
	import { groupAndSortPersonnel } from '$lib/domain/rosterGrouping';
	import { scopePersonnelByGroupScopeSet } from '$lib/utils/scopePersonnel';
	import { page } from '$app/state';
	import { goto, invalidate } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
	import type { Personnel } from '$lib/types';
	import type { CalendarWorkspaceData } from '$features/calendar/calendar.types';

	interface Props {
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

	let { data }: Props = $props();

	const org = getOrgContext();
	const orgUrlSegment = $derived(org.orgUrlSegment ?? org.orgId);
	const availabilityAffordance = $derived(
		org.affordanceForFeatureAction(POLICY_ACTION_CATALOG.calendar.manageAvailability)
	);
	const canMutate = $derived(availabilityAffordance.allowed);
	const workspaceData = $derived(data.calendar?.data ?? data);
	// ---- Tab management ----
	type Tab = 'add' | 'remove' | 'import';
	const TABS: { label: string; value: Tab }[] = [
		{ value: 'add', label: 'Add' },
		{ value: 'remove', label: 'Remove' },
		{ value: 'import', label: 'Import' }
	];

	const activeTab = $derived.by<Tab>(() => {
		const param = page.url.searchParams.get('tab');
		if (param === 'remove' || param === 'import') return param;
		return 'add';
	});

	function switchTab(tab: Tab) {
		const url = new URL(page.url);
		url.searchParams.set('tab', tab);
		const target = `${url.pathname}${url.search}` as `/org/${string}/calendar/bulk?${string}`;
		goto(resolve(target), { replaceState: true, noScroll: true });
	}

	// ---- Personnel data ----
	const calendarPersonnel = $derived(workspaceData.allPersonnel ?? workspaceData.personnel ?? []);
	const personnelByGroup = $derived(
		groupAndSortPersonnel(calendarPersonnel, {
			pinnedGroups: pinnedGroupsStore.list,
			fallbackGroupName: data.orgName ?? ''
		})
	);
	const scopedPBG = $derived(scopePersonnelByGroupScopeSet(personnelByGroup, org.scopeSet));
	const allPersonnelFlat = $derived(scopedPBG.flatMap((g) => g.personnel));
	const relatedLinks = $derived([{ label: 'Calendar', href: `/org/${orgUrlSegment}/calendar` }]);

	// ---- Callbacks for child components ----
	async function handleBulkApply(
		personnelIds: string[],
		statusTypeId: string,
		startDate: string,
		endDate: string,
		note: string | null
	) {
		await availabilityStore.addBatch(
			personnelIds.map((personnelId) => ({ personnelId, statusTypeId, startDate, endDate, note }))
		);
	}

	async function handleBulkRemove(ids: string[]): Promise<boolean> {
		return await availabilityStore.removeBatch(ids);
	}

	function handleComplete() {
		invalidate('app:calendar-data');
	}

	function handleImportComplete() {
		invalidate('app:calendar-data');
	}
</script>

<div class="mx-auto flex max-w-[1480px] flex-col gap-4 px-4 py-4 sm:px-6 sm:pb-6">
	<WorkspaceToolbar.Root ariaLabel="Bulk status controls">
		{#if canMutate}
			<WorkspaceToolbar.Group label="Bulk status sections">
				<ButtonGroup.Root>
					{#each TABS as tab (tab.value)}
						<Button
							variant={activeTab === tab.value ? 'secondary' : 'outline'}
							aria-pressed={activeTab === tab.value}
							onclick={() => switchTab(tab.value)}
						>
							{tab.label}
						</Button>
					{/each}
				</ButtonGroup.Root>
			</WorkspaceToolbar.Group>
		{/if}

		<WorkspaceToolbar.Group label="Related calendar pages" zone="actions">
			<WorkspaceToolbar.Nav ariaLabel="Related calendar pages" items={relatedLinks} />
		</WorkspaceToolbar.Group>
	</WorkspaceToolbar.Root>

	{#if !canMutate}
		<section class="bg-card text-muted-foreground rounded-lg border px-6 py-8 text-center sm:px-8 sm:py-12">
			<h1 class="font-display mb-2 text-xl font-semibold">Access restricted.</h1>
			<p>Calendar operation access is required to perform bulk status operations.</p>
		</section>
	{:else}
		<div class="min-w-0">
			{#if activeTab === 'add'}
				<BulkStatusAdd
					personnelByGroup={scopedPBG}
					statusTypes={statusTypesStore.items}
					onApply={handleBulkApply}
					onComplete={handleComplete}
				/>
			{:else if activeTab === 'remove'}
				<BulkStatusRemove
					personnelByGroup={scopedPBG}
					statusTypes={statusTypesStore.items}
					availabilityEntries={availabilityStore.items}
					personnelList={calendarPersonnel}
					onRemove={handleBulkRemove}
					onComplete={handleComplete}
				/>
			{:else if activeTab === 'import'}
				<BulkStatusImport
					personnel={allPersonnelFlat}
					statusTypes={statusTypesStore.items}
					orgId={data.orgId}
					onImportComplete={handleImportComplete}
					onComplete={handleComplete}
				/>
			{/if}
		</div>
	{/if}
</div>
