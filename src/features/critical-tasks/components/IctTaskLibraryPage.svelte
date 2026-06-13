<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import * as ButtonGroup from '$lib/components/ui/button-group';
	import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';
	import * as Empty from '$lib/components/ui/empty';
	import * as Field from '$lib/components/ui/field';
	import { Input } from '$lib/components/ui/input';
	import { Spinner } from '$lib/components/ui/spinner';
	import { Textarea } from '$lib/components/ui/textarea';
	import * as WorkspaceToolbar from '$lib/components/ui/workspace-toolbar';
	import type { WorkspaceToolbarAction } from '$lib/components/ui/workspace-toolbar';
	import { getOrgContext } from '$lib/stores/orgContext.svelte';
	import IctTaskBulkImport from '$features/critical-tasks/components/IctTaskBulkImport.svelte';
	import { ictTasksStore } from '$features/critical-tasks/stores/ictTasks.svelte';
	import { personnelIctCompletionsStore } from '$features/critical-tasks/stores/personnelIctCompletions.svelte';
	import type { IctTask } from '$features/critical-tasks/criticalTasks.types';
	import { criticalTasksConfigureLibraryAffordance } from '$features/critical-tasks/utils/criticalTasksPolicy';
	import {
		countCompletionRecordsForTask,
		formatMosApplicability,
		getActiveIctTasksForLibrary,
		getArchivedIctTasksForLibrary,
		isIctTaskApplicableToMos,
		parseMosApplicabilityInput
	} from '$features/critical-tasks/utils/ictTaskLibrary';

	interface Props {
		data?: {
			orgId?: string;
			[key: string]: unknown;
		};
	}

	let { data = {} }: Props = $props();

	const org = getOrgContext();
	const orgId = $derived(data.orgId ?? org.orgId);
	const configureLibraryAffordance = $derived(criticalTasksConfigureLibraryAffordance(org));
	const canViewLibrary = $derived(configureLibraryAffordance.visible);
	const canManage = $derived(configureLibraryAffordance.allowed);

	const storesHydratedForOrg = $derived(ictTasksStore.orgId === orgId && personnelIctCompletionsStore.orgId === orgId);
	const loading = $derived(!storesHydratedForOrg || ictTasksStore.loading || personnelIctCompletionsStore.loading);

	let selectedTaskId = $state<string | null>(null);
	let creating = $state(false);
	let editing = $state(false);
	let saving = $state(false);
	let importingTasks = $state(false);
	let confirmArchive = $state<IctTask | null>(null);
	let taskStatusFilter = $state<'active' | 'archived'>('active');
	let taskSearch = $state('');
	let selectedMos = $state('');

	let formTaskCode = $state('');
	let formTitle = $state('');
	let formDescription = $state('');
	let formCategory = $state('');
	let formMos = $state('');
	let formExpirationMonths = $state('');
	let formSortOrder = $state('0');

	const activeTasks = $derived(getActiveIctTasksForLibrary(ictTasksStore.items));
	const archivedTasks = $derived(getArchivedIctTasksForLibrary(ictTasksStore.items));
	const visibleTasks = $derived(taskStatusFilter === 'active' ? activeTasks : archivedTasks);
	const selectedTask = $derived(
		selectedTaskId ? (visibleTasks.find((task) => task.id === selectedTaskId) ?? null) : null
	);
	const mosFilterOptions = $derived.by(() => {
		const mosValues: string[] = [];
		for (const task of visibleTasks) {
			for (const mos of task.mos) {
				const normalized = mos.trim().toUpperCase();
				if (normalized && !mosValues.includes(normalized)) {
					mosValues.push(normalized);
				}
			}
		}

		return mosValues
			.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))
			.map((mos) => ({ value: mos, label: mos }));
	});
	const toolbarMosFilterOptions = $derived([{ value: '', label: 'All MOS' }, ...mosFilterOptions]);
	const filtersActive = $derived(Boolean(taskSearch.trim() || selectedMos || taskStatusFilter !== 'active'));
	const toolbarActiveFilterCount = $derived(
		(taskStatusFilter !== 'active' ? 1 : 0) + (selectedMos ? 1 : 0) + (taskSearch.trim() ? 1 : 0)
	);
	const filteredTasks = $derived(
		visibleTasks.filter((task) => matchesTaskSearch(task, taskSearch) && matchesSelectedMos(task))
	);
	const taskStatusOptions = [
		{ value: 'active', label: 'Active' },
		{ value: 'archived', label: 'Archived' }
	];
	const canReorderTasks = $derived(
		canManage && taskStatusFilter === 'active' && !editing && !creating && !importingTasks && !filtersActive
	);
	const toolbarActionItems = $derived.by<WorkspaceToolbarAction[]>(() => {
		const items: WorkspaceToolbarAction[] = [];

		if (filtersActive) {
			items.push({
				id: 'clear-filters',
				label: 'Clear filters',
				onclick: clearTaskFilters,
				priority: 'normal',
				variant: 'default'
			});
		}

		if (canManage) {
			items.push(
				{
					id: 'import-csv',
					label: 'Import CSV',
					onclick: startImport,
					icon: 'upload',
					disabled: creating || editing || importingTasks,
					priority: 'normal',
					variant: 'default'
				},
				{
					id: 'new-task',
					label: 'New Task',
					onclick: startCreate,
					icon: 'clipboard-check',
					disabled: creating || editing || importingTasks,
					priority: 'critical',
					overflow: 'never',
					variant: 'primary'
				}
			);
		}

		return items;
	});

	$effect(() => {
		if (selectedMos && !mosFilterOptions.some((option) => option.value === selectedMos)) {
			selectedMos = '';
		}
	});

	$effect(() => {
		if (selectedTaskId && !visibleTasks.some((task) => task.id === selectedTaskId)) {
			selectedTaskId = null;
		}

		if (!creating && !selectedTaskId && filteredTasks[0]) {
			selectedTaskId = filteredTasks[0].id;
		}
	});

	function matchesTaskSearch(task: Pick<IctTask, 'taskCode' | 'title' | 'category'>, query: string): boolean {
		const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
		if (terms.length === 0) return true;

		const searchable = `${task.taskCode} ${task.title} ${task.category ?? ''}`.toLowerCase();
		return terms.every((term) => searchable.includes(term));
	}

	function matchesSelectedMos(task: Pick<IctTask, 'mos'>): boolean {
		if (!selectedMos) return true;
		return isIctTaskApplicableToMos(task, selectedMos);
	}

	function formatTaskListMeta(task: Pick<IctTask, 'category' | 'mos'>): string {
		const mosLabel = formatMosApplicability(task.mos);
		const category = task.category?.trim();
		return category ? `${category} / ${mosLabel}` : mosLabel;
	}

	function clearTaskFilters() {
		taskStatusFilter = 'active';
		taskSearch = '';
		selectedMos = '';
	}

	function selectTask(taskId: string) {
		if (creating || editing || importingTasks) return;
		selectedTaskId = taskId;
	}

	function nextSortOrder(): number {
		if (activeTasks.length === 0) return 0;
		return Math.max(...activeTasks.map((task) => task.sortOrder)) + 1;
	}

	function resetForm(task?: IctTask) {
		formTaskCode = task?.taskCode ?? '';
		formTitle = task?.title ?? '';
		formDescription = task?.description ?? '';
		formCategory = task?.category ?? '';
		formMos = task ? task.mos.join(', ') : '';
		formExpirationMonths = task?.expirationMonths == null ? '' : String(task.expirationMonths);
		formSortOrder = String(task?.sortOrder ?? nextSortOrder());
	}

	function startCreate() {
		if (!canManage) return;
		taskStatusFilter = 'active';
		selectedTaskId = null;
		resetForm();
		creating = true;
		editing = false;
		importingTasks = false;
	}

	function startEdit() {
		if (!selectedTask || !canManage || selectedTask.archivedAt) return;
		resetForm(selectedTask);
		editing = true;
		creating = false;
		importingTasks = false;
	}

	function cancelEdit() {
		creating = false;
		editing = false;
		saving = false;
	}

	function startImport() {
		if (!canManage) return;
		taskStatusFilter = 'active';
		selectedTaskId = null;
		creating = false;
		editing = false;
		importingTasks = true;
	}

	function cancelImport() {
		importingTasks = false;
	}

	function parsePositiveInteger(value: string): number | null {
		const trimmed = value.trim();
		if (!trimmed) return null;
		const parsed = Number.parseInt(trimmed, 10);
		return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
	}

	function parseSortOrder(value: string): number {
		const parsed = Number.parseInt(value.trim(), 10);
		return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
	}

	function normalizeOptionalText(value: string): string | null {
		return value.trim() || null;
	}

	function handleExpirationInput(event: Event) {
		formExpirationMonths = (event.currentTarget as HTMLInputElement).value;
	}

	function handleSortOrderInput(event: Event) {
		formSortOrder = (event.currentTarget as HTMLInputElement).value;
	}

	async function saveTask(event?: SubmitEvent) {
		event?.preventDefault();
		if (!canManage || saving || !formTaskCode.trim() || !formTitle.trim()) return;

		saving = true;
		try {
			const payload = {
				taskCode: formTaskCode.trim().toUpperCase(),
				title: formTitle.trim(),
				description: normalizeOptionalText(formDescription),
				category: normalizeOptionalText(formCategory),
				mos: parseMosApplicabilityInput(formMos),
				expirationMonths: parsePositiveInteger(formExpirationMonths),
				sortOrder: parseSortOrder(formSortOrder),
				archivedAt: null
			};

			if (creating) {
				const created = await ictTasksStore.add(payload as Omit<IctTask, 'id'>);
				if (created) selectedTaskId = created.id;
				creating = false;
			} else if (selectedTaskId) {
				await ictTasksStore.update(selectedTaskId, payload);
			}
			editing = false;
		} finally {
			saving = false;
		}
	}

	async function archiveTask(taskId: string) {
		if (!canManage) return;
		await ictTasksStore.update(taskId, { archivedAt: new Date().toISOString() });
		if (selectedTaskId === taskId) selectedTaskId = null;
		confirmArchive = null;
	}

	async function restoreTask(taskId: string) {
		if (!canManage) return;
		await ictTasksStore.update(taskId, { archivedAt: null });
		taskStatusFilter = 'active';
		selectedTaskId = taskId;
	}

	async function moveTask(index: number, direction: -1 | 1) {
		const current = activeTasks[index];
		const target = activeTasks[index + direction];
		if (!current || !target || !canManage) return;

		await Promise.all([
			ictTasksStore.update(current.id, { sortOrder: target.sortOrder }),
			ictTasksStore.update(target.id, { sortOrder: current.sortOrder })
		]);
	}

	function completionCount(taskId: string): number {
		return countCompletionRecordsForTask(personnelIctCompletionsStore.items, taskId);
	}

	function archiveMessage(task: IctTask): string {
		const count = completionCount(task.id);
		const label = count === 1 ? 'personnel completion record is' : 'personnel completion records are';
		return `${count} ${label} tied to this task. Archiving hides it from the active library, matrix, and new logging flows without deleting history.`;
	}

	function formatArchivedAt(value: string | null): string {
		if (!value) return 'Not archived';
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return value;
		return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(date);
	}

	function confirmArchiveTask() {
		if (!confirmArchive) return;
		return archiveTask(confirmArchive.id);
	}
