<script lang="ts">
	import PageToolbar from '$lib/components/PageToolbar.svelte';
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

	interface Props {
		data: {
			orgId: string;
			orgName?: string;
			personnel?: Personnel[];
			allPersonnel?: Personnel[];
			scopedGroupId?: string | null;
		};
	}

	let { data }: Props = $props();

	const org = getOrgContext();
	const canManageConfig = $derived(org.isPrivileged || org.isFullEditor);
	const canMutate = $derived(!org.readOnly && canManageConfig);

	// ---- Tab management ----
	type Tab = 'add' | 'remove' | 'import';
	const TABS: { id: Tab; label: string }[] = [
		{ id: 'add', label: 'Add' },
		{ id: 'remove', label: 'Remove' },
		{ id: 'import', label: 'Import' }
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
	const calendarPersonnel = $derived(data.allPersonnel ?? data.personnel ?? []);
	const personnelByGroup = $derived(
		groupAndSortPersonnel(calendarPersonnel, {
			pinnedGroups: pinnedGroupsStore.list,
			fallbackGroupName: data.orgName ?? ''
		})
	);
	const scopedPBG = $derived(scopePersonnelByGroup(personnelByGroup, data.scopedGroupId ?? null));
	const allPersonnelFlat = $derived(scopedPBG.flatMap((g) => g.personnel));

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

<PageToolbar
	title="Bulk Status Operations"
	breadcrumbs={[{ label: 'Calendar', href: `/org/${org.orgId}/calendar` }, { label: 'Bulk Status Operations' }]}
>
	<a href="/org/{org.orgId}/calendar" class="btn btn-sm">Back</a>
</PageToolbar>

<div class="bulk-page">
	{#if !canMutate}
		<section class="restricted-hero">
			<h1>Access restricted.</h1>
			<p>Only organization admins and full editors can perform bulk status operations.</p>
		</section>
	{:else}
		<div class="tab-bar">
			{#each TABS as tab (tab.id)}
				<button class="tab-button" class:active={activeTab === tab.id} onclick={() => switchTab(tab.id)}>
					{tab.label}
				</button>
			{/each}
		</div>

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
		padding: var(--spacing-lg);
		max-width: 800px;
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

	.tab-bar {
		display: flex;
		gap: var(--spacing-xs);
		border-bottom: 2px solid var(--color-border);
		margin-bottom: var(--spacing-lg);
	}

	.tab-button {
		padding: var(--spacing-sm) var(--spacing-lg);
		background: none;
		border: none;
		border-bottom: 2px solid transparent;
		margin-bottom: -2px;
		font-family: var(--font-mono);
		font-size: var(--font-size-sm);
		font-weight: 500;
		color: var(--color-text-secondary);
		cursor: pointer;
		transition:
			color var(--transition-fast),
			border-color var(--transition-fast);
	}

	.tab-button:hover {
		color: var(--color-text);
	}

	.tab-button.active {
		color: var(--color-primary);
		border-bottom-color: var(--color-primary);
	}

	.tab-panel {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		overflow: hidden;
	}
</style>
