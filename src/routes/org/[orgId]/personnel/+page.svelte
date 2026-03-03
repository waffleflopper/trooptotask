<script lang="ts">
	import type { Personnel } from '$lib/types';
	import { personnelStore } from '$lib/stores/personnel.svelte';
	import { groupsStore } from '$lib/stores/groups.svelte';
	import { pinnedGroupsStore } from '$lib/stores/pinnedGroups.svelte';
	import PersonnelModal from '$lib/components/PersonnelModal.svelte';
	import GroupManager from '$lib/components/GroupManager.svelte';
	import BulkPersonnelManager from '$lib/components/BulkPersonnelManager.svelte';
	import PageToolbar from '$lib/components/PageToolbar.svelte';
	import type { OverflowItem } from '$lib/components/ui/OverflowMenu.svelte';
	import { groupAndSortPersonnel, RANK_ORDER } from '$lib/utils/personnelGrouping';

	let { data } = $props();

	$effect(() => {
		personnelStore.load(data.personnel, data.orgId);
		groupsStore.load(data.groups, data.orgId);
		pinnedGroupsStore.load(data.pinnedGroups, data.orgId);
	});

	let showPersonnelModal = $state(false);
	let editingPerson = $state<Personnel | null>(null);
	let showGroupManager = $state(false);
	let showBulkManager = $state(false);
	let collapsedGroups = $state<Set<string>>(new Set());
	let searchQuery = $state('');
	let viewMode = $state<'alphabetical' | 'by-group'>('by-group');

	// Filter personnel by search query
	const filteredPersonnel = $derived.by(() => {
		if (!searchQuery.trim()) return personnelStore.list;
		const query = searchQuery.toLowerCase();
		return personnelStore.list.filter(
			(p) =>
				p.lastName.toLowerCase().includes(query) ||
				p.firstName.toLowerCase().includes(query) ||
				p.rank.toLowerCase().includes(query) ||
				p.clinicRole.toLowerCase().includes(query)
		);
	});

	// Group view - use shared utility
	const personnelByGroup = $derived(
		groupAndSortPersonnel(filteredPersonnel, pinnedGroupsStore.list)
	);

	// Alphabetical view - sorted by name
	const alphabeticalPersonnel = $derived(
		[...filteredPersonnel].sort((a, b) => {
			const lastNameDiff = a.lastName.localeCompare(b.lastName);
			if (lastNameDiff !== 0) return lastNameDiff;
			return a.firstName.localeCompare(b.firstName);
		})
	);

	const totalPersonnel = $derived(personnelStore.list.length);
	const filteredCount = $derived(
		viewMode === 'by-group'
			? personnelByGroup.reduce((sum, g) => sum + g.personnel.length, 0)
			: alphabeticalPersonnel.length
	);

	function toggleGroup(group: string) {
		const newSet = new Set(collapsedGroups);
		if (newSet.has(group)) {
			newSet.delete(group);
		} else {
			newSet.add(group);
		}
		collapsedGroups = newSet;
	}

	function handleAdd() {
		editingPerson = null;
		showPersonnelModal = true;
	}

	const personnelOverflowItems = $derived.by<OverflowItem[]>(() => {
		const items: OverflowItem[] = [];
		if (data.permissions.canEditPersonnel) {
			items.push({ label: 'Add Person', onclick: handleAdd });
			items.push({ label: 'Bulk Import', onclick: () => (showBulkManager = true), divider: true });
			items.push({ label: 'Manage Groups', onclick: () => (showGroupManager = true) });
		}
		return items;
	});

	function handleEdit(person: Personnel) {
		editingPerson = person;
		showPersonnelModal = true;
	}

	async function handleSubmit(personData: Omit<Personnel, 'id'>) {
		if (editingPerson) {
			await personnelStore.update(editingPerson.id, personData);
		} else {
			await personnelStore.add(personData);
		}
	}

	function closePersonnelModal() {
		showPersonnelModal = false;
		editingPerson = null;
	}

	async function handleRemove(id: string) {
		await personnelStore.remove(id);
	}

	function handlePinToggle(group: string) {
		pinnedGroupsStore.toggle(group);
	}

	async function handleBulkAdd(personnelList: Omit<Personnel, 'id'>[]) {
		for (const person of personnelList) {
			await personnelStore.add(person);
		}
		showBulkManager = false;
	}

	async function handleBulkDelete(ids: string[]) {
		for (const id of ids) {
			await personnelStore.remove(id);
		}
		showBulkManager = false;
	}
