<script lang="ts">
	import type { Personnel } from '$lib/types';
	import type {
		CounselingType,
		CounselingRecord,
		DevelopmentGoal,
		PersonnelExtendedInfo
	} from '$lib/types/leadersBook';
	import { personnelExtendedInfoStore } from '$lib/stores/personnelExtendedInfo.svelte';
	import { counselingTypesStore } from '$lib/stores/counselingTypes.svelte';
	import { counselingRecordsStore } from '$lib/stores/counselingRecords.svelte';
	import { developmentGoalsStore } from '$lib/stores/developmentGoals.svelte';
	import { themeStore } from '$lib/stores/theme.svelte';
	import Sidebar from '$lib/components/Sidebar.svelte';
	import SoldierLeadersBookView from '$lib/components/SoldierLeadersBookView.svelte';
	import CounselingTypeManager from '$lib/components/CounselingTypeManager.svelte';

	let { data } = $props();
	let showSidebar = $state(false);

	// Hydrate stores with server data
	$effect(() => {
		personnelExtendedInfoStore.load(data.extendedInfo, data.orgId);
		counselingTypesStore.load(data.counselingTypes, data.orgId);
		counselingRecordsStore.load(data.counselingRecords, data.orgId);
		developmentGoalsStore.load(data.developmentGoals, data.orgId);
	});

	let showTypeManager = $state(false);
	let selectedGroupId = $state<string>('');
	let searchQuery = $state('');
	let selectedPerson = $state<Personnel | null>(null);

	const filteredPersonnel = $derived(() => {
		let personnel = data.personnel;

		// Filter by group if selected
		if (selectedGroupId) {
			personnel = personnel.filter((p) => p.groupId === selectedGroupId);
		}

		// Filter by search query
		if (searchQuery.trim()) {
			const query = searchQuery.toLowerCase();
			personnel = personnel.filter(
				(p) =>
					p.lastName.toLowerCase().includes(query) ||
					p.firstName.toLowerCase().includes(query) ||
					p.rank.toLowerCase().includes(query)
			);
		}

		// Sort by last name then first name
		return [...personnel].sort((a, b) => {
			const lastNameDiff = a.lastName.localeCompare(b.lastName);
			if (lastNameDiff !== 0) return lastNameDiff;
			return a.firstName.localeCompare(b.firstName);
		});
	});

	// Statistics
	const stats = $derived(() => {
		const totalPersonnel = data.personnel.length;
		const withExtendedInfo = personnelExtendedInfoStore.list.length;
		const totalCounselings = counselingRecordsStore.list.length;
		const pendingCounselings = counselingRecordsStore.list.filter(
			(r) => r.status === 'draft'
		).length;
		const totalGoals = developmentGoalsStore.list.length;
		const completedGoals = developmentGoalsStore.list.filter(
			(g) => g.status === 'completed'
		).length;

		return {
			totalPersonnel,
			withExtendedInfo,
			totalCounselings,
			pendingCounselings,
			totalGoals,
			completedGoals
		};
	});

	function getPersonnelCounselingCount(personnelId: string): number {
		return counselingRecordsStore.list.filter((r) => r.personnelId === personnelId).length;
	}

	function getPersonnelGoalCount(personnelId: string): number {
		return developmentGoalsStore.list.filter((g) => g.personnelId === personnelId).length;
	}

	function hasExtendedInfo(personnelId: string): boolean {
		return !!personnelExtendedInfoStore.getByPersonnelId(personnelId);
	}

	function handlePersonClick(person: Personnel) {
		selectedPerson = person;
	}

	function closeSoldierView() {
		selectedPerson = null;
	}

	async function handleAddCounselingType(typeData: Omit<CounselingType, 'id'>) {
		await counselingTypesStore.add(typeData);
	}

	async function handleUpdateCounselingType(
		id: string,
		typeData: Partial<Omit<CounselingType, 'id'>>
	) {
		await counselingTypesStore.update(id, typeData);
	}

	async function handleRemoveCounselingType(id: string) {
		await counselingTypesStore.remove(id);
		counselingRecordsStore.removeByTypeLocal(id);
	}
</script>

<svelte:head>
	<title>Leaders Book - Troop to Task</title>
</svelte:head>

<Sidebar
	orgId={data.orgId}
	orgName={data.orgName}
	isOpen={showSidebar}
	onClose={() => (showSidebar = false)}
	onToggleTheme={() => themeStore.toggle()}
	isDarkTheme={themeStore.isDark}
	permissions={data.permissions}
	allOrgs={data.allOrgs}
	onShowCounselingTypeManager={() => (showTypeManager = true)}
/>

