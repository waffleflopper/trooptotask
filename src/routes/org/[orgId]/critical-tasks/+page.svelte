<script lang="ts">
	import { SvelteURLSearchParams } from 'svelte/reactivity';
	import * as Empty from '$lib/components/ui/empty';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { Button } from '$lib/components/ui/button';
	import * as ButtonGroup from '$lib/components/ui/button-group';
	import { Toggle } from '$lib/components/ui/toggle';
	import * as WorkspaceToolbar from '$lib/components/ui/workspace-toolbar';
	import { createRosterReadModel } from '$features/personnel/contracts';
	import { getOrgContext } from '$lib/stores/orgContext.svelte';
	import { rosterStore } from '$lib/stores/roster.svelte';
	import { groupsStore } from '$lib/stores/groups.svelte';
	import IctCompletionBulkImport from '$features/critical-tasks/components/IctCompletionBulkImport.svelte';
	import IctCompletionModal from '$features/critical-tasks/components/IctCompletionModal.svelte';
	import IctMatrix from '$features/critical-tasks/components/IctMatrix.svelte';
	import { ictTasksStore } from '$features/critical-tasks/stores/ictTasks.svelte';
	import { personnelIctCompletionsStore } from '$features/critical-tasks/stores/personnelIctCompletions.svelte';
	import {
		criticalTasksConfigureLibraryAffordance,
		criticalTasksRecordCompletionAffordance,
		criticalTasksViewReadinessAffordance
	} from '$features/critical-tasks/utils/criticalTasksPolicy';
	import { criticalTasksSettingsFromWorkspaceData } from '$features/critical-tasks/utils/criticalTasksWorkspaceData';
	import { normalizeCriticalTasksSettings } from '$features/critical-tasks/utils/ictStatus';
	import { getActiveIctTasksForLibrary } from '$features/critical-tasks/utils/ictTaskLibrary';
	import type { IctTask, PersonnelIctCompletion } from '$features/critical-tasks/criticalTasks.types';
	import type { WorkspaceToolbarAction } from '$lib/components/ui/workspace-toolbar';
	import type { Personnel } from '$lib/types';

	let { data } = $props();

	const org = getOrgContext();
	const orgId = $derived(org.orgId);
	const orgUrlSegment = $derived(org.orgUrlSegment ?? orgId);
	const orgName = $derived(org.orgName);
	let selectedGroupId = $state('');
	let gapsOnly = $state(false);
	let personnelSearch = $state('');
	let viewMode = $state<'alphabetical' | 'by-group'>('by-group');
	let showTaskInputModal = $state(false);
	let showCompletionImportModal = $state(false);
	const reportsHref = $derived(`/org/${orgUrlSegment}/critical-tasks/reports`);
	const taskLibraryHref = $derived(`/org/${orgUrlSegment}/critical-tasks/library`);

	const storesHydratedForOrg = $derived(
		rosterStore.orgId === orgId &&
			groupsStore.orgId === orgId &&
			ictTasksStore.orgId === orgId &&
			personnelIctCompletionsStore.orgId === orgId
	);

	const loading = $derived(
		!storesHydratedForOrg ||
			rosterStore.loading ||
			groupsStore.loading ||
			ictTasksStore.loading ||
			personnelIctCompletionsStore.loading
	);

	const activeTasks = $derived(getActiveIctTasksForLibrary(ictTasksStore.items));
	const criticalTasksSettings = $derived(
		normalizeCriticalTasksSettings(criticalTasksSettingsFromWorkspaceData(data, orgId))
	);
	const viewReadinessAffordance = $derived(criticalTasksViewReadinessAffordance(org));
	const recordCompletionAffordance = $derived(criticalTasksRecordCompletionAffordance(org));
	const configureLibraryAffordance = $derived(criticalTasksConfigureLibraryAffordance(org));
	const canViewReadiness = $derived(viewReadinessAffordance.allowed);
	const canRecordCompletion = $derived(recordCompletionAffordance.allowed);
	const canConfigureLibrary = $derived(configureLibraryAffordance.allowed);
	const canInputTask = $derived(canViewReadiness && canRecordCompletion);
	const groupOrder = $derived(
		[...groupsStore.items]
			.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name))
			.map((g) => g.name)
	);
	const rosterReadModel = $derived(
		rosterStore.orgId === orgId
			? rosterStore.readModel({
					groupOrder,
					fallbackGroupName: orgName
				})
			: createRosterReadModel({
					personnel: [],
					groupOrder,
					fallbackGroupName: orgName
				})
	);
	const activeRosterView = $derived(rosterReadModel.scoped(org.scopeSet, { status: 'active' }));
	const activePersonnel = $derived(activeRosterView.flatPersonnel);
	const canOpenTaskInput = $derived(canInputTask && activePersonnel.length > 0 && activeTasks.length > 0);
	const canOpenCompletionImport = $derived(
		canInputTask && activePersonnel.length > 0 && ictTasksStore.items.length > 0
	);
	const groupFilterOptions = $derived(
		activeRosterView.groupFilterOptions.map((option) => ({
			value: option.value,
			label: option.value ? option.label : 'Group: All'
		}))
	);
	const effectiveSelectedGroupId = $derived(
		selectedGroupId && groupFilterOptions.some((option) => option.value === selectedGroupId) ? selectedGroupId : ''
	);
	const matrixViewOptions = [
		{ value: 'alphabetical', label: 'A-Z' },
		{ value: 'by-group', label: 'Group' }
	];
	const activeFilterCount = $derived(
		(effectiveSelectedGroupId ? 1 : 0) + (gapsOnly ? 1 : 0) + (personnelSearch.trim() ? 1 : 0)
	);
	const filteredPersonnel = $derived(
		rosterReadModel.scoped(org.scopeSet, { status: 'active', search: personnelSearch }).flatPersonnel
	);

	interface ActiveCompletionCell {
		person: Personnel;
		task: IctTask;
		completion: PersonnelIctCompletion | undefined;
	}

	let activeCompletionCell = $state<ActiveCompletionCell | null>(null);
	let matrixExportLoading = $state(false);
	let matrixExportError = $state('');

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
		if (!canRecordCompletion) return;
		activeCompletionCell = selection;
	}

	const matrixExportHref = $derived.by(() => {
		const params = new SvelteURLSearchParams();
		if (effectiveSelectedGroupId) {
			params.set('groupFilter', effectiveSelectedGroupId);
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

	async function exportMatrixExcel(): Promise<void> {
		if (matrixExportLoading) return;
		matrixExportLoading = true;
		matrixExportError = '';
		try {
			const response = await fetch(matrixExportHref);
			if (!response.ok) {
				throw new Error('Failed to export critical task matrix');
			}
			const blob = await response.blob();
			const { downloadBlob, filenameFromContentDisposition } = await import('$lib/export/workbook');
			downloadBlob(
				blob,
				filenameFromContentDisposition(response.headers.get('Content-Disposition'), 'critical-task-matrix.xlsx')
			);
		} catch (error) {
			matrixExportError = error instanceof Error ? error.message : 'Failed to export critical task matrix';
		} finally {
			matrixExportLoading = false;
		}
	}

	const toolbarActionItems = $derived.by<WorkspaceToolbarAction[]>(() => {
		const items: WorkspaceToolbarAction[] = [
			{
				id: 'export-excel',
				label: matrixExportLoading ? 'Exporting...' : 'Export Excel',
				onclick: exportMatrixExcel,
				icon: 'download',
				priority: 'low',
				variant: 'default',
				disabled: matrixExportLoading
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

		if (canConfigureLibrary) {
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

<div
	class="flex h-[calc(100dvh-var(--app-shell-header-height,56px)-var(--banner-height,0px))] min-h-0 flex-col overflow-hidden bg-background"
>
	{#if !canViewReadiness}
		<section class="h-full max-w-3xl overflow-auto p-4" aria-labelledby="critical-tasks-restricted-title">
			<h2 id="critical-tasks-restricted-title" class="text-2xl font-semibold text-foreground">Access Restricted</h2>
			<p class="text-muted-foreground">Contact your organization admin for critical tasks access.</p>
		</section>
	{:else}
		<main class="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-3 md:p-4">
			<WorkspaceToolbar.Root ariaLabel="Critical Tasks controls">
				<WorkspaceToolbar.Group
					label="Critical Tasks filters"
					activeCount={activeFilterCount}
					data-testid="critical-tasks-filter-group"
				>
					<ButtonGroup.Root aria-label="Critical Tasks matrix view mode">
						{#each matrixViewOptions as option (option.value)}
							<Button
								variant={viewMode === option.value ? 'secondary' : 'outline'}
								aria-pressed={viewMode === option.value}
								onclick={() => (viewMode = option.value as 'alphabetical' | 'by-group')}
							>
								{option.label}
							</Button>
						{/each}
					</ButtonGroup.Root>
					<WorkspaceToolbar.Select
						ariaLabel="Critical Tasks group filter"
						options={groupFilterOptions}
						value={effectiveSelectedGroupId}
						onValueChange={(value) => (selectedGroupId = value)}
					/>
					<Toggle
						variant="outline"
						pressed={gapsOnly}
						title={gapsOnly ? 'Showing gaps only' : 'Show gaps only'}
						onPressedChange={(pressed) => (gapsOnly = pressed)}
					>
						Show gaps only
					</Toggle>
					<WorkspaceToolbar.Search
						testId="critical-tasks-search"
						ariaLabel="Search by name, rank, or MOS"
						placeholder="Search name, rank, MOS..."
						bind:value={personnelSearch}
					/>
				</WorkspaceToolbar.Group>

				<WorkspaceToolbar.Group label="Critical Tasks actions" zone="actions">
					<WorkspaceToolbar.Actions
						actions={toolbarActionItems}
						ariaLabel="Critical Tasks actions"
						overflowAriaLabel="More Critical Tasks actions"
					/>
				</WorkspaceToolbar.Group>
			</WorkspaceToolbar.Root>

			{#if matrixExportError}
				<p class="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
					{matrixExportError}
				</p>
			{/if}

			{#if loading}
				<section class="h-full overflow-auto" data-testid="critical-tasks-loading" aria-label="Loading Critical Tasks">
					<div class="grid grid-cols-4 gap-2" aria-hidden="true">
						{#each Array(24) as _, index (index)}
							<Skeleton class="h-[38px] w-[100px]" />
						{/each}
					</div>
				</section>
			{:else if activeTasks.length === 0}
				<section class="h-full overflow-auto">
					<Empty.Root>
						<Empty.Header>
							<Empty.Title>No critical tasks yet.</Empty.Title>
							<Empty.Description>Add ICTL tasks to begin tracking annual proficiency.</Empty.Description>
						</Empty.Header>
					</Empty.Root>
				</section>
			{:else}
				<section class="flex min-h-0 flex-1 flex-col" aria-label="Critical Tasks matrix workspace">
					<div class="min-h-0 flex-1 overflow-hidden" data-testid="critical-tasks-matrix-panel">
						<IctMatrix
							orgId={orgUrlSegment}
							personnel={filteredPersonnel}
							tasks={ictTasksStore.items}
							completions={personnelIctCompletionsStore.items}
							groups={groupsStore.items}
							settings={criticalTasksSettings}
							canEdit={canRecordCompletion}
							onSelectCell={handleMatrixCellSelection}
							selectedGroupFilter={effectiveSelectedGroupId}
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
		personnel={activePersonnel}
		tasks={ictTasksStore.items}
		completions={personnelIctCompletionsStore.items}
		onCancel={() => (showCompletionImportModal = false)}
		onDone={() => (showCompletionImportModal = false)}
	/>
{/if}
