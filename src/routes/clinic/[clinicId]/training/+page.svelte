<script lang="ts">
	import type { Personnel, TrainingType, PersonnelTraining } from '$lib/types';
	import { trainingTypesStore } from '$lib/stores/trainingTypes.svelte';
	import { personnelTrainingsStore } from '$lib/stores/personnelTrainings.svelte';
	import { themeStore } from '$lib/stores/theme.svelte';
	import { getTrainingStats } from '$lib/utils/trainingStatus';
	import TrainingMatrix from '$lib/components/TrainingMatrix.svelte';
	import TrainingRecordModal from '$lib/components/TrainingRecordModal.svelte';
	import TrainingTypeManager from '$lib/components/TrainingTypeManager.svelte';
	import TrainingReports from '$lib/components/TrainingReports.svelte';
	import BulkTrainingImporter from '$lib/components/BulkTrainingImporter.svelte';

	let { data } = $props();

	// Hydrate stores with server data
	$effect(() => {
		trainingTypesStore.load(data.trainingTypes, data.clinicId);
		personnelTrainingsStore.load(data.personnelTrainings, data.clinicId);
	});

	let showTypeManager = $state(false);
	let showReports = $state(false);
	let showBulkImporter = $state(false);
	let selectedGroupId = $state<string>('');

	let selectedPerson = $state<Personnel | null>(null);
	let selectedType = $state<TrainingType | null>(null);
	let selectedTraining = $state<PersonnelTraining | undefined>(undefined);

	const RANK_ORDER = [
		'GEN', 'LTG', 'MG', 'BG', 'COL', 'LTC', 'MAJ', 'CPT', '1LT', '2LT',
		'CW5', 'CW4', 'CW3', 'CW2', 'WO1',
		'CSM', 'SGM', '1SG', 'MSG', 'SFC', 'SSG', 'SGT',
		'CPL', 'SPC', 'PFC', 'PV2', 'PV1',
		'CIV'
	];

	const filteredPersonnel = $derived(() => {
		let personnel = data.personnel;

		// Filter by group if selected
		if (selectedGroupId) {
			personnel = personnel.filter((p) => p.groupId === selectedGroupId);
		}

		// Sort by rank then name
		return [...personnel].sort((a, b) => {
			const rankDiff = RANK_ORDER.indexOf(a.rank) - RANK_ORDER.indexOf(b.rank);
			if (rankDiff !== 0) return rankDiff;
			const lastNameDiff = a.lastName.localeCompare(b.lastName);
			if (lastNameDiff !== 0) return lastNameDiff;
			return a.firstName.localeCompare(b.firstName);
		});
	});

	const stats = $derived(
		getTrainingStats(filteredPersonnel(), trainingTypesStore.list, personnelTrainingsStore.list)
	);

	function handleCellClick(
		person: Personnel,
		type: TrainingType,
		training: PersonnelTraining | undefined
	) {
		selectedPerson = person;
		selectedType = type;
		selectedTraining = training;
	}

	function closeRecordModal() {
		selectedPerson = null;
		selectedType = null;
		selectedTraining = undefined;
	}

	async function handleSaveTraining(data: Omit<PersonnelTraining, 'id'>) {
		await personnelTrainingsStore.add(data);
	}

	async function handleRemoveTraining(id: string) {
		await personnelTrainingsStore.remove(id);
	}

	async function handleAddType(data: Omit<TrainingType, 'id'>) {
		await trainingTypesStore.add(data);
	}

	async function handleUpdateType(id: string, data: Partial<Omit<TrainingType, 'id'>>) {
		await trainingTypesStore.update(id, data);
	}

	async function handleRemoveType(id: string) {
		await trainingTypesStore.remove(id);
		personnelTrainingsStore.removeByTrainingTypeLocal(id);
	}

	async function handleBulkAddTrainings(trainings: Omit<PersonnelTraining, 'id'>[]) {
		for (const training of trainings) {
			await personnelTrainingsStore.add(training);
		}
		showBulkImporter = false;
	}
</script>

<svelte:head>
	<title>Training & Certifications - Troop to Task</title>
</svelte:head>

