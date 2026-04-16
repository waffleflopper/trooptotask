<script lang="ts">
	import PageToolbar from '$lib/components/PageToolbar.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import SkeletonGrid from '$lib/components/ui/SkeletonGrid.svelte';
	import { getOrgContext } from '$lib/stores/orgContext.svelte';
	import { personnelStore } from '$features/personnel/stores/personnel.svelte';
	import { groupsStore } from '$lib/stores/groups.svelte';
	import IctMatrix from '$features/critical-tasks/components/IctMatrix.svelte';
	import IctCompletionModal from '$features/critical-tasks/components/IctCompletionModal.svelte';
	import { ictTasksStore } from '$features/critical-tasks/stores/ictTasks.svelte';
	import { personnelIctCompletionsStore } from '$features/critical-tasks/stores/personnelIctCompletions.svelte';
	import { matchesCriticalTasksPersonnelSearch } from '$features/critical-tasks/utils/criticalTasksMatrix';
	import { normalizeCriticalTasksSettings } from '$features/critical-tasks/utils/ictStatus';
	import { getActiveIctTasksForLibrary } from '$features/critical-tasks/utils/ictTaskLibrary';
	import type { IctTask, PersonnelIctCompletion } from '$features/critical-tasks/criticalTasks.types';
	import type { Personnel } from '$lib/types';

	let { data } = $props();

	const org = getOrgContext();
	const orgId = $derived(data.orgId ?? org.orgId);
	const orgName = $derived(data.orgName ?? org.orgName);
	const permissions = $derived(data.permissions ?? org.permissions);
	let selectedGroupId = $state('');
	let gapsOnly = $state(false);
	let personnelSearch = $state('');
	let viewMode = $state<'alphabetical' | 'by-group'>('by-group');
	let showTaskInputModal = $state(false);
	const overflowItems = $derived(
		org.isPrivileged
			? [
					{
						label: 'Task Library',
						href: `/org/${orgId}/critical-tasks/library`
					}
				]
			: []
	);

	const storesHydratedForOrg = $derived(
		personnelStore.orgId === orgId &&
			groupsStore.orgId === orgId &&
			ictTasksStore.orgId === orgId &&
			personnelIctCompletionsStore.orgId === orgId
	);

	const loading = $derived(
		!storesHydratedForOrg ||
			personnelStore.loading ||
			groupsStore.loading ||
			ictTasksStore.loading ||
			personnelIctCompletionsStore.loading
	);

	const activeTasks = $derived(getActiveIctTasksForLibrary(ictTasksStore.items));
	const criticalTasksSettings = $derived(normalizeCriticalTasksSettings(data.criticalTasksSettings));
	const canEditTraining = $derived(permissions.canEditTraining && !org.readOnly);
	const canInputTask = $derived(permissions.canViewTraining && canEditTraining);
	const activePersonnel = $derived(personnelStore.items.filter((person) => !person.archivedAt));
	const canOpenTaskInput = $derived(canInputTask && activePersonnel.length > 0 && activeTasks.length > 0);
	const filteredPersonnel = $derived(
		activePersonnel.filter((person) => matchesCriticalTasksPersonnelSearch(person, personnelSearch))
	);
	const groupScopedPersonnel = $derived(
		selectedGroupId ? filteredPersonnel.filter((person) => person.groupId === selectedGroupId) : filteredPersonnel
	);

	interface ActiveCompletionCell {
		person: Personnel;
		task: IctTask;
		completion: PersonnelIctCompletion | undefined;
	}

	let activeCompletionCell = $state<ActiveCompletionCell | null>(null);

	$effect(() => {
		if (selectedGroupId && !groupsStore.items.some((group) => group.id === selectedGroupId)) {
			selectedGroupId = '';
		}
	});

	function readMetadataString(record: unknown, key: string): string | null {
		if (!record || typeof record !== 'object') return null;
		const value = (record as Record<string, unknown>)[key];
		return typeof value === 'string' && value.trim() ? value.trim() : null;
	}

	function getCurrentUserDisplayName(): string | null {
		const userMetadata = data.session?.user?.user_metadata;
		const rank = readMetadataString(userMetadata, 'rank');
		const fullName =
			readMetadataString(userMetadata, 'full_name') ??
			readMetadataString(userMetadata, 'name') ??
			[readMetadataString(userMetadata, 'first_name'), readMetadataString(userMetadata, 'last_name')]
				.filter((value): value is string => !!value)
				.join(' ')
				.trim() ??
			null;

		if (!fullName) return null;
		return [rank, fullName].filter(Boolean).join(' ');
	}

	const currentUserDisplayName = $derived(getCurrentUserDisplayName());

	function handleGroupFilterChange(event: Event): void {
		selectedGroupId = (event.currentTarget as HTMLSelectElement).value;
	}

	function handleGapsOnlyChange(event: Event): void {
		gapsOnly = (event.currentTarget as HTMLInputElement).checked;
	}

	function handleMatrixCellSelection(selection: ActiveCompletionCell): void {
		if (!canEditTraining) return;
		activeCompletionCell = selection;
	}

	function handleToolbarTaskInput(): void {
		if (!canOpenTaskInput) return;
		activeCompletionCell = null;
		showTaskInputModal = true;
	}

	async function handleCompletionSave(
		saveData: Omit<PersonnelIctCompletion, 'id' | 'loggedBy' | 'createdAt'>,
		existingId?: string
	): Promise<void> {
		if (existingId) {
			const updated = await personnelIctCompletionsStore.update(existingId, saveData);
			if (!updated) {
				throw new Error('Failed to update ICT completion');
			}
			return;
		}

		const created = await personnelIctCompletionsStore.add(saveData);
		if (!created) {
			throw new Error('Failed to save ICT completion');
		}
	}
