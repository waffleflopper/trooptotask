<script lang="ts">
	import { SvelteURLSearchParams } from 'svelte/reactivity';
	import * as Alert from '$lib/components/ui/alert';
	import * as Empty from '$lib/components/ui/empty';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { downloadBlob } from '$lib/utils/downloadBlob';
	import { Button } from '$lib/components/ui/button';
	import {
		WorkspaceToolbar,
		type ToolbarItem,
		type WorkspaceToolbarProps
	} from '$lib/components/patterns/workspace-toolbar';
	import { buildGroupTree, createRosterReadModel, hasSubGroups } from '$features/personnel/contracts';
	import { showSubGroups, showSubGroupsToggle } from '$lib/stores/showSubGroups.svelte';
	import { getAppShellContext } from '$features/app-shell';
	import { rosterStore } from '$features/personnel';
	import { groupsStore, pinnedGroupsStore } from '$features/personnel';
	import IctCompletionModal from '$features/critical-tasks/components/IctCompletionModal.svelte';
	import IctMatrix from '$features/critical-tasks/components/IctMatrix.svelte';
	import {
		ictTasksStore,
		personnelIctCompletionsStore,
		criticalTasksConfigureLibraryAffordance,
		criticalTasksRecordCompletionAffordance,
		criticalTasksViewReadinessAffordance,
		criticalTasksSettingsFromWorkspaceData,
		normalizeCriticalTasksSettings,
		getActiveIctTasksForLibrary,
		type IctTask,
		type PersonnelIctCompletion
	} from '$features/critical-tasks';
	import type { Personnel } from '$features/personnel/contracts';

	let { data } = $props();

	const org = getAppShellContext();
	const orgId = $derived(org.orgId);
	const orgUrlSegment = $derived(org.orgUrlSegment ?? orgId);
	const orgName = $derived(org.orgName);
	let selectedGroupId = $state('');
	let gapsOnly = $state(false);
	let personnelSearch = $state('');
	let viewMode = $state<'alphabetical' | 'by-group'>('by-group');
	let showTaskInputModal = $state(false);
	const reportsHref = $derived(`/org/${orgUrlSegment}/critical-tasks/reports`);
	const taskLibraryHref = $derived(`/org/${orgUrlSegment}/critical-tasks/library`);
	const importHref = $derived(`/org/${orgUrlSegment}/critical-tasks/import`);

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
	const rosterReadModel = $derived(
		rosterStore.orgId === orgId
			? rosterStore.readModel({ fallbackGroupName: orgName })
			: createRosterReadModel({ personnel: [], groups: [], pinnedGroupIds: [], fallbackGroupName: orgName })
	);
	const activeRosterView = $derived(rosterReadModel.scoped(org.scopeSet, { status: 'active' }));
	const activePersonnel = $derived(activeRosterView.flatPersonnel);
	// A dialog resolves a pair's existing completion when the pair is chosen, so it opens only once every store has loaded.
	const completionInputBlocker = $derived(
		loading ? 'loading' : activePersonnel.length === 0 || activeTasks.length === 0 ? 'empty' : null
	);
	const canOpenCompletionInput = $derived(canInputTask && completionInputBlocker === null);

	function completionInputDisabledReason(emptyReason: string): string | undefined {
		if (completionInputBlocker === 'loading') return 'Critical Tasks are still loading.';
		if (completionInputBlocker === 'empty') return emptyReason;
		return undefined;
	}
	const groupFilterOptions = $derived(
		activeRosterView.groupFilterOptions.map(({ value, label }) => ({ value, label }))
	);
	const effectiveSelectedGroupId = $derived(
		selectedGroupId && groupFilterOptions.some((option) => option.value === selectedGroupId) ? selectedGroupId : ''
	);
	const matrixViewOptions = [
		{ value: 'alphabetical', label: 'A-Z' },
		{ value: 'by-group', label: 'Group' }
	];
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

	const currentUserDisplayName = $derived(data.viewer?.displayName ?? null);

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
		if (!canOpenCompletionInput) return;
		activeCompletionCell = null;
		showTaskInputModal = true;
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
			const { filenameFromContentDisposition } = await import('$lib/utils/workbook');
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

	const toolbarItems = $derived.by<ToolbarItem[]>(() => {
		const items: ToolbarItem[] = [
			{
				kind: 'view',
				id: 'matrix-view',
				label: 'Critical Tasks matrix view mode',
				options: matrixViewOptions,
				value: viewMode,
				onValueChange: (value) => {
					if (value === 'alphabetical' || value === 'by-group') viewMode = value;
				}
			},
			{
				kind: 'select',
				id: 'group',
				label: 'Group',
				ariaLabel: 'Critical Tasks group filter',
				options: groupFilterOptions,
				value: effectiveSelectedGroupId,
				defaultValue: '',
				onValueChange: (value) => (selectedGroupId = value)
			},
			{
				kind: 'toggle',
				id: 'gaps',
				label: 'Gaps only',
				pressed: gapsOnly,
				onPressedChange: (pressed) => (gapsOnly = pressed)
			},
			{ kind: 'action', id: 'reports', label: 'Reports', href: reportsHref }
		];

		if (viewMode === 'by-group' && hasSubGroups(buildGroupTree(groupsStore.items))) {
			items.push({
				kind: 'action',
				id: 'matrix-display',
				label: 'Display',
				icon: 'sliders',
				menuItems: [showSubGroupsToggle()]
			});
		}

		if (canConfigureLibrary) {
			items.push({
				kind: 'action',
				id: 'task-library',
				label: 'Task Library',
				href: taskLibraryHref
			});
		}
		if (canInputTask) {
			items.push({
				kind: 'action',
				id: 'import-completions',
				label: 'Import Completions',
				href: importHref,
				icon: 'upload',
				disabled: !canOpenCompletionInput,
				disabledReason: completionInputDisabledReason('Add personnel and active tasks before importing completions.')
			});
		}
		items.push({
			kind: 'action',
			id: 'export-excel',
			label: matrixExportLoading ? 'Exporting...' : 'Export Excel',
			onclick: exportMatrixExcel,
			icon: 'download',
			loading: matrixExportLoading,
			disabled: loading,
			disabledReason: loading ? 'Export unavailable while loading.' : undefined
		});
		return items;
	});

	const toolbarSearch = $derived({
		label: 'Search by name, rank, or MOS',
		placeholder: 'Search name, rank, MOS...',
		value: personnelSearch,
		onValueChange: (value: string) => (personnelSearch = value)
	} satisfies NonNullable<WorkspaceToolbarProps['search']>);

	const toolbarPrimary = $derived.by<WorkspaceToolbarProps['primary']>(() =>
		canInputTask
			? {
					kind: 'action',
					id: 'record-completion',
					label: 'Record Completion',
					onclick: handleToolbarTaskInput,
					icon: 'plus',
					disabled: !canOpenCompletionInput,
					disabledReason: completionInputDisabledReason('Add personnel and active tasks before recording a completion.')
				}
			: undefined
	);

	async function handleCompletionSave(
		saveData: Omit<PersonnelIctCompletion, 'id' | 'loggedBy' | 'createdAt'>,
		existingId?: string
	): Promise<void> {
		if (existingId) {
			const updated = await personnelIctCompletionsStore.updateOrThrow(existingId, saveData);
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

<div class="flex h-full min-h-0 flex-col overflow-hidden bg-background">
	{#if !canViewReadiness}
		<section class="h-full max-w-3xl overflow-auto p-4" aria-labelledby="critical-tasks-restricted-title">
			<h2 id="critical-tasks-restricted-title" class="text-2xl font-semibold text-foreground">Access Restricted</h2>
			<p class="text-muted-foreground">Contact your organization admin for critical tasks access.</p>
		</section>
	{:else}
		<div class="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-3 md:p-4">
			<WorkspaceToolbar
				ariaLabel="Critical Tasks controls"
				items={toolbarItems}
				search={toolbarSearch}
				primary={toolbarPrimary}
			/>

			{#if matrixExportError}
				<Alert.Root variant="destructive">
					<Alert.Title>Unable to export the matrix</Alert.Title>
					<Alert.Description>{matrixExportError}</Alert.Description>
					<Alert.Action>
						<Button
							type="button"
							variant="destructive"
							size="xs"
							onclick={exportMatrixExcel}
							disabled={matrixExportLoading}
						>
							Retry
						</Button>
					</Alert.Action>
				</Alert.Root>
			{/if}

			{#if loading}
				<div
					class="h-full overflow-auto"
					role="status"
					aria-live="polite"
					aria-label="Loading Critical Tasks"
					data-testid="critical-tasks-loading"
				>
					<div class="grid grid-cols-4 gap-2" aria-hidden="true">
						{#each Array(24) as _, index (index)}
							<Skeleton class="h-[38px] w-[100px]" />
						{/each}
					</div>
				</div>
			{:else if activeTasks.length === 0}
				<Empty.Root>
					<Empty.Header>
						<Empty.Title>No critical tasks yet.</Empty.Title>
						<Empty.Description>Add ICTL tasks to begin tracking annual proficiency.</Empty.Description>
					</Empty.Header>
				</Empty.Root>
			{:else if activePersonnel.length === 0}
				<Empty.Root>
					<Empty.Header>
						<Empty.Title>No personnel yet.</Empty.Title>
						<Empty.Description>Add personnel to the roster to track their critical tasks.</Empty.Description>
					</Empty.Header>
				</Empty.Root>
			{:else}
				<section class="flex min-h-0 flex-1 flex-col" aria-label="Critical Tasks matrix workspace">
					<div class="min-h-0 flex-1 overflow-hidden" data-testid="critical-tasks-matrix-panel">
						<IctMatrix
							orgId={orgUrlSegment}
							personnel={filteredPersonnel}
							tasks={ictTasksStore.items}
							completions={personnelIctCompletionsStore.items}
							groups={groupsStore.items}
							pinnedGroupIds={pinnedGroupsStore.orgId === orgId ? pinnedGroupsStore.list : []}
							settings={criticalTasksSettings}
							canEdit={canRecordCompletion}
							onSelectCell={handleMatrixCellSelection}
							selectedGroupFilter={effectiveSelectedGroupId}
							{gapsOnly}
							showSubGroups={showSubGroups.current}
							{viewMode}
							{orgName}
						/>
					</div>
				</section>
			{/if}
		</div>
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
