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
	<PageToolbar title="Critical Tasks" subtitle="ICTL readiness" {overflowItems} />

	{#if !permissions.canViewTraining}
		<section class="page-message" aria-labelledby="critical-tasks-restricted-title">
			<h2 id="critical-tasks-restricted-title">Access Restricted</h2>
			<p>Contact your organization admin for training access.</p>
		</section>
	{:else if loading}
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

				<label class="gap-toggle">
					<input type="checkbox" checked={gapsOnly} onchange={handleGapsOnlyChange} />
					<span>Show readiness gaps only</span>
				</label>

				<div class="matrix-counts" aria-label="Critical Tasks matrix totals">
					<span>{personnelStore.items.length} personnel</span>
					<span>{activeTasks.length} active tasks</span>
					<span>{personnelIctCompletionsStore.items.length} validations</span>
				</div>
			</div>

			<IctMatrix
				personnel={personnelStore.items}
				tasks={ictTasksStore.items}
				completions={personnelIctCompletionsStore.items}
				groups={groupsStore.items}
				settings={criticalTasksSettings}
				canEdit={canEditTraining}
				onSelectCell={handleMatrixCellSelection}
				{selectedGroupId}
				{gapsOnly}
				{orgName}
			/>
		</section>
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
{/if}

<style>
	.page {
		min-height: 100%;
	}

	.workspace-state,
	.page-message {
		padding: var(--sp-6);
	}

	.matrix-workspace {
		display: flex;
		flex-direction: column;
		gap: var(--sp-4);
		min-height: 0;
		padding: var(--sp-6);
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

	.matrix-controls {
		display: flex;
		flex-wrap: wrap;
		align-items: end;
		gap: var(--sp-4);
		padding: var(--sp-3);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-md);
		background: var(--surface-panel);
	}

	.filter-field {
		display: flex;
		min-width: 12rem;
		flex-direction: column;
		gap: var(--sp-1);
	}

	.filter-field label,
	.gap-toggle,
	.matrix-counts {
		color: var(--text-secondary);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		letter-spacing: var(--letter-spacing-mono);
		text-transform: uppercase;
	}

	.gap-toggle {
		display: inline-flex;
		align-items: center;
		gap: var(--sp-2);
		min-height: 2.5rem;
		cursor: pointer;
	}

	.gap-toggle input {
		width: 1rem;
		height: 1rem;
	}

	.matrix-counts {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-3);
		margin-left: auto;
	}

	@media (max-width: 720px) {
		.matrix-workspace {
			padding: var(--sp-3);
		}

		.matrix-controls {
			align-items: stretch;
		}

		.filter-field,
		.matrix-counts {
			width: 100%;
		}

		.matrix-counts {
			margin-left: 0;
		}
	}
</style>