</script>

<svelte:head>
	<title>Critical Tasks - Troop to Task</title>
</svelte:head>

<div class="page">
	<PageToolbar title="Critical Tasks" subtitle="ICTL readiness" {overflowItems}>
		{#if canInputTask}
			<button class="btn btn-primary" type="button" onclick={handleToolbarTaskInput} disabled={!canOpenTaskInput}>
				Input Task
			</button>
		{/if}
	</PageToolbar>

	{#if !permissions.canViewTraining}
		<section class="page-message" aria-labelledby="critical-tasks-restricted-title">
			<h2 id="critical-tasks-restricted-title">Access Restricted</h2>
			<p>Contact your organization admin for training access.</p>
		</section>
	{:else}
		<main class="page-content">
			{#if loading}
				<section class="workspace-state" data-testid="critical-tasks-loading" aria-label="Loading Critical Tasks">
					<SkeletonGrid rows={6} columns={4} />
				</section>
			{:else if activeTasks.length === 0}
				<section class="workspace-state">
					<EmptyState message="No critical tasks yet. Add ICTL tasks to begin tracking annual proficiency." />
				</section>
			{:else}
				<section class="matrix-workspace" aria-label="Critical Tasks matrix workspace">
					<div class="matrix-controls">
						<div class="controls-row">
							<div class="matrix-filter-controls">
								<div class="filter-field">
									<label for="critical-tasks-search">Search</label>
									<input
										id="critical-tasks-search"
										type="search"
										class="input"
										data-testid="critical-tasks-search"
										aria-label="Search by name, rank, or MOS"
										placeholder="Search name, rank, or MOS..."
										bind:value={personnelSearch}
									/>
								</div>

								<div class="filter-field">
									<label for="critical-tasks-group-filter">Group</label>
									<select
										id="critical-tasks-group-filter"
										class="input"
										value={selectedGroupId}
										onchange={handleGroupFilterChange}
									>
										<option value="">All groups</option>
										{#each groupsStore.items as group (group.id)}
											<option value={group.id}>{group.name}</option>
										{/each}
									</select>
								</div>
							</div>

							<div class="controls-actions">
								<label class="gap-toggle">
									<span>Show readiness gaps only</span>
									<input type="checkbox" checked={gapsOnly} onchange={handleGapsOnlyChange} />
								</label>

								<div class="view-toggle">
									<span class="view-label">View:</span>
									<div class="view-toggle-controls" role="group" aria-label="Critical Tasks matrix view mode">
										<button
											class="view-btn"
											type="button"
											aria-pressed={viewMode === 'alphabetical'}
											class:active={viewMode === 'alphabetical'}
											onclick={() => (viewMode = 'alphabetical')}
										>
											A-Z
										</button>
										<button
											class="view-btn"
											type="button"
											aria-pressed={viewMode === 'by-group'}
											class:active={viewMode === 'by-group'}
											onclick={() => (viewMode = 'by-group')}
										>
											By Group
										</button>
									</div>
								</div>
							</div>
						</div>

						<div class="controls-footer">
							<div class="matrix-counts" aria-label="Critical Tasks matrix totals">
								{#if personnelSearch.trim() || selectedGroupId}
									<div class="stat-item">
										<span class="stat-value">{groupScopedPersonnel.length}</span>
										<span class="stat-label">matching personnel</span>
									</div>
								{:else}
									<div class="stat-item">
										<span class="stat-value">{activePersonnel.length}</span>
										<span class="stat-label">personnel</span>
									</div>
								{/if}
								{#if groupScopedPersonnel.length !== activePersonnel.length}
									<div class="stat-item">
										<span class="stat-value">{activePersonnel.length}</span>
										<span class="stat-label">total</span>
									</div>
								{/if}
								<div class="stat-item">
									<span class="stat-value">{activeTasks.length}</span>
									<span class="stat-label">active tasks</span>
								</div>
								<div class="stat-item">
									<span class="stat-value">{personnelIctCompletionsStore.items.length}</span>
									<span class="stat-label">validations</span>
								</div>
							</div>
						</div>
					</div>

					<div class="matrix-panel" data-testid="critical-tasks-matrix-panel">
						<IctMatrix
							{orgId}
							personnel={filteredPersonnel}
							tasks={ictTasksStore.items}
							completions={personnelIctCompletionsStore.items}
							groups={groupsStore.items}
							settings={criticalTasksSettings}
							canEdit={canEditTraining}
							onSelectCell={handleMatrixCellSelection}
							{selectedGroupId}
							{gapsOnly}
							{viewMode}
							{orgName}
						/>
					</div>
				</section>
			{/if}
		</main>
	{/if}
</div>

{#if activeCompletionCell}
	<IctCompletionModal
		person={activeCompletionCell.person}
		task={activeCompletionCell.task}
		existingCompletion={activeCompletionCell.completion}
		settings={criticalTasksSettings}
		{currentUserDisplayName}
		onSave={handleCompletionSave}
		onClose={() => (activeCompletionCell = null)}
	/>
{:else if showTaskInputModal}
	<IctCompletionModal
		personnelOptions={activePersonnel}
		taskOptions={activeTasks}
		completions={personnelIctCompletionsStore.items}
		settings={criticalTasksSettings}
		{currentUserDisplayName}
		onSave={handleCompletionSave}
		onClose={() => (showTaskInputModal = false)}
	/>
{/if}

<style>
	.page {
		height: calc(100dvh - var(--header-height, 56px) - var(--banner-height, 0px));
		min-height: 0;
		display: flex;
		flex-direction: column;
		overflow: hidden;
		background: var(--surface-page);
	}

	.page-content {
		flex: 1;
		min-height: 0;
		overflow: hidden;
		padding: var(--sp-6);
	}

	.workspace-state,
	.page-message {
		padding: 0;
		height: 100%;
		overflow: auto;
	}

	.matrix-workspace {
		display: flex;
		flex-direction: column;
		height: 100%;
		flex: 1;
		gap: var(--sp-4);
		min-height: 0;
	}

	.matrix-panel {
		flex: 1;
		min-height: 0;
		overflow: hidden;
	}

	.page-message {
		max-width: 52rem;
	}

	.page-message h2 {
		margin: 0 0 var(--sp-2);
		color: var(--text-primary);
		font-family: var(--font-display);
		font-size: var(--text-2xl);
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}

	.page-message p {
		margin: 0;
		color: var(--text-secondary);
	}

	/* ── Matrix Controls ───────────────────────────────────── */

	.matrix-controls {
		display: flex;
		flex-direction: column;
		border: 1px solid var(--border-default);
		border-radius: var(--radius-md);
		background: var(--surface-panel);
		overflow: hidden;
	}

	/* Main controls row: filters left, display options right */
	.controls-row {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		gap: var(--sp-4);
		padding: var(--sp-3) var(--sp-4);
	}

	.matrix-filter-controls {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		gap: var(--sp-4);
		min-width: 0;
	}

	.filter-field {
		display: flex;
		min-width: 12rem;
		flex-direction: column;
		gap: var(--sp-1);
	}

	.filter-field label {
		color: var(--text-tertiary);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		letter-spacing: var(--letter-spacing-mono);
		text-transform: uppercase;
	}

	/* Display options: view toggle + gaps checkbox, pushed right */
	.controls-actions {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		gap: var(--sp-4);
		margin-left: auto;
	}

	.view-toggle {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
	}

	.view-label {
		color: var(--text-tertiary);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		letter-spacing: var(--letter-spacing-mono);
		text-transform: uppercase;
		white-space: nowrap;
	}

	.view-toggle-controls {
		display: inline-flex;
		align-items: stretch;
	}

	.view-toggle-controls .view-btn + .view-btn {
		margin-left: -1px;
	}

	.view-btn {
		appearance: none;
		min-height: 32px;
		padding: 0 12px;
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: 0.1em;
		text-transform: uppercase;
		border: var(--border-thin);
		background: var(--surface-panel);
		color: var(--text-secondary);
		cursor: pointer;
		transition:
			background-color var(--transition-fast),
			border-color var(--transition-fast),
			color var(--transition-fast);
	}

	.view-btn:first-of-type {
		border-radius: var(--radius-sm) 0 0 var(--radius-sm);
	}

	.view-btn:last-of-type {
		border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
	}

	.view-btn:hover {
		background: var(--surface-subtle);
		color: var(--text-primary);
	}

	.view-btn.active {
		background: color-mix(in srgb, var(--amber-light) 86%, var(--surface-panel) 14%);
		border-color: var(--amber);
		color: var(--amber-dark);
	}

	.gap-toggle {
		display: inline-flex;
		align-items: center;
		gap: var(--sp-2);
		min-height: 2rem;
		cursor: pointer;
		color: var(--text-secondary);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		letter-spacing: var(--letter-spacing-mono);
		text-transform: uppercase;
		white-space: nowrap;
	}

	.gap-toggle input {
		width: 1rem;
		height: 1rem;
		flex-shrink: 0;
		accent-color: var(--amber);
	}

	/* ── Stats footer strip ─────────────────────────────────── */

	.controls-footer {
		border-top: 1px solid var(--ink-15);
		background: var(--surface-subtle);
		padding: var(--sp-2) var(--sp-4);
	}

	.matrix-counts {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0;
	}

	.stat-item {
		display: flex;
		align-items: baseline;
		gap: var(--sp-1);
		padding: 0 var(--sp-3);
	}

	.stat-item:first-child {
		padding-left: 0;
	}

	.stat-item + .stat-item {
		border-left: 1px solid var(--ink-15);
	}

	.stat-value {
		font-family: var(--font-mono);
		font-size: var(--text-sm);
		font-weight: var(--font-weight-semibold);
		color: var(--text-primary);
		letter-spacing: 0;
	}

	.stat-label {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		color: var(--text-tertiary);
		letter-spacing: var(--letter-spacing-mono);
		text-transform: uppercase;
	}

	/* ── Responsive ─────────────────────────────────────────── */

	@media (max-width: 720px) {
		.page-content {
			padding: var(--sp-3);
		}

		.matrix-workspace {
			gap: var(--sp-3);
		}

		.controls-row {
			flex-direction: column;
			align-items: stretch;
			gap: var(--sp-3);
		}

		.matrix-filter-controls {
			width: 100%;
		}

		.filter-field {
			flex: 1;
			min-width: 0;
		}

		.controls-actions {
			margin-left: 0;
			width: 100%;
			flex-direction: column;
			align-items: flex-start;
			gap: var(--sp-3);
		}

		.gap-toggle {
			white-space: normal;
		}

		.controls-footer {
			overflow-x: auto;
		}
	}
</style>
