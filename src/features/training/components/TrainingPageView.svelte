<script lang="ts">
	import { onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { trainingTypesStore } from '$features/training/stores/trainingTypes.svelte';
	import { trainingViewsStore } from '$features/training/stores/trainingViews.svelte';
	import { personnelTrainingsStore } from '$features/training/stores/personnelTrainings.svelte';
	import { filterColumnsByView } from '$features/training/utils/viewFiltering';
	import { buildTrainingMatrixWorkbook, type TrainingMatrixWorkbookInput } from '../utils/trainingMatrixWorkbook';
	import { downloadBlob } from '$lib/utils/downloadBlob';
	import { workbookBlob } from '$lib/utils/workbook';
	import { formatToday } from '$lib/utils/dates';
	import TrainingMatrix from '$features/training/components/TrainingMatrix.svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Empty from '$lib/components/ui/empty';
	import * as Alert from '$lib/components/ui/alert';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import {
		WorkspaceToolbar,
		type ToolbarItem,
		type WorkspaceToolbarProps
	} from '$lib/components/patterns/workspace-toolbar';
	import { pinnedGroupsStore } from '$features/personnel';
	import { groupsStore } from '$features/personnel';
	import type { TrainingPageContext } from '$features/training/contexts/TrainingPageContext.svelte';
	import type { ModalRegistry } from '$lib/utils/modalRegistry.svelte';
	import { rosterStore } from '$features/personnel';

	let { ctx, modals }: { ctx: TrainingPageContext; modals: ModalRegistry } = $props();
	const orgUrlSegment = $derived(ctx.orgUrlSegment ?? ctx.orgId);
	type ExportState = { status: 'idle' } | { status: 'exporting' } | { status: 'error'; orgId: string; message: string };
	let exportState = $state<ExportState>({ status: 'idle' });
	let disposed = false;
	onDestroy(() => {
		disposed = true;
	});

	const storesHydratedForOrg = $derived(
		rosterStore.orgId === ctx.orgId &&
			groupsStore.orgId === ctx.orgId &&
			trainingTypesStore.orgId === ctx.orgId &&
			trainingViewsStore.orgId === ctx.orgId &&
			personnelTrainingsStore.orgId === ctx.orgId
	);

	const loading = $derived(
		!storesHydratedForOrg ||
			rosterStore.loading ||
			groupsStore.loading ||
			trainingTypesStore.loading ||
			trainingViewsStore.loading ||
			personnelTrainingsStore.loading
	);
	const exportUnavailable = $derived(
		loading || ctx.filteredPersonnel.length === 0 || trainingTypesStore.items.length === 0
	);
	const exportDisabled = $derived(exportUnavailable || exportState.status === 'exporting');
	const exportDisabledReason = $derived.by(() => {
		if (exportState.status === 'exporting') return undefined;
		if (loading) return 'Export unavailable while loading.';
		if (ctx.filteredPersonnel.length === 0) return 'No personnel to export.';
		if (trainingTypesStore.items.length === 0) return 'No training types to export.';
		return undefined;
	});
	const exportError = $derived(
		exportState.status === 'error' && exportState.orgId === ctx.orgId ? exportState.message : null
	);

	async function exportExcel(): Promise<void> {
		if (disposed || !ctx.canViewTraining || exportDisabled) return;
		const orgId = ctx.orgId;
		const exportDate = formatToday();
		const input: TrainingMatrixWorkbookInput = $state.snapshot({
			personnel: ctx.filteredPersonnel,
			trainingTypes: trainingTypesStore.items,
			trainings: personnelTrainingsStore.items,
			exportDate
		});
		function isSnapshotStillAuthorized(): boolean {
			if (disposed || ctx.orgId !== orgId || !ctx.canViewTraining || !storesHydratedForOrg) return false;
			const authorizedIds = new Set(ctx.personnel.map((person) => person.id));
			return input.personnel.every((person) => authorizedIds.has(person.id));
		}
		exportState = { status: 'exporting' };
		try {
			const blob = await workbookBlob(await buildTrainingMatrixWorkbook(input));
			if (!isSnapshotStillAuthorized()) return;
			downloadBlob(blob, `training-matrix-${exportDate}.xlsx`);
		} catch {
			if (isSnapshotStillAuthorized()) {
				exportState = {
					status: 'error',
					orgId,
					message: 'The Excel workbook could not be created. Try again.'
				};
			}
		} finally {
			if (exportState.status === 'exporting') exportState = { status: 'idle' };
		}
	}

	const activeView = $derived(ctx.selectedViewId ? (trainingViewsStore.getById(ctx.selectedViewId) ?? null) : null);

	const filteredTypes = $derived(filterColumnsByView(trainingTypesStore.items, activeView));

	const trainingViewOptions = $derived([
		{ value: '', label: 'All Trainings' },
		...trainingViewsStore.items.map((view) => ({ value: view.id, label: view.name }))
	]);
	const groupFilterOptions = $derived([...ctx.groupFilterOptions]);
	const matrixViewOptions = [
		{ value: 'alphabetical', label: 'A-Z' },
		{ value: 'by-group', label: 'Group' }
	];
	const toolbarItems = $derived.by<ToolbarItem[]>(() => {
		const items: ToolbarItem[] = [
			{
				kind: 'view',
				id: 'matrix-view',
				label: 'Training matrix view mode',
				options: matrixViewOptions,
				value: ctx.viewMode,
				onValueChange: (value) => {
					if (value === 'alphabetical' || value === 'by-group') ctx.setViewMode(value);
				}
			},
			{
				kind: 'select',
				id: 'training-view',
				label: 'Training view',
				ariaLabel: 'Training view filter',
				options: trainingViewOptions,
				value: ctx.selectedViewId ?? '',
				defaultValue: '',
				onValueChange: (value) => ctx.setSelectedViewId(value || null)
			},
			{
				kind: 'select',
				id: 'group',
				label: 'Group',
				ariaLabel: 'Training group filter',
				options: groupFilterOptions,
				value: ctx.selectedGroupId,
				defaultValue: '',
				onValueChange: (value) => ctx.setSelectedGroupId(value)
			},
			{
				kind: 'action',
				id: 'reports',
				label: 'Reports',
				href: `/org/${orgUrlSegment}/training/reports`,
				icon: 'chart'
			},
			{
				kind: 'action',
				id: 'sign-in-rosters',
				label: 'Sign-In Rosters',
				onclick: () => modals.open('sign-in-rosters'),
				icon: 'clipboard-list'
			},
			{
				kind: 'action',
				id: 'export-excel',
				label: exportState.status === 'exporting' ? 'Exporting...' : 'Export Excel',
				onclick: () => void exportExcel(),
				icon: 'download',
				loading: exportState.status === 'exporting',
				disabled: exportUnavailable,
				disabledReason: exportDisabledReason
			}
		];

		if (ctx.canBulkImport) {
			items.push({
				kind: 'action',
				id: 'bulk-import',
				label: 'Import',
				onclick: () => modals.open('bulk-import'),
				icon: 'upload'
			});
		}
		if (ctx.canManageConfig) {
			items.push({
				kind: 'action',
				id: 'manage-views',
				label: 'Manage Views',
				href: `/org/${orgUrlSegment}/training/views`,
				icon: 'settings'
			});
		}
		return items;
	});

	const toolbarPrimary = $derived.by<WorkspaceToolbarProps['primary']>(() =>
		ctx.canManageConfig
			? {
					kind: 'action',
					id: 'manage-types',
					label: 'Manage Types',
					href: `/org/${orgUrlSegment}/training/types`,
					icon: 'book-open'
				}
			: undefined
	);
</script>

<div class="flex h-full flex-col bg-background">
	<div class="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden p-2">
		<WorkspaceToolbar ariaLabel="Training controls" items={toolbarItems} primary={toolbarPrimary} />

		{#if exportError}
			<Alert.Root variant="destructive">
				<Alert.Title>Unable to export the workbook</Alert.Title>
				<Alert.Description>{exportError}</Alert.Description>
				<Alert.Action>
					<Button type="button" variant="destructive" size="xs" onclick={exportExcel} disabled={exportDisabled}>
						Retry
					</Button>
				</Alert.Action>
			</Alert.Root>
		{/if}

		{#if loading}
			<div
				class="grid gap-2 overflow-hidden rounded-lg border border-border bg-card p-3"
				role="status"
				aria-live="polite"
				aria-label="Loading training matrix"
				data-testid="skeleton-grid"
			>
				<div class="flex gap-2">
					{#each Array.from({ length: 6 }) as _, index (index)}
						<Skeleton class="h-8 w-28" />
					{/each}
				</div>
				{#each Array.from({ length: 8 }) as _, rowIndex (rowIndex)}
					<div class="flex gap-2">
						{#each Array.from({ length: 6 }) as _, colIndex (`${rowIndex}-${colIndex}`)}
							<Skeleton class="h-9 w-28" />
						{/each}
					</div>
				{/each}
			</div>
		{:else if trainingTypesStore.items.length === 0}
			<Empty.Root>
				<Empty.Header>
					<Empty.Title>No training types defined yet.</Empty.Title>
				</Empty.Header>
				{#if ctx.canManageConfig}
					<Empty.Content>
						<Button onclick={() => goto(resolve(`/org/${orgUrlSegment}/training/types`))}>Manage Types</Button>
					</Empty.Content>
				{/if}
			</Empty.Root>
		{:else if ctx.filteredPersonnel.length === 0}
			<Empty.Root>
				<Empty.Header>
					<Empty.Title>No personnel found.</Empty.Title>
				</Empty.Header>
			</Empty.Root>
		{:else}
			<div class="min-h-0 flex-1 overflow-auto" data-testid="training-matrix">
				{#if ctx.viewMode === 'alphabetical'}
					<TrainingMatrix
						personnel={ctx.filteredPersonnel}
						trainingTypes={filteredTypes}
						trainings={personnelTrainingsStore.items}
						onCellClick={ctx.canRecordTraining ? ctx.handleCellClick.bind(ctx) : undefined}
						onPersonClick={ctx.canRecordTraining ? ctx.handlePersonClick.bind(ctx) : undefined}
					/>
				{:else}
					<TrainingMatrix
						personnel={ctx.filteredPersonnel}
						trainingTypes={filteredTypes}
						trainings={personnelTrainingsStore.items}
						onCellClick={ctx.canRecordTraining ? ctx.handleCellClick.bind(ctx) : undefined}
						onPersonClick={ctx.canRecordTraining ? ctx.handlePersonClick.bind(ctx) : undefined}
						groupBy={{
							key: (p) => p.groupName || 'Unassigned',
							compare: (a, b) => {
								const aPin = pinnedGroupsStore.list.includes(a) ? 0 : 1;
								const bPin = pinnedGroupsStore.list.includes(b) ? 0 : 1;
								if (aPin !== bPin) return aPin - bPin;
								return a.localeCompare(b);
							}
						}}
					/>
				{/if}
			</div>
		{/if}
	</div>
</div>
