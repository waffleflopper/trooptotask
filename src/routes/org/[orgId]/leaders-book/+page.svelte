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
	import { statusTypesStore } from '$lib/stores/statusTypes.svelte';
	import { availabilityStore } from '$lib/stores/availability.svelte';
	import { trainingTypesStore } from '$lib/stores/trainingTypes.svelte';
	import { personnelTrainingsStore } from '$lib/stores/personnelTrainings.svelte';
	import { subscriptionStore } from '$lib/stores/subscription.svelte';
	import PageToolbar from '$lib/components/PageToolbar.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import type { OverflowItem } from '$lib/components/ui/OverflowMenu.svelte';
	import { submitDeletionRequest } from '$lib/utils/deletionRequests';
	import SoldierLeadersBookView from '$lib/components/SoldierLeadersBookView.svelte';
	import CounselingTypeManager from '$lib/components/CounselingTypeManager.svelte';

	let { data } = $props();

	// Hydrate stores with server data
	$effect(() => {
		personnelExtendedInfoStore.load(data.extendedInfo, data.orgId);
		counselingTypesStore.load(data.counselingTypes, data.orgId);
		counselingRecordsStore.load(data.counselingRecords, data.orgId);
		developmentGoalsStore.load(data.developmentGoals, data.orgId);
		statusTypesStore.load(data.statusTypes, data.orgId);
		availabilityStore.load(data.availability, data.orgId);
		trainingTypesStore.load(data.trainingTypes, data.orgId);
		personnelTrainingsStore.load(data.personnelTrainings, data.orgId);
	});

	const readOnly = $derived(subscriptionStore.billingEnabled && subscriptionStore.isReadOnly);
	const canManageConfig = $derived(data.isOwner || data.isAdmin || data.isFullEditor);

	let showTypeManager = $state(false);
	let selectedGroupId = $state<string>('');
	let searchQuery = $state('');
	let selectedPerson = $state<Personnel | null>(null);

	const leadersBookOverflowItems = $derived.by<OverflowItem[]>(() => {
		const items: OverflowItem[] = [];
		if (canManageConfig) {
			items.push({ label: 'Counseling Types', onclick: () => (showTypeManager = true), disabled: readOnly });
		}
		return items;
	});

	const filteredPersonnel = $derived.by(() => {
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
	const stats = $derived.by(() => {
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
		const type = counselingTypesStore.getById(id);
		const result = await counselingTypesStore.remove(id);
		if (result === 'approval_required' && type) {
			await submitDeletionRequest(
				data.orgId,
				'counseling_type',
				id,
				`Counseling type: ${type.name}`,
				`/org/${data.orgId}/leaders-book`
			);
		} else if (result === 'deleted') {
			counselingRecordsStore.removeByTypeLocal(id);
		}
	}
</script>

<svelte:head>
	<title>Leaders Book - Troop to Task</title>
</svelte:head>

<div class="page">
	<PageToolbar title="Leaders Book" helpTopic="leaders-book" overflowItems={leadersBookOverflowItems}>
		{#if readOnly}
			<span class="text-muted" style="font-size: var(--font-size-xs);">Upgrade to edit</span>
		{/if}
	</PageToolbar>

	{#if !data.permissions.canViewLeadersBook}
		<div class="no-permission">
			<h2>Access Restricted</h2>
			<p>You don't have permission to view this area. Contact your organization admin for access.</p>
		</div>
	{:else}
	<div class="stats-bar">
		<div class="stat">
			<span class="stat-value">{stats.totalPersonnel}</span>
			<span class="stat-label">Personnel</span>
		</div>
		<div class="stat info">
			<span class="stat-value">{stats.withExtendedInfo}</span>
			<span class="stat-label">With Info</span>
		</div>
		<div class="stat counseling">
			<span class="stat-value">{stats.totalCounselings}</span>
			<span class="stat-label">Counselings</span>
		</div>
		<div class="stat pending">
			<span class="stat-value">{stats.pendingCounselings}</span>
			<span class="stat-label">Pending</span>
		</div>
		<div class="stat goals">
			<span class="stat-value">{stats.completedGoals}/{stats.totalGoals}</span>
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
		<span class="filter-count">{filteredPersonnel.length} personnel</span>
	</div>

	<main class="page-content">
		{#if filteredPersonnel.length === 0}
			{#if data.personnel.length === 0}
				<EmptyState
					message="No personnel added yet."
					actionLabel="Go to Personnel"
					actionHref={`/org/${data.orgId}/personnel`}
				/>
			{:else}
				<EmptyState message="No personnel match your search." />
			{/if}
		{:else}
			<div class="personnel-grid">
				{#each filteredPersonnel as person (person.id)}
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
	{/if}
</div>

{#if selectedPerson}
	<SoldierLeadersBookView
		person={selectedPerson}
		canEdit={data.permissions.canEditLeadersBook}
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
		font-family: var(--font-mono);
		font-size: var(--font-size-lg);
		font-weight: 500;
	}

	.stat-label {
		font-family: var(--font-mono);
		font-size: var(--font-size-xs);
		text-transform: uppercase;
		letter-spacing: 0.06em;
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
		border-color: #B8943E;
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
		color: #B8943E;
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
		color: #B8943E;
	}

	.person-stat.has-data svg {
		color: #B8943E;
	}

	@media (max-width: 640px) {
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

		.personnel-grid {
			grid-template-columns: 1fr;
		}
	}

	@media (min-width: 641px) and (max-width: 1024px) {
		.stats-bar {
			flex-wrap: wrap;
			justify-content: flex-start;
		}

		.personnel-grid {
			grid-template-columns: repeat(2, 1fr);
		}
	}
</style>
