<script lang="ts">
	import type { Personnel, RatingSchemeEntry, WorkflowStatus } from '$lib/types';
	import { RATING_STATUS_COLORS, WORKFLOW_STATUS_OPTIONS } from '$lib/types';
	import { personnelStore } from '$features/personnel/stores/personnel.svelte';
	import { groupsStore } from '$lib/stores/groups.svelte';
	import { pinnedGroupsStore } from '$lib/stores/pinnedGroups.svelte';
	import { ratingSchemeStore } from '$lib/stores/ratingScheme.svelte';
	import { subscriptionStore } from '$lib/stores/subscription.svelte';
	import PersonnelModal from '$features/personnel/components/PersonnelModal.svelte';
	import GroupManager from '$lib/components/GroupManager.svelte';
	import BulkPersonnelManager from '$features/personnel/components/BulkPersonnelManager.svelte';
	import RatingSchemeEntryModal from '$lib/components/RatingSchemeEntryModal.svelte';
	import RatingSchemeTableView from '$lib/components/RatingSchemeTableView.svelte';
	import RatingSchemeGroupedView from '$lib/components/RatingSchemeGroupedView.svelte';
	import PageToolbar from '$lib/components/PageToolbar.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import type { OverflowItem } from '$lib/components/ui/OverflowMenu.svelte';
	import { groupAndSortPersonnel, RANK_ORDER } from '$features/personnel/utils/personnelGrouping';
	import { getRatingDueStatus } from '$lib/utils/ratingScheme';
	import { exportRatingScheme } from '$lib/utils/ratingSchemeExport';
	import { submitDeletionRequest } from '$lib/utils/deletionRequests';
	import { toastStore } from '$lib/stores/toast.svelte';
	import { invalidateAll } from '$app/navigation';

	const readOnly = $derived(subscriptionStore.billingEnabled && subscriptionStore.isReadOnly);

	let { data } = $props();

	$effect(() => {
		personnelStore.load(data.personnel, data.orgId);
		groupsStore.load(data.groups, data.orgId);
		pinnedGroupsStore.load(data.pinnedGroups, data.orgId);
		ratingSchemeStore.load(data.ratingSchemeEntries, data.orgId);
	});

	let showPersonnelModal = $state(false);
	let editingPerson = $state<Personnel | null>(null);
	let showGroupManager = $state(false);
	let showBulkManager = $state(false);
	let collapsedGroups = $state<Set<string>>(new Set());
	let searchQuery = $state('');
	let viewMode = $state<'alphabetical' | 'by-group'>('by-group');

	let pageView = $state<'roster' | 'rating-scheme'>('roster');
	let ratingViewMode = $state<'grouped' | 'table'>('grouped');
	let showRatingModal = $state(false);
	let editingEntry = $state<RatingSchemeEntry | null>(null);
	let ratingFilter = $state<'active' | 'completed' | 'change-of-rater' | 'all'>('active');
	let evalTypeFilter = $state<'all' | 'OER' | 'NCOER' | 'WOER'>('all');
	let workflowFilter = $state<WorkflowStatus | 'all'>('all');

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
		groupAndSortPersonnel(filteredPersonnel, { pinnedGroups: pinnedGroupsStore.list, fallbackGroupName: data.orgName })
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

	const hasAnyWorkflowStatus = $derived(ratingSchemeStore.list.some((e) => !!e.workflowStatus));

	const filteredRatingEntries = $derived.by(() => {
		let entries = ratingSchemeStore.list;
		if (ratingFilter !== 'all') entries = entries.filter((e) => e.status === ratingFilter);
		if (evalTypeFilter !== 'all') entries = entries.filter((e) => e.evalType === evalTypeFilter);
		if (workflowFilter !== 'all') entries = entries.filter((e) => e.workflowStatus === workflowFilter);
		return entries;
	});

	const ratingStats = $derived.by(() => {
		const counts = { overdue: 0, 'due-30': 0, 'due-60': 0, current: 0, completed: 0 };
		for (const entry of ratingSchemeStore.list) {
			const status = getRatingDueStatus(entry.ratingPeriodEnd, entry.status);
			counts[status]++;
		}
		return counts;
	});

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

	const canAddPersonnel = $derived(data.permissions.canEditPersonnel && !data.scopedGroupId);

	const personnelOverflowItems = $derived.by<OverflowItem[]>(() => {
		const items: OverflowItem[] = [];
		if (canAddPersonnel) {
			items.push({ label: 'Add Person', onclick: handleAdd, disabled: readOnly });
			items.push({ label: 'Manage Groups', onclick: () => (showGroupManager = true), disabled: readOnly });
			items.push({ label: 'Bulk Import', onclick: () => (showBulkManager = true), divider: true, disabled: readOnly });
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

	async function handleArchive(id: string) {
		const person = personnelStore.getById(id);
		const result = await personnelStore.remove(id);
		if (result === 'deleted') {
			toastStore.success('Personnel archived');
			await invalidateAll();
		} else if (result === 'approval_required' && person) {
			await submitDeletionRequest(
				data.orgId,
				'personnel',
				id,
				`Archive ${person.rank} ${person.lastName}, ${person.firstName}`,
				`/org/${data.orgId}/personnel`
			);
		} else if (result === 'error') {
			toastStore.error('Failed to archive personnel');
		}
	}

	function handlePinToggle(group: string) {
		pinnedGroupsStore.toggle(group);
	}

	async function handleBulkImportComplete() {
		await invalidateAll();
		showBulkManager = false;
	}

	async function handleBulkArchive(ids: string[]) {
		let archivedCount = 0;
		for (const id of ids) {
			const person = personnelStore.getById(id);
			const result = await personnelStore.remove(id);
			if (result === 'deleted') {
				archivedCount++;
			} else if (result === 'approval_required' && person) {
				await submitDeletionRequest(
					data.orgId,
					'personnel',
					id,
					`Archive ${person.rank} ${person.lastName}, ${person.firstName}`,
					`/org/${data.orgId}/personnel`
				);
			}
		}
		if (archivedCount > 0) {
			toastStore.success(`${archivedCount} personnel archived`);
			await invalidateAll();
		}
		showBulkManager = false;
	}

	function handleAddRatingEntry() {
		editingEntry = null;
		showRatingModal = true;
	}

	function handleEditRatingEntry(entry: RatingSchemeEntry) {
		editingEntry = entry;
		showRatingModal = true;
	}

	async function handleSaveRatingEntry(entryData: Omit<RatingSchemeEntry, 'id'>) {
		if (editingEntry) {
			await ratingSchemeStore.update(editingEntry.id, entryData);
		} else {
			await ratingSchemeStore.add(entryData);
		}
	}

	async function handleDeleteRatingEntry(id: string) {
		const entry = ratingSchemeStore.list.find((e) => e.id === id);
		const result = await ratingSchemeStore.remove(id);
		if (result === 'approval_required' && entry) {
			const allPeople = data.allPersonnel ?? data.personnel;
			const person = allPeople.find((p: Personnel) => p.id === entry.ratedPersonId);
			const desc = person
				? `Rating scheme entry for ${person.rank} ${person.lastName}`
				: 'Rating scheme entry';
			await submitDeletionRequest(
				data.orgId,
				'rating_scheme_entry',
				id,
				desc,
				`/org/${data.orgId}/personnel`
			);
		}
	}
</script>

<svelte:head>
	<title>Personnel - Troop to Task</title>
</svelte:head>

<div class="page">
	<PageToolbar title="Personnel" helpTopic={pageView === 'rating-scheme' ? 'rating-scheme' : 'personnel'} overflowItems={personnelOverflowItems}>
		{#if canAddPersonnel}
			<button class="btn-ghost" onclick={() => (showGroupManager = true)} disabled={readOnly}>
				Manage Groups
			</button>
			<button class="btn btn-sm btn-primary" onclick={handleAdd} disabled={readOnly}>
				Add Person
			</button>
			{#if readOnly}
				<span class="text-muted" style="font-size: var(--font-size-xs);">Upgrade to edit</span>
			{/if}
		{/if}
	</PageToolbar>

	{#if !data.permissions.canViewPersonnel}
		<div class="no-permission">
			<h2>Access Restricted</h2>
			<p>You don't have permission to view this area. Contact your organization admin for access.</p>
		</div>
	{:else}
	<div class="page-view-toggle">
		<button
			class="page-view-btn"
			class:active={pageView === 'roster'}
			onclick={() => (pageView = 'roster')}
		>
			Roster
		</button>
		<button
			class="page-view-btn"
			class:active={pageView === 'rating-scheme'}
			onclick={() => (pageView = 'rating-scheme')}
		>
			Rating Scheme
		</button>
	</div>

	{#if pageView === 'roster'}
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
				<EmptyState
					message="No personnel added yet."
					actionLabel={data.permissions.canEditPersonnel ? 'Add Person' : undefined}
					onAction={data.permissions.canEditPersonnel ? handleAdd : undefined}
				/>
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
									<span class="group-name">{grp.group}</span>
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
	{:else}
		<div class="rating-stats-bar">
			<div class="rating-stat" style="--stat-color: {RATING_STATUS_COLORS.overdue}">
				<span class="stat-count">{ratingStats.overdue}</span>
				<span class="stat-label">Overdue</span>
			</div>
			<div class="rating-stat" style="--stat-color: {RATING_STATUS_COLORS['due-30']}">
				<span class="stat-count">{ratingStats['due-30']}</span>
				<span class="stat-label">Due 30d</span>
			</div>
			<div class="rating-stat" style="--stat-color: {RATING_STATUS_COLORS['due-60']}">
				<span class="stat-count">{ratingStats['due-60']}</span>
				<span class="stat-label">Due 60d</span>
			</div>
			<div class="rating-stat" style="--stat-color: {RATING_STATUS_COLORS.current}">
				<span class="stat-count">{ratingStats.current}</span>
				<span class="stat-label">Current</span>
			</div>
			<div class="rating-stat" style="--stat-color: {RATING_STATUS_COLORS.completed}">
				<span class="stat-count">{ratingStats.completed}</span>
				<span class="stat-label">Completed</span>
			</div>
		</div>

		<div class="rating-toolbar">
			{#if data.permissions.canEditPersonnel}
				<button class="btn btn-sm btn-primary" onclick={handleAddRatingEntry} disabled={readOnly}>
					Add Entry
				</button>
				{#if readOnly}
					<span class="text-muted" style="font-size: var(--font-size-xs);">Upgrade to edit</span>
				{/if}
			{/if}
			<button class="btn btn-sm btn-secondary" onclick={() => exportRatingScheme(filteredRatingEntries, personnelStore.list)}>
				Export
			</button>
			<div class="spacer"></div>
			<select class="select rating-filter" bind:value={evalTypeFilter}>
				<option value="all">All Types</option>
				<option value="OER">OER</option>
				<option value="NCOER">NCOER</option>
				<option value="WOER">WOER</option>
			</select>
			<select class="select rating-filter" bind:value={ratingFilter}>
				<option value="active">Active</option>
				<option value="completed">Completed</option>
				<option value="change-of-rater">Change of Rater</option>
				<option value="all">All Statuses</option>
			</select>
			{#if hasAnyWorkflowStatus}
				<select class="select rating-filter" bind:value={workflowFilter}>
					<option value="all">All Workflow</option>
					{#each WORKFLOW_STATUS_OPTIONS as opt (opt.value)}
						<option value={opt.value}>{opt.label}</option>
					{/each}
				</select>
			{/if}
			<div class="view-toggle">
				<button
					class="view-btn"
					class:active={ratingViewMode === 'grouped'}
					onclick={() => (ratingViewMode = 'grouped')}
				>
					Grouped
				</button>
				<button
					class="view-btn"
					class:active={ratingViewMode === 'table'}
					onclick={() => (ratingViewMode = 'table')}
				>
					Table
				</button>
			</div>
		</div>

		<main class="page-content">
			{#if ratingViewMode === 'grouped'}
				<RatingSchemeGroupedView
					entries={filteredRatingEntries}
					personnel={data.allPersonnel ?? data.personnel}
					onEdit={handleEditRatingEntry}
				/>
			{:else}
				<RatingSchemeTableView
					entries={filteredRatingEntries}
					personnel={data.allPersonnel ?? data.personnel}
					onEdit={handleEditRatingEntry}
				/>
			{/if}
		</main>
	{/if}
	{/if}
</div>

{#if showRatingModal}
	<RatingSchemeEntryModal
		entry={editingEntry}
		personnel={data.allPersonnel ?? data.personnel}
		onSave={handleSaveRatingEntry}
		onDelete={editingEntry ? handleDeleteRatingEntry : undefined}
		onClose={() => { showRatingModal = false; editingEntry = null; }}
	/>
{/if}

{#if showPersonnelModal}
	<PersonnelModal
		personnel={editingPerson}
		groups={groupsStore.list}
		onSubmit={handleSubmit}
		onRemove={handleArchive}
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
	<BulkPersonnelManager
		personnelByGroup={personnelByGroup}
		groups={groupsStore.list}
		orgId={data.orgId}
		onImportComplete={handleBulkImportComplete}
		onBulkDelete={handleBulkArchive}
		onClose={() => (showBulkManager = false)}
	/>
{/if}

<style>
	.page {
		height: 100%;
		display: flex;
		flex-direction: column;
		background: var(--color-bg);
	}

	.page-view-toggle {
		display: flex;
		justify-content: center;
		gap: 0;
		padding: var(--spacing-sm) var(--spacing-lg);
		border-bottom: 1px solid var(--color-border);
		background: var(--color-surface);
	}

	.btn-ghost {
		background: none;
		border: none;
		color: var(--color-text-muted);
		font-size: var(--font-size-sm);
		font-weight: 500;
		padding: var(--spacing-xs) var(--spacing-sm);
		border-radius: var(--radius-sm);
		cursor: pointer;
		transition: all 0.15s;
	}

	.btn-ghost:hover {
		color: var(--color-text);
		background: var(--color-surface-variant);
	}

	.page-view-btn {
		padding: var(--spacing-xs) var(--spacing-lg);
		font-size: var(--font-size-sm);
		font-weight: 500;
		border: 1px solid var(--color-border);
		background: transparent;
		color: var(--color-text-secondary);
		cursor: pointer;
		transition: all 0.15s;
	}

	.page-view-btn:first-child {
		border-radius: var(--radius-sm) 0 0 var(--radius-sm);
	}

	.page-view-btn:last-child {
		border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
		border-left: none;
	}

	.page-view-btn.active {
		background: var(--color-primary);
		border-color: var(--color-primary);
		color: white;
	}

	.rating-stats-bar {
		display: flex;
		gap: var(--spacing-md);
		padding: var(--spacing-md) var(--spacing-lg);
		border-bottom: 1px solid var(--color-border);
		background: var(--color-surface);
	}

	.rating-stat {
		display: flex;
		align-items: center;
		gap: var(--spacing-xs);
		font-size: var(--font-size-sm);
	}

	.stat-count {
		font-weight: 600;
		color: var(--stat-color);
	}

	.stat-label {
		color: var(--color-text-muted);
	}

	.rating-toolbar {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		padding: var(--spacing-sm) var(--spacing-lg);
		border-bottom: 1px solid var(--color-border);
		background: var(--color-surface);
	}

	.rating-filter {
		width: auto;
		font-size: var(--font-size-sm);
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

	.no-permission {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		min-height: 300px;
		text-align: center;
		color: var(--color-text-muted);
	}
	.no-permission h2 {
		font-size: var(--font-size-lg);
		margin-bottom: var(--spacing-sm);
		color: var(--color-text);
	}

	/* .page-content base + mobile in app.css */

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

</style>