</script>

<svelte:head>
	<title>ICT Task Library - Troop to Task</title>
</svelte:head>

{#if !canViewLibrary}
	<section class="p-6" aria-labelledby="library-restricted-title">
		<h2 id="library-restricted-title" class="text-2xl font-semibold text-foreground">Access Restricted</h2>
		<p class="text-muted-foreground">Critical Tasks configure access is required to manage ICT task definitions.</p>
	</section>
{:else}
	<div class="flex flex-col gap-4 p-4">
		<WorkspaceToolbar.Root ariaLabel="ICT task library controls">
			<WorkspaceToolbar.Group
				label="ICT task library filters"
				activeCount={toolbarActiveFilterCount}
				data-testid="ict-library-filters"
			>
				<ButtonGroup.Root aria-label="Filter ICT tasks by status">
					{#each taskStatusOptions as option (option.value)}
						<Button
							variant={taskStatusFilter === option.value ? 'secondary' : 'outline'}
							aria-pressed={taskStatusFilter === option.value}
							onclick={() => (taskStatusFilter = option.value as 'active' | 'archived')}
						>
							{option.label}
						</Button>
					{/each}
				</ButtonGroup.Root>
				<WorkspaceToolbar.Select
					ariaLabel="MOS"
					options={toolbarMosFilterOptions}
					value={selectedMos}
					onValueChange={(value) => (selectedMos = value)}
				/>
				<WorkspaceToolbar.Search
					ariaLabel="Search"
					placeholder="Search task number or title..."
					bind:value={taskSearch}
				/>
			</WorkspaceToolbar.Group>

			<WorkspaceToolbar.Group label="ICT task library actions" zone="actions">
				<WorkspaceToolbar.Actions
					actions={toolbarActionItems}
					ariaLabel="ICT task library actions"
					overflowAriaLabel="More ICT task library actions"
				/>
			</WorkspaceToolbar.Group>
		</WorkspaceToolbar.Root>

		{#if loading}
			<section
				class="flex items-center justify-center gap-2 p-6 text-muted-foreground"
				aria-busy="true"
				aria-live="polite"
				role="status"
			>
				<Spinner />
				<p>Loading ICT task library...</p>
			</section>
		{:else if importingTasks}
			<section>
				<IctTaskBulkImport tasks={ictTasksStore.items} onCancel={cancelImport} onDone={cancelImport} />
			</section>
		{:else}
			<div class="grid gap-5 lg:grid-cols-[minmax(290px,360px)_minmax(0,1fr)]">
				<section
					class="flex min-h-0 flex-col gap-4 rounded-lg border bg-card p-5 text-card-foreground"
					aria-labelledby="task-library-title"
				>
					<div class="flex items-center justify-between gap-3 border-b pb-4">
						<h3 id="task-library-title" class="text-lg font-semibold">
							{taskStatusFilter === 'active' ? 'Active Tasks' : 'Archived Tasks'}
						</h3>
					</div>

					{#if visibleTasks.length === 0 && !creating}
						<Empty.Root>
							<Empty.Header>
								<Empty.Title>
									{taskStatusFilter === 'active' ? 'No active ICT tasks.' : 'No archived ICT tasks.'}
								</Empty.Title>
								<Empty.Description>
									{taskStatusFilter === 'active'
										? 'Add task definitions to begin tracking ICTL readiness.'
										: 'Restore a task after archiving when you need it back in the active library.'}
								</Empty.Description>
							</Empty.Header>
							{#if canManage}
								<Empty.Content>
									<Button type="button" onclick={startCreate}>New Task</Button>
								</Empty.Content>
							{/if}
						</Empty.Root>
					{:else if visibleTasks.length > 0 && filteredTasks.length === 0}
						<Empty.Root>
							<Empty.Header>
								<Empty.Title>No ICT tasks match the current filters.</Empty.Title>
							</Empty.Header>
							<Empty.Content>
								<Button variant="outline" type="button" onclick={clearTaskFilters}>Clear filters</Button>
							</Empty.Content>
						</Empty.Root>
					{:else}
						<ul class="grid gap-2" aria-label="ICT task library">
							{#each filteredTasks as task, index (task.id)}
								<li
									class={[
										'flex items-stretch gap-2 rounded-lg border bg-background',
										selectedTaskId === task.id && !creating && 'border-primary bg-primary/5'
									]}
								>
									<button
										class="grid min-w-0 flex-1 gap-1 p-3 text-left"
										type="button"
										aria-pressed={selectedTaskId === task.id && !creating}
										onclick={() => selectTask(task.id)}
									>
										<span class="font-mono text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground"
											>{task.taskCode}</span
										>
										<span class="truncate text-sm font-medium text-foreground">{task.title}</span>
										<span class="truncate text-xs text-muted-foreground">{formatTaskListMeta(task)}</span>
									</button>
									{#if canReorderTasks}
										<div class="flex flex-col justify-center gap-1 p-2" aria-label="Reorder {task.taskCode}">
											<Button
												variant="ghost"
												size="icon-sm"
												type="button"
												onclick={() => moveTask(index, -1)}
												disabled={index === 0}
												aria-label="Move {task.taskCode} up">▲</Button
											>
											<Button
												variant="ghost"
												size="icon-sm"
												type="button"
												onclick={() => moveTask(index, 1)}
												disabled={index === activeTasks.length - 1}
												aria-label="Move {task.taskCode} down">▼</Button
											>
										</div>
									{/if}
								</li>
							{/each}
						</ul>
					{/if}
				</section>

				<section
					class="flex min-h-0 flex-col gap-4 rounded-lg border bg-card p-5 text-card-foreground"
					aria-label="ICT task details"
				>
					{#if creating || editing}
						<form class="flex flex-col gap-4" onsubmit={saveTask}>
							<h3 class="text-lg font-semibold">{creating ? 'New ICT Task' : 'Edit ICT Task'}</h3>

							<div class="grid gap-4 md:grid-cols-2">
								<Field.Root>
									<Field.Label for="ict-task-code">Task code</Field.Label>
									<Input id="ict-task-code" type="text" bind:value={formTaskCode} required />
								</Field.Root>

								<Field.Root>
									<Field.Label for="ict-task-title">Title</Field.Label>
									<Input id="ict-task-title" type="text" bind:value={formTitle} required />
								</Field.Root>

								<Field.Root class="md:col-span-2">
									<Field.Label for="ict-task-description">Description</Field.Label>
									<Textarea
										id="ict-task-description"
										rows={3}
										bind:value={formDescription}
										placeholder="Optional task context"
									/>
								</Field.Root>

								<Field.Root class="md:col-span-2">
									<Field.Label for="ict-task-category">Category</Field.Label>
									<Input
										id="ict-task-category"
										type="text"
										bind:value={formCategory}
										placeholder="Optional local task category"
									/>
									<Field.Description
										>Free text for your unit terminology, such as Casualty Care or Crew Drills.</Field.Description
									>
								</Field.Root>

								<Field.Root class="md:col-span-2">
									<Field.Label for="ict-task-mos">MOS applicability</Field.Label>
									<Input
										id="ict-task-mos"
										type="text"
										bind:value={formMos}
										placeholder="68W, 18D. Leave blank for all MOSs."
									/>
									<Field.Description>Leave blank for all MOSs.</Field.Description>
								</Field.Root>

								<Field.Root>
									<Field.Label for="ict-task-expiration">Expiration override</Field.Label>
									<Input
										id="ict-task-expiration"
										type="number"
										min="1"
										value={formExpirationMonths}
										oninput={handleExpirationInput}
										placeholder="Org default"
									/>
								</Field.Root>

								<Field.Root>
									<Field.Label for="ict-task-sort">Sort order</Field.Label>
									<Input
										id="ict-task-sort"
										type="number"
										min="0"
										value={formSortOrder}
										oninput={handleSortOrderInput}
									/>
								</Field.Root>
							</div>

							<div class="flex flex-wrap justify-end gap-2">
								<Button variant="outline" size="sm" type="button" onclick={cancelEdit}>Cancel</Button>
								<Button size="sm" type="submit" disabled={!formTaskCode.trim() || !formTitle.trim() || saving}>
									{#if saving}<Spinner />{/if}
									{creating ? 'Create Task' : 'Save Changes'}
								</Button>
							</div>
						</form>
					{:else if selectedTask}
						<div class="flex flex-col gap-4">
							<div class="flex items-start justify-between gap-3">
								<div>
									<span class="font-mono text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground"
										>{selectedTask.taskCode}</span
									>
									<h3 class="text-lg font-semibold text-foreground">{selectedTask.title}</h3>
								</div>
								{#if canManage && !selectedTask.archivedAt}
									<Button variant="outline" size="sm" type="button" onclick={startEdit}>Edit</Button>
								{/if}
							</div>

							{#if selectedTask.description}
								<p class="text-sm text-muted-foreground">{selectedTask.description}</p>
							{/if}

							<dl class="grid gap-3 md:grid-cols-2">
								<div class="rounded-lg border bg-muted/30 p-3">
									<dt>Category</dt>
									<dd>{selectedTask.category ?? 'Not set'}</dd>
								</div>
								<div class="rounded-lg border bg-muted/30 p-3">
									<dt>MOS applicability</dt>
									<dd>{formatMosApplicability(selectedTask.mos)}</dd>
								</div>
								<div class="rounded-lg border bg-muted/30 p-3">
									<dt>Expiration override</dt>
									<dd>{selectedTask.expirationMonths ? `${selectedTask.expirationMonths} months` : 'Org default'}</dd>
								</div>
								<div class="rounded-lg border bg-muted/30 p-3">
									<dt>Sort order</dt>
									<dd>{selectedTask.sortOrder}</dd>
								</div>
								<div class="rounded-lg border bg-muted/30 p-3">
									<dt>Completion history</dt>
									<dd>{completionCount(selectedTask.id)} records</dd>
								</div>
								{#if selectedTask.archivedAt}
									<div class="rounded-lg border bg-muted/30 p-3">
										<dt>Archived</dt>
										<dd>{formatArchivedAt(selectedTask.archivedAt)}</dd>
									</div>
								{/if}
							</dl>

							{#if canManage}
								<div class="flex flex-wrap gap-2">
									{#if selectedTask.archivedAt}
										<Button variant="outline" size="sm" type="button" onclick={() => restoreTask(selectedTask.id)}>
											Restore Task
										</Button>
									{:else}
										<Button
											variant="destructive"
											size="sm"
											type="button"
											onclick={() => (confirmArchive = selectedTask)}
										>
											Archive Task
										</Button>
									{/if}
								</div>
							{/if}
						</div>
					{:else}
						<Empty.Root>
							<Empty.Header>
								<Empty.Title>Select an ICT task to view details.</Empty.Title>
							</Empty.Header>
						</Empty.Root>
					{/if}
				</section>
			</div>
		{/if}
	</div>
{/if}

{#if confirmArchive}
	<ConfirmDialog
		title="Archive ICT Task"
		message={archiveMessage(confirmArchive)}
		confirmLabel="Archive Task"
		variant="warning"
		onConfirm={confirmArchiveTask}
		onCancel={() => (confirmArchive = null)}
	/>
{/if}
