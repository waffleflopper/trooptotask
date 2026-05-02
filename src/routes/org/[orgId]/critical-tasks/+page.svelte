<script lang="ts">
	import { SvelteURLSearchParams } from 'svelte/reactivity';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import SkeletonGrid from '$lib/components/ui/SkeletonGrid.svelte';
	import {
		Toolbar,
		ToolbarActions,
		ToolbarFilterSelect,
		ToolbarGroup,
		ToolbarSearchItem,
		ToolbarToggle,
		ToolbarViewToggle
	} from '$lib/components/ui/toolbar';
	import { getOrgContext } from '$lib/stores/orgContext.svelte';
	import { personnelStore } from '$features/personnel/stores/personnel.svelte';
	import { groupsStore } from '$lib/stores/groups.svelte';
	import IctMatrix from '$features/critical-tasks/components/IctMatrix.svelte';
	import IctCompletionModal from '$features/critical-tasks/components/IctCompletionModal.svelte';
	import IctCompletionBulkImport from '$features/critical-tasks/components/IctCompletionBulkImport.svelte';
	import { ictTasksStore } from '$features/critical-tasks/stores/ictTasks.svelte';
	import { personnelIctCompletionsStore } from '$features/critical-tasks/stores/personnelIctCompletions.svelte';
	import { matchesCriticalTasksPersonnelSearch } from '$features/critical-tasks/utils/criticalTasksMatrix';
	import { normalizeCriticalTasksSettings } from '$features/critical-tasks/utils/ictStatus';
	import { getActiveIctTasksForLibrary } from '$features/critical-tasks/utils/ictTaskLibrary';
	import type { IctTask, PersonnelIctCompletion } from '$features/critical-tasks/criticalTasks.types';
	import type { ToolbarActionConfig } from '$lib/components/ui/toolbar';
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
	let showCompletionImportModal = $state(false);
	const reportsHref = $derived(`/org/${orgId}/critical-tasks/reports`);
	const taskLibraryHref = $derived(`/org/${orgId}/critical-tasks/library`);

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
	const canEditCriticalTasks = $derived(permissions.canEditCriticalTasks && !org.readOnly);
	const canInputTask = $derived(permissions.canViewCriticalTasks && canEditCriticalTasks);
	const activePersonnel = $derived(personnelStore.items.filter((person) => !person.archivedAt));
	const canOpenTaskInput = $derived(canInputTask && activePersonnel.length > 0 && activeTasks.length > 0);
	const canOpenCompletionImport = $derived(
		canInputTask && personnelStore.items.length > 0 && ictTasksStore.items.length > 0
	);
	const groupFilterOptions = $derived([
		{ value: '', label: 'Group: All' },
		...groupsStore.items.map((group) => ({ value: group.id, label: group.name }))
	]);
	const matrixViewOptions = [
		{ value: 'alphabetical', label: 'A-Z' },
		{ value: 'by-group', label: 'Group' }
	];
	const activeFilterCount = $derived((selectedGroupId ? 1 : 0) + (gapsOnly ? 1 : 0) + (personnelSearch.trim() ? 1 : 0));
	const filteredPersonnel = $derived(
		activePersonnel.filter((person) => matchesCriticalTasksPersonnelSearch(person, personnelSearch))
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

	function handleMatrixCellSelection(selection: ActiveCompletionCell): void {
		if (!canEditCriticalTasks) return;
		activeCompletionCell = selection;
	}

	const matrixExportHref = $derived.by(() => {
		const params = new SvelteURLSearchParams();
		if (selectedGroupId) {
			params.set('groupId', selectedGroupId);
		}
		if (personnelSearch.trim()) {
			params.set('search', personnelSearch.trim());
		}
		if (gapsOnly) {
			params.set('gapsOnly', 'true');
		}
		const query = params.toString();
		return `/org/${orgId}/api/critical-tasks/matrix/export${query ? `?${query}` : ''}`;
	});

	function handleToolbarTaskInput(): void {
		if (!canOpenTaskInput) return;
		activeCompletionCell = null;
		showTaskInputModal = true;
	}

	function handleCompletionImportOpen(): void {
		if (!canOpenCompletionImport) return;
		activeCompletionCell = null;
		showTaskInputModal = false;
		showCompletionImportModal = true;
	}

	const toolbarActionItems = $derived.by<ToolbarActionConfig[]>(() => {
		const items: ToolbarActionConfig[] = [
			{
				id: 'export-csv',
				label: 'Export CSV',
				href: matrixExportHref,
				icon: 'download',
				priority: 'low',
				variant: 'default'
			}
		];

		if (canInputTask) {
			items.push({
				id: 'import-completions',
				label: 'Import Completions',
				onclick: handleCompletionImportOpen,
				icon: 'upload',
				priority: 'normal',
				variant: 'default',
				disabled: !canOpenCompletionImport,
				disabledReason: !canOpenCompletionImport
					? 'Add personnel and active tasks before importing completions.'
					: undefined
			});
		}

		if (org.isPrivileged) {
			items.push({
				id: 'task-library',
				label: 'Task Library',
				href: taskLibraryHref,
				icon: 'book-open',
				priority: 'normal',
				variant: 'default'
			});
		}

		items.push({
			id: 'reports',
			label: 'Reports',
			href: reportsHref,
			icon: 'chart',
			priority: 'high',
			variant: 'default'
		});

		if (canInputTask) {
			items.push({
				id: 'record-completion',
				label: 'Record Completion',
				onclick: handleToolbarTaskInput,
				icon: 'clipboard-check',
				priority: 'critical',
				overflow: 'never',
				variant: 'primary',
				disabled: !canOpenTaskInput,
				disabledReason: !canOpenTaskInput ? 'Add personnel and active tasks before recording a completion.' : undefined
			});
		}

		return items;
	});

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
	{#if !permissions.canViewCriticalTasks}
		<section class="page-message" aria-labelledby="critical-tasks-restricted-title">
			<h2 id="critical-tasks-restricted-title">Access Restricted</h2>
			<p>Contact your organization admin for critical tasks access.</p>
		</section>
	{:else}
		<main class="page-content">
			<Toolbar ariaLabel="Critical Tasks controls" collapse="medium" leadingMin="34rem" searchCompactAt={1180}>
				{#snippet leading()}
					<ToolbarGroup
						label="Critical Tasks filters"
						activeCount={activeFilterCount}
						testId="critical-tasks-filter-group"
					>
						{#snippet full()}
							<ToolbarViewToggle
								ariaLabel="Critical Tasks matrix view mode"
								options={matrixViewOptions}
								value={viewMode}
								mode="full"
								onValueChange={(value) => (viewMode = value as 'alphabetical' | 'by-group')}
							/>
							<ToolbarFilterSelect
								ariaLabel="Critical Tasks group filter"
								options={groupFilterOptions}
								defaultValue=""
								value={selectedGroupId}
								width="wide"
								mode="full"
								onValueChange={(value) => (selectedGroupId = value)}
							/>
							<ToolbarToggle
								label="Show gaps only"
								title={gapsOnly ? 'Showing gaps only' : 'Show gaps only'}
								bind:pressed={gapsOnly}
							/>
							<ToolbarSearchItem
								testId="critical-tasks-search"
								ariaLabel="Search by name, rank, or MOS"
								placeholder="Search name, rank, MOS..."
								width="wide"
								bind:value={personnelSearch}
							/>
						{/snippet}
						{#snippet panel()}
							<ToolbarViewToggle
								ariaLabel="Critical Tasks matrix view mode"
								options={matrixViewOptions}
								value={viewMode}
								mode="full"
								onValueChange={(value) => (viewMode = value as 'alphabetical' | 'by-group')}
							/>
							<ToolbarFilterSelect
								ariaLabel="Critical Tasks group filter"
								options={groupFilterOptions}
								defaultValue=""
								value={selectedGroupId}
								width="wide"
								mode="full"
								onValueChange={(value) => (selectedGroupId = value)}
							/>
							<ToolbarToggle
								label="Show gaps only"
								title={gapsOnly ? 'Showing gaps only' : 'Show gaps only'}
								bind:pressed={gapsOnly}
							/>
							<ToolbarSearchItem
								testId="critical-tasks-search"
								ariaLabel="Search by name, rank, or MOS"
								placeholder="Search name, rank, MOS..."
								width="wide"
								mode="full"
								bind:value={personnelSearch}
							/>
						{/snippet}
					</ToolbarGroup>
				{/snippet}

				<ToolbarActions
					actions={toolbarActionItems}
					ariaLabel="Critical Tasks actions"
					overflowAriaLabel="More Critical Tasks actions"
					overflowIconOnly
				/>
			</Toolbar>

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
					<div class="matrix-panel" data-testid="critical-tasks-matrix-panel">
						<IctMatrix
							{orgId}
							personnel={filteredPersonnel}
							tasks={ictTasksStore.items}
							completions={personnelIctCompletionsStore.items}
							groups={groupsStore.items}
							settings={criticalTasksSettings}
							canEdit={canEditCriticalTasks}
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

{#if showCompletionImportModal}
	<IctCompletionBulkImport
		personnel={personnelStore.items}
		tasks={ictTasksStore.items}
		completions={personnelIctCompletionsStore.items}
		onCancel={() => (showCompletionImportModal = false)}
		onDone={() => (showCompletionImportModal = false)}
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
		padding: var(--sp-4);
		display: flex;
		flex-direction: column;
		gap: var(--sp-3);
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

	/* ── Responsive ─────────────────────────────────────────── */

	@media (max-width: 720px) {
		.page-content {
			padding: var(--sp-3);
		}

		.matrix-workspace {
			gap: var(--sp-3);
		}
	}
</style>
