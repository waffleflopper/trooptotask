<script lang="ts">
	import type { Personnel, TrainingType, PersonnelTraining } from '$lib/types';
	import { invalidateAll } from '$app/navigation';
	import { trainingTypesStore } from '$lib/stores/trainingTypes.svelte';
	import { personnelTrainingsStore } from '$lib/stores/personnelTrainings.svelte';
	import { subscriptionStore } from '$lib/stores/subscription.svelte';
	import { getTrainingStats } from '$lib/utils/trainingStatus';
	import { groupAndSortPersonnel } from '$lib/utils/personnelGrouping';
	import TrainingMatrix from '$lib/components/TrainingMatrix.svelte';
	import TrainingRecordModal from '$lib/components/TrainingRecordModal.svelte';
	import PersonTrainingEditor from '$lib/components/PersonTrainingEditor.svelte';
	import TrainingTypeManager from '$lib/components/TrainingTypeManager.svelte';
	import TrainingTypeReorder from '$lib/components/TrainingTypeReorder.svelte';
	import TrainingReports from '$lib/components/TrainingReports.svelte';
	import BulkTrainingImporter from '$lib/components/BulkTrainingImporter.svelte';
	import PageToolbar from '$lib/components/PageToolbar.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import type { OverflowItem } from '$lib/components/ui/OverflowMenu.svelte';
	import { submitDeletionRequest } from '$lib/utils/deletionRequests';

	let { data } = $props();

	// Hydrate stores with server data
	$effect(() => {
		trainingTypesStore.load(data.trainingTypes, data.orgId);
		personnelTrainingsStore.load(data.personnelTrainings, data.orgId);
	});

	// Derive available roles client-side from personnel data
	const availableRoles = $derived(
		[...new Set(data.personnel.map((p: Personnel) => p.clinicRole))].filter(Boolean).sort()
	);

	const readOnly = $derived(subscriptionStore.billingEnabled && subscriptionStore.isReadOnly);
	const canManageConfig = $derived(data.isOwner || data.isAdmin || data.isFullEditor);

	let showTypeManager = $state(false);
	let showTypeReorder = $state(false);
	let showReports = $state(false);
	let showBulkImporter = $state(false);
	let selectedGroupId = $state<string>('');
	let viewMode = $state<'alphabetical' | 'by-group'>('alphabetical');
	let collapsedGroups = $state<Set<string>>(new Set());

	const trainingOverflowItems = $derived.by<OverflowItem[]>(() => {
		const items: OverflowItem[] = [];
		// Include Reports for mobile access
		items.push({ label: 'Reports', onclick: () => (showReports = true) });
		if (canManageConfig) {
			items.push({ label: 'Bulk Import', onclick: () => (showBulkImporter = true), divider: true, disabled: readOnly });
			items.push({ label: 'Manage Types', onclick: () => (showTypeManager = true), disabled: readOnly });
			items.push({ label: 'Reorder Columns', onclick: () => (showTypeReorder = true), disabled: readOnly });
		}
		return items;
	});

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
	const groupOrder = $derived(data.groups.map((g) => g.name));
	const personnelByGroup = $derived(
		groupAndSortPersonnel(basePersonnel, {
			groupOrder,
			fallbackGroupName: data.orgName
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
		const training = personnelTrainingsStore.getById(id);
		const result = await personnelTrainingsStore.remove(id);
		if (result === 'approval_required' && training) {
			const person = data.personnel.find((p: Personnel) => p.id === training.personnelId);
			const type = trainingTypesStore.list.find((t) => t.id === training.trainingTypeId);
			const desc = `${type?.name ?? 'Training'} record for ${person ? `${person.rank} ${person.lastName}` : 'unknown'}`;
			await submitDeletionRequest(
				data.orgId,
				'personnel_training',
				id,
				desc,
				`/org/${data.orgId}/training`
			);
		}
	}

	async function handleAddType(data: Omit<TrainingType, 'id'>) {
		await trainingTypesStore.add(data);
	}

	async function handleUpdateType(id: string, data: Partial<Omit<TrainingType, 'id'>>) {
		await trainingTypesStore.update(id, data);
	}

	async function handleRemoveType(id: string) {
		const type = trainingTypesStore.list.find((t) => t.id === id);
		const result = await trainingTypesStore.remove(id);
		if (result === 'approval_required' && type) {
			await submitDeletionRequest(
				data.orgId,
				'training_type',
				id,
				`Training type: ${type.name}`,
				`/org/${data.orgId}/training`
			);
		} else if (result === 'deleted') {
			personnelTrainingsStore.removeByTrainingTypeLocal(id);
		}
	}

	async function handleBulkImportComplete() {
		await invalidateAll();
		showBulkImporter = false;
	}
</script>

<svelte:head>
	<title>Training & Certifications - Troop to Task</title>
</svelte:head>

<div class="page">
	<PageToolbar title="Training & Certifications" helpTopic="training-records" overflowItems={trainingOverflowItems}>
		<button class="btn btn-sm" onclick={() => (showReports = true)}>
			Reports
		</button>
		{#if readOnly}
			<span class="text-muted" style="font-size: var(--font-size-xs);">Upgrade to edit</span>
		{/if}
	</PageToolbar>

	{#if !data.permissions.canViewTraining}
		<div class="no-permission">
			<h2>Access Restricted</h2>
			<p>You don't have permission to view this area. Contact your organization admin for access.</p>
		</div>
	{:else}
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
			<EmptyState
				message="No training types defined yet."
				actionLabel={data.permissions.canEditTraining ? 'Manage Types' : undefined}
				onAction={data.permissions.canEditTraining ? () => (showTypeManager = true) : undefined}
			/>
		{:else if filteredPersonnel.length === 0}
			<EmptyState message="No personnel found." />
		{:else}
			<div class="view-panel" class:hidden-view={viewMode !== 'alphabetical'}>
				<TrainingMatrix
					personnel={filteredPersonnel}
					trainingTypes={trainingTypesStore.list}
					trainings={personnelTrainingsStore.list}
					onCellClick={data.permissions.canEditTraining ? handleCellClick : undefined}
					onPersonClick={data.permissions.canEditTraining ? handlePersonClick : undefined}
				/>
			</div>
			<div class="view-panel" class:hidden-view={viewMode !== 'by-group'}>
				<div class="grouped-training">
					{#each personnelByGroup as grp (grp.group)}
						<div class="group-section">
							<button class="group-header" onclick={() => toggleGroup(grp.group)}>
								<span class="toggle-icon">{collapsedGroups.has(grp.group) ? '▶' : '▼'}</span>
								<span class="group-name">{grp.group}</span>
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
			</div>
		{/if}
	</main>
	{/if}
</div>

{#if selectedPerson && selectedType}
	<TrainingRecordModal
		person={selectedPerson}
		trainingType={selectedType}
		existingTraining={selectedTraining}
		onSave={handleSaveTraining}
		onRemove={handleRemoveTraining}
		onClose={closeRecordModal}
		canBeExempted={selectedType.canBeExempted}
		isExempt={selectedType.canBeExempted && selectedType.exemptPersonnelIds.includes(selectedPerson.id)}
		onToggleExempt={(exempt) => {
			const person = selectedPerson;
			const type = selectedType;
			if (!person || !type) return;
			const currentIds = type.exemptPersonnelIds;
			const updatedIds = exempt
				? [...currentIds, person.id]
				: currentIds.filter((id) => id !== person.id);
			trainingTypesStore.update(type.id, { exemptPersonnelIds: updatedIds });
			closeRecordModal();
		}}
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
		orgId={data.orgId}
		personnel={data.personnel}
		trainingTypes={trainingTypesStore.list}
		onImportComplete={handleBulkImportComplete}
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
		onToggleExempt={(typeId, exempt) => {
			const type = trainingTypesStore.list.find(t => t.id === typeId);
			if (!type || !editingPersonTraining) return;
			const currentIds = type.exemptPersonnelIds;
			const updatedIds = exempt
				? [...currentIds, editingPersonTraining.id]
				: currentIds.filter((id) => id !== editingPersonTraining!.id);
			trainingTypesStore.update(typeId, { exemptPersonnelIds: updatedIds });
		}}
	/>
{/if}

<style>
	.page {
		height: calc(100dvh - var(--header-height, 56px));
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

	.page-content {
		flex: 1;
		min-height: 0;
		overflow: hidden;
	}

	.view-panel {
		height: 100%;
		overflow: auto;
	}

	.hidden-view {
		display: none;
	}

	/* Mobile Responsive Styles */
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

		.group-content {
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