<div class="page">
	<header class="page-header">
		<div class="header-left">
			<a href="/clinic/{data.clinicId}" class="back-link">&larr; Back to Calendar</a>
			<h1>Training & Certifications</h1>
		</div>
		<div class="header-actions">
			<button class="btn btn-secondary btn-sm" onclick={() => (showBulkImporter = true)}>
				Bulk Import
			</button>
			<button class="btn btn-secondary btn-sm" onclick={() => (showReports = true)}>
				Reports
			</button>
			<button class="btn btn-secondary btn-sm" onclick={() => (showTypeManager = true)}>
				Manage Types
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

	<div class="stats-bar">
		<div class="stat current">
			<span class="stat-value">{stats.current}</span>
			<span class="stat-label">Current</span>
		</div>
		<div class="stat warning-yellow">
			<span class="stat-value">{stats.warningYellow}</span>
			<span class="stat-label">Expiring (60d)</span>
		</div>
		<div class="stat warning-orange">
			<span class="stat-value">{stats.warningOrange}</span>
			<span class="stat-label">Expiring (30d)</span>
		</div>
		<div class="stat expired">
			<span class="stat-value">{stats.expired}</span>
			<span class="stat-label">Expired</span>
		</div>
		<div class="stat not-completed">
			<span class="stat-value">{stats.notCompleted}</span>
			<span class="stat-label">Not Done</span>
		</div>
	</div>

	<div class="filter-bar">
		<label class="filter-label">
			Filter by Group:
			<select class="select" bind:value={selectedGroupId}>
				<option value="">All Groups</option>
				{#each data.groups as group (group.id)}
					<option value={group.id}>{group.name}</option>
				{/each}
			</select>
		</label>
		<span class="filter-count">{filteredPersonnel().length} personnel</span>
	</div>

	<main class="page-content">
		{#if trainingTypesStore.list.length === 0}
			<div class="empty-state">
				<p>No training types defined yet.</p>
				<button class="btn btn-primary" onclick={() => (showTypeManager = true)}>
					Add Training Types
				</button>
			</div>
		{:else if filteredPersonnel().length === 0}
			<div class="empty-state">
				<p>No personnel found.</p>
			</div>
		{:else}
			<TrainingMatrix
				personnel={filteredPersonnel()}
				trainingTypes={trainingTypesStore.list}
				trainings={personnelTrainingsStore.list}
				onCellClick={handleCellClick}
			/>
		{/if}
	</main>
</div>

{#if selectedPerson && selectedType}
	<TrainingRecordModal
		person={selectedPerson}
		trainingType={selectedType}
		existingTraining={selectedTraining}
		onSave={handleSaveTraining}
		onRemove={handleRemoveTraining}
		onClose={closeRecordModal}
	/>
{/if}

{#if showTypeManager}
	<TrainingTypeManager
		trainingTypes={trainingTypesStore.list}
		availableRoles={data.availableRoles}
		onAdd={handleAddType}
		onUpdate={handleUpdateType}
		onRemove={handleRemoveType}
		onClose={() => (showTypeManager = false)}
	/>
{/if}

{#if showReports}
	<TrainingReports
		personnel={filteredPersonnel()}
		trainingTypes={trainingTypesStore.list}
		trainings={personnelTrainingsStore.list}
		groups={data.groups}
		onClose={() => (showReports = false)}
	/>
{/if}

{#if showBulkImporter}
	<BulkTrainingImporter
		personnel={data.personnel}
		trainingTypes={trainingTypesStore.list}
		onBulkAdd={handleBulkAddTrainings}
		onClose={() => (showBulkImporter = false)}
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
		min-width: 100px;
	}

	.stat.current {
		background-color: rgba(34, 197, 94, 0.1);
		border: 1px solid #22c55e;
	}

	.stat.warning-yellow {
		background-color: rgba(234, 179, 8, 0.1);
		border: 1px solid #eab308;
	}

	.stat.warning-orange {
		background-color: rgba(249, 115, 22, 0.1);
		border: 1px solid #f97316;
	}

	.stat.expired {
		background-color: rgba(239, 68, 68, 0.1);
		border: 1px solid #ef4444;
	}

	.stat.not-completed {
		background-color: rgba(107, 114, 128, 0.1);
		border: 1px solid #6b7280;
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

	.filter-label .select {
		width: 200px;
	}

	.filter-count {
		font-size: var(--font-size-sm);
		color: var(--color-text-muted);
	}

	.page-content {
		flex: 1;
		padding: var(--spacing-lg);
		overflow: hidden;
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

	/* Mobile Responsive Styles */
	@media (max-width: 640px) {
		.page-header {
			flex-wrap: wrap;
			gap: var(--spacing-sm);
			padding: var(--spacing-sm) var(--spacing-md);
		}

		.header-left {
			width: 100%;
			gap: var(--spacing-sm);
		}

		.page-header h1 {
			font-size: var(--font-size-lg);
		}

		.header-actions {
			width: 100%;
			flex-wrap: wrap;
			justify-content: flex-end;
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
			flex-direction: column;
			align-items: flex-start;
			width: 100%;
		}

		.filter-label .select {
			width: 100%;
		}

		.page-content {
			padding: var(--spacing-sm);
		}
	}

	/* Tablet Responsive Styles */
	@media (min-width: 641px) and (max-width: 1024px) {
		.stats-bar {
			flex-wrap: wrap;
			justify-content: flex-start;
		}

		.stat {
			min-width: 90px;
		}
	}
</style>
