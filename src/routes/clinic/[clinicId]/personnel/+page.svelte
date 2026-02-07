<script lang="ts">
	import type { Personnel } from '$lib/types';
	import { personnelStore } from '$lib/stores/personnel.svelte';
	import { groupsStore } from '$lib/stores/groups.svelte';
	import { pinnedGroupsStore } from '$lib/stores/pinnedGroups.svelte';
	import { themeStore } from '$lib/stores/theme.svelte';
	import PersonnelModal from '$lib/components/PersonnelModal.svelte';
	import GroupManager from '$lib/components/GroupManager.svelte';
	import BulkPersonnelManager from '$lib/components/BulkPersonnelManager.svelte';

	let { data } = $props();

	$effect(() => {
		personnelStore.load(data.personnel, data.clinicId);
		groupsStore.load(data.groups, data.clinicId);
		pinnedGroupsStore.load(data.pinnedGroups, data.clinicId);
	});

	let showPersonnelModal = $state(false);
	let editingPerson = $state<Personnel | null>(null);
	let showGroupManager = $state(false);
	let showBulkManager = $state(false);
	let collapsedGroups = $state<Set<string>>(new Set());
	let searchQuery = $state('');

	const RANK_ORDER = [
		'GEN', 'LTG', 'MG', 'BG', 'COL', 'LTC', 'MAJ', 'CPT', '1LT', '2LT',
		'CW5', 'CW4', 'CW3', 'CW2', 'WO1',
		'CSM', 'SGM', '1SG', 'MSG', 'SFC', 'SSG', 'SGT',
		'CPL', 'SPC', 'PFC', 'PV2', 'PV1',
		'CIV'
	];

	const personnelByGroup = $derived(() => {
		const pinned = pinnedGroupsStore.list;
		let personnel = personnelStore.list;

		// Filter by search query
		if (searchQuery.trim()) {
			const query = searchQuery.toLowerCase();
			personnel = personnel.filter(
				(p) =>
					p.lastName.toLowerCase().includes(query) ||
					p.firstName.toLowerCase().includes(query) ||
					p.rank.toLowerCase().includes(query) ||
					p.clinicRole.toLowerCase().includes(query)
			);
		}

		const groupMap = new Map<string, Personnel[]>();

		for (const person of personnel) {
			const group = person.groupName || '';
			if (!groupMap.has(group)) {
				groupMap.set(group, []);
			}
			groupMap.get(group)!.push(person);
		}

		for (const [, people] of groupMap) {
			people.sort((a, b) => {
				const rankDiff = RANK_ORDER.indexOf(a.rank) - RANK_ORDER.indexOf(b.rank);
				if (rankDiff !== 0) return rankDiff;
				const lastNameDiff = a.lastName.localeCompare(b.lastName);
				if (lastNameDiff !== 0) return lastNameDiff;
				return a.firstName.localeCompare(b.firstName);
			});
		}

		const sortedGroups = [...groupMap.keys()].sort((a, b) => {
			const aPinned = pinned.includes(a);
			const bPinned = pinned.includes(b);
			if (aPinned && bPinned) return pinned.indexOf(a) - pinned.indexOf(b);
			if (aPinned && !bPinned) return -1;
			if (!aPinned && bPinned) return 1;
			if (a === '' && b !== '') return 1;
			if (a !== '' && b === '') return -1;
			return a.localeCompare(b);
		});

		return sortedGroups.map((group) => ({
			group,
			personnel: groupMap.get(group)!
		}));
	});

	const totalPersonnel = $derived(personnelStore.list.length);
	const filteredCount = $derived(
		personnelByGroup().reduce((sum, g) => sum + g.personnel.length, 0)
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
	<header class="page-header">
		<div class="header-left">
			<a href="/clinic/{data.clinicId}" class="back-link">&larr; Back to Calendar</a>
			<h1>Personnel</h1>
			<span class="count">({totalPersonnel})</span>
		</div>
		<div class="header-actions">
			<button class="btn btn-secondary btn-sm" onclick={() => (showBulkManager = true)}>
				Bulk Import
			</button>
			<button class="btn btn-secondary btn-sm" onclick={() => (showGroupManager = true)}>
				Manage Groups
			</button>
			<button class="btn btn-primary btn-sm" onclick={handleAdd}>
				+ Add Person
			</button>
			<button class="theme-toggle-btn" onclick={() => themeStore.toggle()} aria-label="Toggle theme">
				{#if themeStore.isDark}
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<circle cx="12" cy="12" r="5"/>
						<line x1="12" y1="1" x2="12" y2="3"/>
						<line x1="12" y1="21" x2="12" y2="23"/>
						<line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
						<line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
						<line x1="1" y1="12" x2="3" y2="12"/>
						<line x1="21" y1="12" x2="23" y2="12"/>
						<line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
						<line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
					</svg>
				{:else}
					<svg viewBox="0 0 24 24" fill="currentColor">
						<path d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"/>
					</svg>
				{/if}
			</button>
		</div>
	</header>

	<div class="toolbar">
		<input
			type="text"
			class="input search-input"
			placeholder="Search by name, rank, or role..."
			bind:value={searchQuery}
		/>
		{#if searchQuery && filteredCount !== totalPersonnel}
			<span class="filter-info">Showing {filteredCount} of {totalPersonnel}</span>
		{/if}
	</div>

	<main class="page-content">
		{#if totalPersonnel === 0}
			<div class="empty-state">
				<p>No personnel added yet.</p>
				<p>Click "Add Person" or use "Bulk Import" to get started.</p>
			</div>
		{:else}
			<div class="personnel-grid">
				{#each personnelByGroup() as grp (grp.group)}
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
	<BulkPersonnelManager
		personnelByGroup={personnelByGroup()}
		groups={groupsStore.list}
		onBulkAdd={handleBulkAdd}
		onBulkDelete={handleBulkDelete}
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

	.page-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--spacing-md) var(--spacing-lg);
		background: var(--color-primary);
		color: white;
	}

	.header-left {
		display: flex;
		align-items: center;
		gap: var(--spacing-lg);
	}

	.back-link {
		color: rgba(255, 255, 255, 0.8);
		text-decoration: none;
		font-size: var(--font-size-sm);
	}

	.back-link:hover {
		color: white;
	}

	.page-header h1 {
		font-size: var(--font-size-xl);
		font-weight: 700;
	}

	.count {
		font-size: var(--font-size-base);
		opacity: 0.8;
	}

	.header-actions {
		display: flex;
		gap: var(--spacing-sm);
	}

	.header-actions .btn-secondary {
		background: rgba(255, 255, 255, 0.1);
		border-color: rgba(255, 255, 255, 0.2);
		color: white;
	}

	.header-actions .btn-secondary:hover {
		background: rgba(255, 255, 255, 0.2);
	}

	.toolbar {
		display: flex;
		align-items: center;
		gap: var(--spacing-md);
		padding: var(--spacing-md) var(--spacing-lg);
		background: var(--color-surface);
		border-bottom: 1px solid var(--color-border);
	}

	.search-input {
		max-width: 400px;
	}

	.filter-info {
		font-size: var(--font-size-sm);
		color: var(--color-text-muted);
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
		background: var(--color-primary);
		color: white;
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
		background: var(--color-primary-light);
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
		background: var(--color-primary-light);
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

	.person-info {
		display: flex;
		align-items: center;
		gap: var(--spacing-md);
	}

	.rank {
		font-weight: 600;
		color: var(--color-primary);
		min-width: 40px;
	}

	.name {
		font-weight: 500;
	}

	.mos {
		font-size: var(--font-size-sm);
		color: var(--color-primary);
		font-weight: 500;
	}

	.role {
		font-size: var(--font-size-sm);
		color: var(--color-text-muted);
		padding: 2px var(--spacing-sm);
		background: var(--color-bg);
		border-radius: var(--radius-sm);
	}

	.theme-toggle-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		border-radius: var(--radius-md);
		background: rgba(255, 255, 255, 0.1);
		border: 1px solid rgba(255, 255, 255, 0.2);
		color: white;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.theme-toggle-btn:hover {
		background: rgba(255, 255, 255, 0.2);
	}

	.theme-toggle-btn svg {
		width: 18px;
		height: 18px;
	}
</style>
