<script lang="ts">
	import type { Personnel, TrainingType, PersonnelTraining } from '$lib/types';
	import { trainingTypesStore } from '$lib/stores/trainingTypes.svelte';
	import { personnelTrainingsStore } from '$lib/stores/personnelTrainings.svelte';
	import { themeStore } from '$lib/stores/theme.svelte';
	import { getTrainingStats } from '$lib/utils/trainingStatus';
	import { groupAndSortPersonnel } from '$lib/utils/personnelGrouping';
	import TrainingMatrix from '$lib/components/TrainingMatrix.svelte';
	import TrainingRecordModal from '$lib/components/TrainingRecordModal.svelte';
	import PersonTrainingEditor from '$lib/components/PersonTrainingEditor.svelte';
	import TrainingTypeManager from '$lib/components/TrainingTypeManager.svelte';
	import TrainingTypeReorder from '$lib/components/TrainingTypeReorder.svelte';
	import TrainingReports from '$lib/components/TrainingReports.svelte';
	import BulkTrainingImporter from '$lib/components/BulkTrainingImporter.svelte';
	import Sidebar from '$lib/components/Sidebar.svelte';

	let { data } = $props();
	let showSidebar = $state(false);

	// Hydrate stores with server data
	$effect(() => {
		trainingTypesStore.load(data.trainingTypes, data.orgId);
		personnelTrainingsStore.load(data.personnelTrainings, data.orgId);
	});

	// Derive available roles client-side from personnel data
	const availableRoles = $derived(
		[...new Set(data.personnel.map((p: Personnel) => p.clinicRole))].filter(Boolean).sort()
	);

	let showTypeManager = $state(false);
	let showTypeReorder = $state(false);
	let showReports = $state(false);
	let showBulkImporter = $state(false);
	let selectedGroupId = $state<string>('');
	let viewMode = $state<'alphabetical' | 'by-group'>('alphabetical');
	let collapsedGroups = $state<Set<string>>(new Set());

	let selectedPerson = $state<Personnel | null>(null);
	let selectedType = $state<TrainingType | null>(null);
	let selectedTraining = $state<PersonnelTraining | undefined>(undefined);
	let editingPersonTraining = $state<Personnel | null>(null);

	// Filter personnel by selected group
	const basePersonnel = $derived(
		selectedGroupId
			? data.personnel.filter((p) => p.groupId === selectedGroupId)
			: data.personnel
	);

	// Alphabetical view - sorted by name
	const filteredPersonnel = $derived(
		[...basePersonnel].sort((a, b) => {
			const lastNameDiff = a.lastName.localeCompare(b.lastName);
			if (lastNameDiff !== 0) return lastNameDiff;
			return a.firstName.localeCompare(b.firstName);
		})
	);

	// Grouped view - use shared utility with explicit group order
	const personnelByGroup = $derived(
		groupAndSortPersonnel(basePersonnel, {
			groupOrder: data.groups.map((g) => g.name)
		})
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

	const stats = $derived(
		getTrainingStats(filteredPersonnel, trainingTypesStore.list, personnelTrainingsStore.list)
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

	function handlePersonClick(person: Personnel) {
		editingPersonTraining = person;
	}

	function closePersonEditor() {
		editingPersonTraining = null;
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

<Sidebar
	orgId={data.orgId}
	orgName={data.orgName}
	isOpen={showSidebar}
	onClose={() => (showSidebar = false)}
	onToggleTheme={() => themeStore.toggle()}
	isDarkTheme={themeStore.isDark}
	permissions={data.permissions}
	allOrgs={data.allOrgs}
	onShowTrainingBulkImport={() => (showBulkImporter = true)}
	onShowTrainingReports={() => (showReports = true)}
	onShowTrainingTypeManager={() => (showTypeManager = true)}
	onShowTrainingTypeReorder={() => (showTypeReorder = true)}
/>

<div class="page">
	<header class="page-header mobile-only">
		<h1>Training & Certifications</h1>
		<button class="mobile-menu-btn" onclick={() => (showSidebar = true)} aria-label="Open menu">
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<line x1="3" y1="12" x2="21" y2="12" />
				<line x1="3" y1="6" x2="21" y2="6" />
				<line x1="3" y1="18" x2="21" y2="18" />
			</svg>
		</button>
	</header>

	<div class="toolbar-header">
		<h2>Training & Certifications</h2>
	</div>

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
		<span class="filter-count">{filteredPersonnel.length} personnel</span>
	</div>

	<main class="page-content">
		{#if trainingTypesStore.list.length === 0}
			<div class="empty-state">
				<p>No training types defined yet.</p>
				<p>Use the sidebar to add training types.</p>
			</div>
		{:else if filteredPersonnel.length === 0}
			<div class="empty-state">
				<p>No personnel found.</p>
			</div>
		{:else if viewMode === 'alphabetical'}
			<TrainingMatrix
				personnel={filteredPersonnel}
				trainingTypes={trainingTypesStore.list}
				trainings={personnelTrainingsStore.list}
				onCellClick={data.permissions.canEditTraining ? handleCellClick : undefined}
				onPersonClick={data.permissions.canEditTraining ? handlePersonClick : undefined}
			/>
		{:else}
			<div class="grouped-training">
				{#each personnelByGroup as grp (grp.group)}
					<div class="group-section">
						<button class="group-header" onclick={() => toggleGroup(grp.group)}>
							<span class="toggle-icon">{collapsedGroups.has(grp.group) ? '▶' : '▼'}</span>
							<span class="group-name">{grp.group || 'Unassigned'}</span>
							<span class="group-count">({grp.personnel.length})</span>
						</button>
						{#if !collapsedGroups.has(grp.group)}
							<div class="group-content">
								<TrainingMatrix
									personnel={grp.personnel}
									trainingTypes={trainingTypesStore.list}
									trainings={personnelTrainingsStore.list}
									onCellClick={data.permissions.canEditTraining ? handleCellClick : undefined}
									onPersonClick={data.permissions.canEditTraining ? handlePersonClick : undefined}
								/>
							</div>
						{/if}
					</div>
				{/each}
			</div>
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
		availableRoles={availableRoles}
		onAdd={handleAddType}
		onUpdate={handleUpdateType}
		onRemove={handleRemoveType}
		onClose={() => (showTypeManager = false)}
	/>
{/if}

{#if showTypeReorder}
	<TrainingTypeReorder
		trainingTypes={trainingTypesStore.list}
		onUpdate={handleUpdateType}
		onClose={() => (showTypeReorder = false)}
	/>
{/if}

{#if showReports}
	<TrainingReports
		personnel={filteredPersonnel}
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

{#if editingPersonTraining}
	<PersonTrainingEditor
		person={editingPersonTraining}
		trainingTypes={trainingTypesStore.list}
		trainings={personnelTrainingsStore.list}
		onSave={handleSaveTraining}
		onRemove={handleRemoveTraining}
		onClose={closePersonEditor}
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

	/* Mobile header - only visible on mobile */
	.page-header.mobile-only {
		display: none;
	}

	.page-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--spacing-sm) var(--spacing-md);
		background: #0F0F0F;
		color: #F0EDE6;
		border-bottom: 1px solid #2A2A2A;
	}

	.page-header h1 {
		font-family: var(--font-display);
		font-size: var(--font-size-lg);
		font-weight: 400;
	}

	.mobile-menu-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 36px;
		height: 36px;
		border-radius: 6px;
		background: transparent;
		border: 1px solid #2A2A2A;
		color: #8A8780;
	}

	.mobile-menu-btn:hover {
		border-color: #8A8780;
		color: #F0EDE6;
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
		font-family: var(--font-display);
		font-size: var(--font-size-lg);
		font-weight: 400;
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

	.filter-label .select {
		width: 200px;
	}

	.filter-count {
		font-size: var(--font-size-sm);
		color: var(--color-text-muted);
		margin-left: auto;
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

	.grouped-training {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-lg);
	}

	.group-section {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		overflow: hidden;
	}

	.group-header {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		width: 100%;
		padding: var(--spacing-md);
		background: #0F0F0F;
		color: #F0EDE6;
		font-weight: 600;
		cursor: pointer;
		border: none;
		text-align: left;
	}

	.group-header:hover {
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

	.group-content {
		padding: var(--spacing-md);
		overflow-x: auto;
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

	/* Mobile Responsive Styles */
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
			flex-direction: column;
			align-items: flex-start;
			width: 100%;
		}

		.filter-label .select {
			width: 100%;
		}

		.view-toggle {
			width: 100%;
			justify-content: flex-start;
		}

		.filter-count {
			width: 100%;
			margin-left: 0;
		}

		.page-content {
			padding: var(--spacing-sm);
		}

		.group-content {
			padding: var(--spacing-sm);
		}
	}

	/* Tablet Responsive Styles */
	@media (min-width: 641px) and (max-width: 1024px) {
		.page {
			margin-left: var(--sidebar-width);
		}

		.stats-bar {
			flex-wrap: wrap;
			justify-content: flex-start;
		}

		.stat {
			min-width: 90px;
		}
	}
</style>
