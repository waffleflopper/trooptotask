<script lang="ts">
	import { Toolbar, ToolbarNavGroup, ToolbarViewToggle } from '$lib/components/ui/toolbar';
	import BulkStatusAdd from './BulkStatusAdd.svelte';
	import BulkStatusRemove from './BulkStatusRemove.svelte';
	import BulkStatusImport from './BulkStatusImport.svelte';
	import { getOrgContext } from '$lib/stores/orgContext.svelte';
	import { statusTypesStore } from '$features/calendar/stores/statusTypes.svelte';
	import { availabilityStore } from '$features/calendar/stores/availability.svelte';
	import { pinnedGroupsStore } from '$lib/stores/pinnedGroups.svelte';
	import { groupAndSortPersonnel } from '$features/personnel/utils/personnelGrouping';
	import { scopePersonnelByGroup } from '$lib/utils/scopePersonnel';
	import { page } from '$app/state';
	import { goto, invalidate } from '$app/navigation';
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
			scopedGroupId?: string | null;
		};
	}

	let { data }: Props = $props();

	const org = getOrgContext();
	const canManageConfig = $derived(org.isPrivileged || org.isFullEditor);
	const canMutate = $derived(!org.readOnly && canManageConfig);
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
		goto(url.toString(), { replaceState: true, noScroll: true });
	}

	// ---- Personnel data ----
	const calendarPersonnel = $derived(workspaceData.allPersonnel ?? workspaceData.personnel ?? []);
	const personnelByGroup = $derived(
		groupAndSortPersonnel(calendarPersonnel, {
			pinnedGroups: pinnedGroupsStore.list,
			fallbackGroupName: data.orgName ?? ''
		})
	);
	const scopedPBG = $derived(scopePersonnelByGroup(personnelByGroup, data.scopedGroupId ?? null));
	const allPersonnelFlat = $derived(scopedPBG.flatMap((g) => g.personnel));
	const relatedLinks = $derived([{ label: 'Calendar', href: `/org/${org.orgId}/calendar` }]);

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

<div class="bulk-page">
	<Toolbar ariaLabel="Bulk status controls" collapse="narrow" leadingMin="24rem">
		{#snippet leading()}
			{#if canMutate}
				<ToolbarViewToggle
					ariaLabel="Bulk status sections"
					options={TABS}
					mode="full"
					value={activeTab}
					onValueChange={(tab) => switchTab(tab as Tab)}
				/>
			{/if}
		{/snippet}

		<ToolbarNavGroup ariaLabel="Related calendar pages" items={relatedLinks} />
	</Toolbar>

	{#if !canMutate}
		<section class="restricted-hero">
			<h1>Access restricted.</h1>
			<p>Only organization admins and full editors can perform bulk status operations.</p>
		</section>
	{:else}
		<div class="tab-panel">
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

<style>
	.bulk-page {
		max-width: 1480px;
		margin: 0 auto;
		padding: var(--sp-4) var(--sp-6) var(--sp-6);
		display: flex;
		flex-direction: column;
		gap: var(--sp-4);
	}

	.restricted-hero {
		text-align: center;
		padding: var(--sp-12) var(--sp-8);
		color: var(--text-secondary);
		background: var(--surface-panel);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-sm);
	}

	.restricted-hero h1 {
		font-family: var(--font-display);
		font-size: var(--text-ui-xl);
		margin: 0 0 var(--sp-2);
	}

	.tab-panel {
		min-width: 0;
	}

	@media (max-width: 768px) {
		.bulk-page {
			padding: var(--sp-4);
		}

		.restricted-hero {
			padding: var(--sp-8) var(--sp-6);
		}

		.bulk-page :global(.sub-nav) {
			width: 100%;
		}
	}
</style>