</script>

<svelte:head>
	<title>Personnel - Troop to Task</title>
</svelte:head>

<div class="page">
	<PageToolbar title="Personnel" overflowItems={personnelOverflowItems}>
		{#if data.permissions.canEditPersonnel}
			<button class="btn btn-sm btn-primary" onclick={handleAdd}>
				Add Person
			</button>
		{/if}
	</PageToolbar>

	<div class="toolbar">
		<div class="toolbar-title">
			<span class="count">({totalPersonnel})</span>
		</div>
		<input
			type="text"
			class="input search-input"
			placeholder="Search by name, rank, or role..."
			bind:value={searchQuery}
		/>
		<div class="view-toggle">
			<span class="view-label">View:</span>
			<button
				class="view-btn"
				class:active={viewMode === 'alphabetical'}
				onclick={() => (viewMode = 'alphabetical')}
			>
				A-Z
			</button>
			<button
				class="view-btn"
				class:active={viewMode === 'by-group'}
				onclick={() => (viewMode = 'by-group')}
			>
				By Group
			</button>
		</div>
		{#if searchQuery && filteredCount !== totalPersonnel}
			<span class="filter-info">Showing {filteredCount} of {totalPersonnel}</span>
		{/if}
	</div>

	<main class="page-content">
		{#if totalPersonnel === 0}
			<div class="empty-state">
				<p>No personnel added yet.</p>
				<p>Use the toolbar to add personnel or bulk import.</p>
			</div>
		{:else if viewMode === 'alphabetical'}
			<div class="personnel-list">
				{#each alphabeticalPersonnel as person (person.id)}
					{#if data.permissions.canEditPersonnel}
						<button class="person-row" onclick={() => handleEdit(person)}>
							<div class="person-info">
								<span class="rank">{person.rank}</span>
								<span class="name">{person.lastName}, {person.firstName}</span>
								{#if person.mos}
									<span class="mos">{person.mos}</span>
								{/if}
								{#if person.clinicRole}
									<span class="role">{person.clinicRole}</span>
								{/if}
								{#if person.groupName}
									<span class="group-badge">{person.groupName}</span>
								{/if}
							</div>
						</button>
					{:else}
						<div class="person-row readonly">
							<div class="person-info">
								<span class="rank">{person.rank}</span>
								<span class="name">{person.lastName}, {person.firstName}</span>
								{#if person.mos}
									<span class="mos">{person.mos}</span>
								{/if}
								{#if person.clinicRole}
									<span class="role">{person.clinicRole}</span>
								{/if}
								{#if person.groupName}
									<span class="group-badge">{person.groupName}</span>
								{/if}
							</div>
						</div>
					{/if}
				{/each}
			</div>
		{:else}
			<div class="personnel-grid">
				{#each personnelByGroup as grp (grp.group)}
					<div class="group-card">
						<div class="group-header">
							<button class="group-toggle" onclick={() => toggleGroup(grp.group)}>
								<span class="toggle-icon">{collapsedGroups.has(grp.group) ? '▶' : '▼'}</span>
								<span class="group-name">{grp.group || 'Unassigned'}</span>
								<span class="group-count">({grp.personnel.length})</span>
							</button>
							<button
								class="pin-btn"
								class:pinned={pinnedGroupsStore.list.includes(grp.group)}
								onclick={() => handlePinToggle(grp.group)}
								title={pinnedGroupsStore.list.includes(grp.group) ? 'Unpin group' : 'Pin group to top'}
							>
								{pinnedGroupsStore.list.includes(grp.group) ? '📌' : '📍'}
							</button>
						</div>
						{#if !collapsedGroups.has(grp.group)}
							<div class="group-personnel">
								{#each grp.personnel as person (person.id)}
									{#if data.permissions.canEditPersonnel}
										<button class="person-row" onclick={() => handleEdit(person)}>
											<div class="person-info">
												<span class="rank">{person.rank}</span>
												<span class="name">{person.lastName}, {person.firstName}</span>
												{#if person.mos}
													<span class="mos">{person.mos}</span>
												{/if}
												{#if person.clinicRole}
													<span class="role">{person.clinicRole}</span>
												{/if}
											</div>
										</button>
									{:else}
										<div class="person-row readonly">
											<div class="person-info">
												<span class="rank">{person.rank}</span>
												<span class="name">{person.lastName}, {person.firstName}</span>
												{#if person.mos}
													<span class="mos">{person.mos}</span>
												{/if}
												{#if person.clinicRole}
													<span class="role">{person.clinicRole}</span>
												{/if}
											</div>
										</div>
									{/if}
								{/each}
							</div>
						{/if}
					</div>
				{/each}
			</div>
		{/if}
	</main>
</div>

{#if showPersonnelModal}
	<PersonnelModal
		personnel={editingPerson}
		groups={groupsStore.list}
		onSubmit={handleSubmit}
		onRemove={handleRemove}
		onClose={closePersonnelModal}
	/>
{/if}

{#if showGroupManager}
	<GroupManager
		groups={groupsStore.list}
		onAdd={(name) => groupsStore.add(name)}
		onRemove={(id) => groupsStore.remove(id)}
		onRename={(id, name) => groupsStore.rename(id, name)}
		onClose={() => (showGroupManager = false)}
	/>
{/if}

{#if showBulkManager}
	{#if !data.subscriptionLimits || data.subscriptionLimits.hasBulkImport}
		<BulkPersonnelManager
			personnelByGroup={personnelByGroup}
			groups={groupsStore.list}
			onBulkAdd={handleBulkAdd}
			onBulkDelete={handleBulkDelete}
			onClose={() => (showBulkManager = false)}
		/>
	{:else}
		<div class="modal-overlay" onclick={() => (showBulkManager = false)}>
			<div class="modal-content feature-gate-modal" onclick={(e) => e.stopPropagation()}>
				<button class="modal-close" onclick={() => (showBulkManager = false)}>&times;</button>
				<div class="feature-locked">
					<div class="lock-icon">
						<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
							<path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
						</svg>
					</div>
					<h2>Bulk Import</h2>
					<p>This feature requires a Pro or Team subscription.</p>
					<a href="/billing/upgrade" class="btn btn-primary">Upgrade Your Plan</a>
				</div>
			</div>
		</div>
	{/if}
{/if}

<style>
	.page {
		height: 100%;
		display: flex;
		flex-direction: column;
		background: var(--color-bg);
	}

	.toolbar {
		display: flex;
		align-items: center;
		gap: var(--spacing-md);
		padding: var(--spacing-md) var(--spacing-lg);
		background: var(--color-surface);
		border-bottom: 1px solid var(--color-border);
	}

	.toolbar-title {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
	}

	.count {
		font-family: var(--font-mono);
		font-size: var(--font-size-sm);
		color: var(--color-text-muted);
	}

	.search-input {
		flex: 1;
		max-width: 400px;
	}

	.filter-info {
		font-size: var(--font-size-sm);
		color: var(--color-text-muted);
	}

	.view-toggle {
		display: flex;
		align-items: center;
		gap: var(--spacing-xs);
	}

	.view-label {
		font-size: var(--font-size-sm);
		color: var(--color-text-muted);
	}

	.view-btn {
		padding: var(--spacing-xs) var(--spacing-sm);
		font-size: var(--font-size-sm);
		border: 1px solid var(--color-border);
		background: var(--color-surface);
		color: var(--color-text);
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.view-btn:first-of-type {
		border-radius: var(--radius-md) 0 0 var(--radius-md);
	}

	.view-btn:last-of-type {
		border-radius: 0 var(--radius-md) var(--radius-md) 0;
		border-left: none;
	}

	.view-btn:hover {
		background: var(--color-bg);
	}

	.view-btn.active {
		background: #B8943E;
		border-color: #B8943E;
		color: #0F0F0F;
	}

	.personnel-list {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		padding: var(--spacing-sm);
	}

	.group-badge {
		font-family: var(--font-mono);
		font-size: var(--font-size-xs);
		color: #0F0F0F;
		background: #B8943E;
		padding: 2px var(--spacing-sm);
		border-radius: var(--radius-sm);
		margin-left: auto;
	}

	.page-content {
		flex: 1;
		padding: var(--spacing-lg);
		overflow-y: auto;
	}

	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		height: 100%;
		gap: var(--spacing-sm);
		color: var(--color-text-muted);
	}

	.personnel-grid {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-md);
	}

	.group-card {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		overflow: hidden;
	}

	.group-header {
		display: flex;
		align-items: center;
		background: #0F0F0F;
		color: #F0EDE6;
	}

	.group-toggle {
		flex: 1;
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		padding: var(--spacing-md);
		background: transparent;
		color: white;
		text-align: left;
		cursor: pointer;
		font-weight: 600;
	}

	.group-toggle:hover {
		background: #1A1A1A;
	}

	.toggle-icon {
		font-size: 10px;
		width: 12px;
	}

	.group-name {
		flex: 1;
	}

	.group-count {
		font-weight: 400;
		opacity: 0.8;
	}

	.pin-btn {
		padding: var(--spacing-md);
		background: transparent;
		color: white;
		opacity: 0.5;
		font-size: 14px;
		transition: opacity 0.15s ease;
	}

	.pin-btn:hover {
		opacity: 1;
		background: #1A1A1A;
	}

	.pin-btn.pinned {
		opacity: 1;
	}

	.group-personnel {
		padding: var(--spacing-sm);
	}

	.person-row {
		display: flex;
		align-items: center;
		width: 100%;
		padding: var(--spacing-sm) var(--spacing-md);
		border-radius: var(--radius-md);
		transition: background-color 0.15s ease;
		cursor: pointer;
		text-align: left;
		background: transparent;
		border: none;
	}

	.person-row:hover {
		background-color: var(--color-bg);
	}

	.person-row.readonly {
		cursor: default;
	}

	.person-row.readonly:hover {
		background-color: transparent;
	}

	.person-info {
		display: flex;
		align-items: center;
		gap: var(--spacing-md);
	}

	.rank {
		font-weight: 600;
		color: #B8943E;
		min-width: 40px;
	}

	.name {
		font-weight: 500;
		color: var(--color-text);
	}

	.mos {
		font-size: var(--font-size-sm);
		color: #B8943E;
		font-weight: 500;
	}

	.role {
		font-size: var(--font-size-sm);
		color: var(--color-text-muted);
		padding: 2px var(--spacing-sm);
		background: var(--color-bg);
		border-radius: var(--radius-sm);
	}

	/* Mobile Responsive Styles */
	@media (max-width: 640px) {
		.toolbar {
			flex-wrap: wrap;
			padding: var(--spacing-sm) var(--spacing-md);
		}

		.search-input {
			max-width: unset;
			width: 100%;
		}

		.view-toggle {
			width: 100%;
			justify-content: flex-start;
		}

		.page-content {
			padding: var(--spacing-sm);
		}

		.group-badge {
			display: none;
		}

		.group-toggle {
			padding: var(--spacing-sm);
		}

		.person-info {
			flex-wrap: wrap;
			gap: var(--spacing-sm);
		}

		.rank {
			min-width: 35px;
		}

		.mos {
			display: none; /* Hide MOS on mobile to save space */
		}

		.role {
			font-size: var(--font-size-xs);
		}
	}

	/* Tablet Responsive Styles */
	@media (min-width: 641px) and (max-width: 1024px) {
		.search-input {
			max-width: 300px;
		}
	}

	/* Feature Gate Modal */
	.feature-gate-modal {
		max-width: 400px;
		text-align: center;
	}

	.feature-locked {
		padding: var(--spacing-xl);
	}

	.feature-locked .lock-icon {
		width: 80px;
		height: 80px;
		margin: 0 auto var(--spacing-lg);
		background: color-mix(in srgb, #B8943E 15%, transparent);
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		color: #B8943E;
	}

	.feature-locked h2 {
		font-size: var(--font-size-xl);
		font-weight: 600;
		color: var(--color-text);
		margin-bottom: var(--spacing-sm);
	}

	.feature-locked p {
		color: var(--color-text-muted);
		margin-bottom: var(--spacing-lg);
	}

	.feature-locked .btn-primary {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: var(--spacing-sm) var(--spacing-xl);
		background: var(--color-primary);
		color: #0F0F0F;
		font-weight: 500;
		border-radius: var(--radius-md);
		text-decoration: none;
	}

	.feature-locked .btn-primary:hover {
		background: var(--color-primary-hover);
	}
</style>