<div class="page">
	<header class="page-header mobile-only">
		<h1>Leaders Book</h1>
		<button class="mobile-menu-btn" onclick={() => (showSidebar = true)} aria-label="Open menu">
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<line x1="3" y1="12" x2="21" y2="12" />
				<line x1="3" y1="6" x2="21" y2="6" />
				<line x1="3" y1="18" x2="21" y2="18" />
			</svg>
		</button>
	</header>

	<div class="toolbar-header">
		<h2>Leaders Book</h2>
	</div>

	<div class="stats-bar">
		<div class="stat">
			<span class="stat-value">{stats().totalPersonnel}</span>
			<span class="stat-label">Personnel</span>
		</div>
		<div class="stat info">
			<span class="stat-value">{stats().withExtendedInfo}</span>
			<span class="stat-label">With Info</span>
		</div>
		<div class="stat counseling">
			<span class="stat-value">{stats().totalCounselings}</span>
			<span class="stat-label">Counselings</span>
		</div>
		<div class="stat pending">
			<span class="stat-value">{stats().pendingCounselings}</span>
			<span class="stat-label">Pending</span>
		</div>
		<div class="stat goals">
			<span class="stat-value">{stats().completedGoals}/{stats().totalGoals}</span>
			<span class="stat-label">Goals Done</span>
		</div>
	</div>

	<div class="filter-bar">
		<label class="filter-label">
			<span class="filter-label-text">Group:</span>
			<select class="select" bind:value={selectedGroupId}>
				<option value="">All Groups</option>
				{#each data.groups as group (group.id)}
					<option value={group.id}>{group.name}</option>
				{/each}
			</select>
		</label>
		<div class="search-box">
			<svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<circle cx="11" cy="11" r="8" />
				<line x1="21" y1="21" x2="16.65" y2="16.65" />
			</svg>
			<input
				type="text"
				class="search-input"
				placeholder="Search personnel..."
				bind:value={searchQuery}
			/>
		</div>
		<span class="filter-count">{filteredPersonnel().length} personnel</span>
	</div>

	<main class="page-content">
		{#if filteredPersonnel().length === 0}
			<div class="empty-state">
				<p>No personnel found.</p>
			</div>
		{:else}
			<div class="personnel-grid">
				{#each filteredPersonnel() as person (person.id)}
					<button class="person-card" onclick={() => handlePersonClick(person)}>
						<div class="person-header">
							<span class="person-rank">{person.rank}</span>
							<span class="person-name">{person.lastName}, {person.firstName}</span>
						</div>
						<div class="person-details">
							{#if person.groupName}
								<span class="person-group">{person.groupName}</span>
							{/if}
							{#if person.clinicRole}
								<span class="person-role">{person.clinicRole}</span>
							{/if}
						</div>
						<div class="person-stats">
							<span class="person-stat" class:has-data={hasExtendedInfo(person.id)}>
								<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
									<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
									<circle cx="12" cy="7" r="4" />
								</svg>
								Info
							</span>
							<span class="person-stat" class:has-data={getPersonnelCounselingCount(person.id) > 0}>
								<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
									<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
									<polyline points="14 2 14 8 20 8" />
								</svg>
								{getPersonnelCounselingCount(person.id)}
							</span>
							<span class="person-stat" class:has-data={getPersonnelGoalCount(person.id) > 0}>
								<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
									<circle cx="12" cy="12" r="10" />
									<polyline points="12 6 12 12 16 14" />
								</svg>
								{getPersonnelGoalCount(person.id)}
							</span>
						</div>
					</button>
				{/each}
			</div>
		{/if}
	</main>
</div>

{#if selectedPerson}
	<SoldierLeadersBookView
		person={selectedPerson}
		canEdit={data.permissions.canEditPersonnel}
		onClose={closeSoldierView}
	/>
{/if}

{#if showTypeManager}
	<CounselingTypeManager
		counselingTypes={counselingTypesStore.list}
		onAdd={handleAddCounselingType}
		onUpdate={handleUpdateCounselingType}
		onRemove={handleRemoveCounselingType}
		onClose={() => (showTypeManager = false)}
	/>
{/if}

<style>
	.page {
		height: 100%;
		display: flex;
		flex-direction: column;
		background: var(--color-bg);
		margin-left: var(--sidebar-width);
	}

	.page-header.mobile-only {
		display: none;
	}

	.page-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--spacing-sm) var(--spacing-md);
		background: var(--color-primary);
		color: white;
	}

	.page-header h1 {
		font-size: var(--font-size-lg);
		font-weight: 700;
	}

	.mobile-menu-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 40px;
		height: 40px;
		border-radius: var(--radius-md);
		background: rgba(255, 255, 255, 0.1);
		color: white;
	}

	.mobile-menu-btn:hover {
		background: rgba(255, 255, 255, 0.2);
	}

	.mobile-menu-btn svg {
		width: 24px;
		height: 24px;
	}

	.toolbar-header {
		display: flex;
		align-items: center;
		padding: var(--spacing-md) var(--spacing-lg);
		background: var(--color-surface);
		border-bottom: 1px solid var(--color-border);
	}

	.toolbar-header h2 {
		font-size: var(--font-size-lg);
		font-weight: 600;
		color: var(--color-text);
		margin: 0;
	}

	.stats-bar {
		display: flex;
		gap: var(--spacing-md);
		padding: var(--spacing-md) var(--spacing-lg);
		background: var(--color-surface);
		border-bottom: 1px solid var(--color-border);
	}

	.stat {
		padding: var(--spacing-sm) var(--spacing-md);
		border-radius: var(--radius-md);
		text-align: center;
		min-width: 80px;
		background-color: rgba(107, 114, 128, 0.1);
		border: 1px solid #6b7280;
	}

	.stat.info {
		background-color: rgba(59, 130, 246, 0.1);
		border-color: #3b82f6;
	}

	.stat.counseling {
		background-color: rgba(139, 92, 246, 0.1);
		border-color: #8b5cf6;
	}

	.stat.pending {
		background-color: rgba(249, 115, 22, 0.1);
		border-color: #f97316;
	}

	.stat.goals {
		background-color: rgba(34, 197, 94, 0.1);
		border-color: #22c55e;
	}

	.stat-value {
		display: block;
		font-size: var(--font-size-lg);
		font-weight: 700;
	}

	.stat-label {
		font-size: var(--font-size-sm);
		color: var(--color-text-muted);
	}

	.filter-bar {
		display: flex;
		align-items: center;
		gap: var(--spacing-lg);
		padding: var(--spacing-md) var(--spacing-lg);
		background: var(--color-surface);
		border-bottom: 1px solid var(--color-border);
	}

	.filter-label {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		font-size: var(--font-size-sm);
	}

	.filter-label-text {
		color: var(--color-text-muted);
	}

	.filter-label .select {
		width: 180px;
	}

	.search-box {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		padding: var(--spacing-xs) var(--spacing-sm);
		background: var(--color-bg);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		flex: 1;
		max-width: 300px;
	}

	.search-icon {
		width: 18px;
		height: 18px;
		color: var(--color-text-muted);
	}

	.search-input {
		flex: 1;
		border: none;
		background: transparent;
		font-size: var(--font-size-sm);
		color: var(--color-text);
		outline: none;
	}

	.search-input::placeholder {
		color: var(--color-text-muted);
	}

	.filter-count {
		font-size: var(--font-size-sm);
		color: var(--color-text-muted);
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
		gap: var(--spacing-md);
		color: var(--color-text-muted);
	}

	.personnel-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
		gap: var(--spacing-md);
	}

	.person-card {
		display: flex;
		flex-direction: column;
		padding: var(--spacing-md);
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		cursor: pointer;
		transition: all 0.15s ease;
		text-align: left;
	}

	.person-card:hover {
		border-color: var(--color-primary);
		box-shadow: var(--shadow-2);
		transform: translateY(-2px);
	}

	.person-header {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		margin-bottom: var(--spacing-sm);
	}

	.person-rank {
		font-weight: 700;
		color: var(--color-primary);
	}

	.person-name {
		font-weight: 600;
		color: var(--color-text);
	}

	.person-details {
		display: flex;
		flex-wrap: wrap;
		gap: var(--spacing-sm);
		margin-bottom: var(--spacing-md);
		min-height: 24px;
	}

	.person-group,
	.person-role {
		font-size: var(--font-size-sm);
		padding: 2px var(--spacing-xs);
		background: var(--color-bg);
		border-radius: var(--radius-sm);
		color: var(--color-text-muted);
	}

	.person-stats {
		display: flex;
		gap: var(--spacing-md);
		padding-top: var(--spacing-sm);
		border-top: 1px solid var(--color-divider);
	}

	.person-stat {
		display: flex;
		align-items: center;
		gap: var(--spacing-xs);
		font-size: var(--font-size-sm);
		color: var(--color-text-muted);
	}

	.person-stat svg {
		width: 16px;
		height: 16px;
	}

	.person-stat.has-data {
		color: var(--color-primary);
	}

	.person-stat.has-data svg {
		color: var(--color-primary);
	}

	@media (max-width: 640px) {
		.page {
			margin-left: 0;
		}

		.page-header.mobile-only {
			display: flex;
		}

		.toolbar-header {
			display: none;
		}

		.stats-bar {
			flex-wrap: wrap;
			justify-content: center;
			padding: var(--spacing-sm) var(--spacing-md);
			gap: var(--spacing-sm);
		}

		.stat {
			min-width: 70px;
			padding: var(--spacing-xs) var(--spacing-sm);
		}

		.stat-value {
			font-size: var(--font-size-base);
		}

		.stat-label {
			font-size: var(--font-size-xs);
		}

		.filter-bar {
			flex-wrap: wrap;
			padding: var(--spacing-sm) var(--spacing-md);
		}

		.filter-label {
			width: 100%;
		}

		.filter-label .select {
			flex: 1;
		}

		.search-box {
			width: 100%;
			max-width: none;
		}

		.filter-count {
			width: 100%;
			margin-left: 0;
		}

		.page-content {
			padding: var(--spacing-sm);
		}

		.personnel-grid {
			grid-template-columns: 1fr;
		}
	}

	@media (min-width: 641px) and (max-width: 1024px) {
		.page {
			margin-left: var(--sidebar-width);
		}

		.stats-bar {
			flex-wrap: wrap;
			justify-content: flex-start;
		}

		.personnel-grid {
			grid-template-columns: repeat(2, 1fr);
		}
	}
</style>
