<script lang="ts">
	import PageToolbar from '$lib/components/PageToolbar.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import SearchSelect from '$lib/components/ui/SearchSelect.svelte';
	import Spinner from '$lib/components/ui/Spinner.svelte';
	import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';
	import { getOrgContext } from '$lib/stores/orgContext.svelte';
	import { ictTasksStore } from '$features/critical-tasks/stores/ictTasks.svelte';
	import { personnelIctCompletionsStore } from '$features/critical-tasks/stores/personnelIctCompletions.svelte';
	import type { IctTask } from '$features/critical-tasks/criticalTasks.types';
	import IctTaskBulkImport from '$features/critical-tasks/components/IctTaskBulkImport.svelte';
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
	const canManage = $derived(org.isPrivileged && !org.readOnly);

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
	const filtersActive = $derived(Boolean(taskSearch.trim() || selectedMos));
	const filteredTasks = $derived(
		visibleTasks.filter((task) => matchesTaskSearch(task, taskSearch) && matchesSelectedMos(task))
	);
	const taskListMeta = $derived(
		filtersActive
			? `${filteredTasks.length} of ${visibleTasks.length} shown`
			: `${visibleTasks.length} ${taskStatusFilter === 'active' ? 'configured' : 'archived'}`
	);
	const canReorderTasks = $derived(
		canManage && taskStatusFilter === 'active' && !editing && !creating && !importingTasks && !filtersActive
	);

	$effect(() => {
		if (selectedMos && !mosFilterOptions.some((option) => option.value === selectedMos)) {
			selectedMos = '';
		}
	});

	$effect(() => {
		if (selectedTaskId && !visibleTasks.some((task) => task.id === selectedTaskId)) {
			selectedTaskId = null;
		}
	});

	function matchesTaskSearch(task: Pick<IctTask, 'taskCode' | 'title'>, query: string): boolean {
		const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
		if (terms.length === 0) return true;

		const searchable = `${task.taskCode} ${task.title}`.toLowerCase();
		return terms.every((term) => searchable.includes(term));
	}

	function matchesSelectedMos(task: Pick<IctTask, 'mos'>): boolean {
		if (!selectedMos) return true;
		return isIctTaskApplicableToMos(task, selectedMos);
	}

	function clearTaskFilters() {
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
				description: formDescription.trim() || null,
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

<PageToolbar
	title="ICT Task Library"
	titleBadge="Beta"
	subtitle="Owner and admin task definitions"
	breadcrumbs={[{ label: 'Critical Tasks', href: `/org/${orgId}/critical-tasks` }, { label: 'Library' }]}
>
	<a href={`/org/${orgId}/critical-tasks`} class="btn btn-sm">Back</a>
</PageToolbar>

{#if !org.isPrivileged}
	<section class="page-message" aria-labelledby="library-restricted-title">
		<h2 id="library-restricted-title">Access Restricted</h2>
		<p>Only organization owners and admins can manage ICT task definitions.</p>
	</section>
{:else if loading}
	<section class="route-loading" aria-busy="true" aria-live="polite" role="status">
		<Spinner color="currentColor" />
		<p>Loading ICT task library...</p>
	</section>
{:else if importingTasks}
	<section class="import-route-workspace" aria-label="ICT task import workspace">
		<IctTaskBulkImport tasks={ictTasksStore.items} onCancel={cancelImport} onDone={cancelImport} />
	</section>
{:else}
	<div class="library-layout">
		<section class="panel task-list-panel" aria-labelledby="task-library-title">
			<div class="panel-header">
				<div class="panel-header-copy">
					<h3 id="task-library-title" class="panel-title">
						{taskStatusFilter === 'active' ? 'Active Tasks' : 'Archived Tasks'}
					</h3>
					<span class="panel-meta">{taskListMeta}</span>
				</div>
				{#if canManage}
					<div class="panel-actions">
						<button
							class="btn btn-sm"
							type="button"
							onclick={startImport}
							disabled={creating || editing || importingTasks}
						>
							Import CSV
						</button>
						<button
							class="btn btn-primary btn-sm"
							type="button"
							onclick={startCreate}
							disabled={creating || editing || importingTasks}
						>
							New Task
						</button>
					</div>
				{/if}
			</div>

			<div class="status-toggle" aria-label="Filter ICT tasks by status">
				<button
					class="btn btn-sm"
					class:is-selected={taskStatusFilter === 'active'}
					type="button"
					aria-pressed={taskStatusFilter === 'active'}
					onclick={() => (taskStatusFilter = 'active')}
				>
					Active
				</button>
				<button
					class="btn btn-sm"
					class:is-selected={taskStatusFilter === 'archived'}
					type="button"
					aria-pressed={taskStatusFilter === 'archived'}
					onclick={() => (taskStatusFilter = 'archived')}
				>
					Archived
				</button>
			</div>

			{#if visibleTasks.length > 0}
				<div class="task-filters" aria-label="Filter ICT task library">
					<div class="filter-field filter-field-search">
						<label for="ict-library-task-search">Search</label>
						<input
							id="ict-library-task-search"
							class="input task-search-input"
							type="search"
							placeholder="Search task number or title..."
							bind:value={taskSearch}
						/>
					</div>

					<div class="filter-field">
						<label for="ict-library-mos-filter">MOS</label>
						<SearchSelect
							id="ict-library-mos-filter"
							options={mosFilterOptions}
							bind:value={selectedMos}
							placeholder="All MOSs"
							ariaLabel="MOS"
							compact
						/>
					</div>

					{#if filtersActive}
						<button class="btn btn-sm" type="button" onclick={clearTaskFilters}>Clear filters</button>
					{/if}
				</div>
			{/if}

			{#if visibleTasks.length === 0 && !creating}
				<EmptyState
					message={taskStatusFilter === 'active'
						? 'No active ICT tasks. Add task definitions to begin tracking ICTL readiness.'
						: 'No archived ICT tasks. Restore a task after archiving when you need it back in the active library.'}
					actionLabel={canManage ? 'New Task' : undefined}
					onAction={canManage ? startCreate : undefined}
				/>
			{:else if visibleTasks.length > 0 && filteredTasks.length === 0}
				<EmptyState
					message="No ICT tasks match the current filters."
					actionLabel="Clear filters"
					onAction={clearTaskFilters}
				/>
			{:else}
				<ul class="task-list" aria-label="ICT task library">
					{#each filteredTasks as task, index (task.id)}
						<li class="task-item" class:selected={selectedTaskId === task.id && !creating}>
							<button
								class="task-select"
								type="button"
								aria-pressed={selectedTaskId === task.id && !creating}
								onclick={() => selectTask(task.id)}
							>
								<span class="task-code">{task.taskCode}</span>
								<span class="task-title">{task.title}</span>
								<span class="task-meta">{formatMosApplicability(task.mos)}</span>
							</button>
							{#if canReorderTasks}
								<div class="task-reorder" aria-label="Reorder {task.taskCode}">
									<button
										class="btn-move"
										type="button"
										onclick={() => moveTask(index, -1)}
										disabled={index === 0}
										aria-label="Move {task.taskCode} up">▲</button
									>
									<button
										class="btn-move"
										type="button"
										onclick={() => moveTask(index, 1)}
										disabled={index === activeTasks.length - 1}
										aria-label="Move {task.taskCode} down">▼</button
									>
								</div>
							{/if}
						</li>
					{/each}
				</ul>
			{/if}
		</section>

		<section class="panel detail-panel" aria-label="ICT task details">
			{#if creating || editing}
				<form class="editor" onsubmit={saveTask}>
					<h3 class="panel-title">{creating ? 'New ICT Task' : 'Edit ICT Task'}</h3>

					<div class="form-grid">
						<div class="form-field">
							<label class="form-label" for="ict-task-code">Task code</label>
							<input class="input" id="ict-task-code" type="text" bind:value={formTaskCode} required />
						</div>

						<div class="form-field">
							<label class="form-label" for="ict-task-title">Title</label>
							<input class="input" id="ict-task-title" type="text" bind:value={formTitle} required />
						</div>

						<div class="form-field full">
							<label class="form-label" for="ict-task-description">Description</label>
							<textarea
								class="input"
								id="ict-task-description"
								rows="3"
								bind:value={formDescription}
								placeholder="Optional task context"
							></textarea>
						</div>

						<div class="form-field full">
							<label class="form-label" for="ict-task-mos">MOS applicability</label>
							<input
								class="input"
								id="ict-task-mos"
								type="text"
								bind:value={formMos}
								placeholder="68W, 18D. Leave blank for all MOSs."
							/>
							<p class="field-hint">Leave blank for all MOSs.</p>
						</div>

						<div class="form-field">
							<label class="form-label" for="ict-task-expiration">Expiration override</label>
							<input
								class="input"
								id="ict-task-expiration"
								type="number"
								min="1"
								value={formExpirationMonths}
								oninput={handleExpirationInput}
								placeholder="Org default"
							/>
						</div>

						<div class="form-field">
							<label class="form-label" for="ict-task-sort">Sort order</label>
							<input
								class="input"
								id="ict-task-sort"
								type="number"
								min="0"
								value={formSortOrder}
								oninput={handleSortOrderInput}
							/>
						</div>
					</div>

					<div class="editor-actions">
						<button class="btn btn-sm" type="button" onclick={cancelEdit}>Cancel</button>
						<button
							class="btn btn-primary btn-sm"
							type="submit"
							disabled={!formTaskCode.trim() || !formTitle.trim() || saving}
						>
							{#if saving}<Spinner size={12} />{/if}
							{creating ? 'Create Task' : 'Save Changes'}
						</button>
					</div>
				</form>
			{:else if selectedTask}
				<div class="detail-view">
					<div class="detail-header">
						<div>
							<span class="task-code">{selectedTask.taskCode}</span>
							<h3 class="detail-title">{selectedTask.title}</h3>
						</div>
						{#if canManage && !selectedTask.archivedAt}
							<button class="btn btn-sm" type="button" onclick={startEdit}>Edit</button>
						{/if}
					</div>

					{#if selectedTask.description}
						<p class="detail-description">{selectedTask.description}</p>
					{/if}

					<dl class="detail-fields">
						<div>
							<dt>MOS applicability</dt>
							<dd>{formatMosApplicability(selectedTask.mos)}</dd>
						</div>
						<div>
							<dt>Expiration override</dt>
							<dd>{selectedTask.expirationMonths ? `${selectedTask.expirationMonths} months` : 'Org default'}</dd>
						</div>
						<div>
							<dt>Sort order</dt>
							<dd>{selectedTask.sortOrder}</dd>
						</div>
						<div>
							<dt>Completion history</dt>
							<dd>{completionCount(selectedTask.id)} records</dd>
						</div>
						{#if selectedTask.archivedAt}
							<div>
								<dt>Archived</dt>
								<dd>{formatArchivedAt(selectedTask.archivedAt)}</dd>
							</div>
						{/if}
					</dl>

					{#if canManage}
						<div class="detail-actions">
							{#if selectedTask.archivedAt}
								<button class="btn btn-sm" type="button" onclick={() => restoreTask(selectedTask.id)}>
									Restore Task
								</button>
							{:else}
								<button class="btn btn-warning btn-sm" type="button" onclick={() => (confirmArchive = selectedTask)}>
									Archive Task
								</button>
							{/if}
						</div>
					{/if}
				</div>
			{:else}
				<div class="panel-placeholder">
					<p>Select an ICT task to view details.</p>
				</div>
			{/if}
		</section>
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

<style>
	.page-message,
	.route-loading {
		padding: var(--sp-6);
	}

	.route-loading {
		display: flex;
		gap: var(--sp-2);
		align-items: center;
		justify-content: center;
		color: var(--text-secondary);
	}

	.import-route-workspace {
		padding: var(--sp-5);
	}

	.library-layout {
		display: grid;
		grid-template-columns: minmax(290px, 360px) minmax(0, 1fr);
		gap: var(--sp-5);
		padding: var(--sp-5);
	}

	.panel {
		min-height: 0;
		padding: var(--sp-5);
		border: var(--border-thin);
		border-radius: var(--radius-lg);
		background: var(--surface-panel);
	}

	.task-list-panel,
	.detail-panel,
	.editor,
	.detail-view {
		display: flex;
		flex-direction: column;
		gap: var(--sp-4);
	}

	.panel-header,
	.detail-header,
	.editor-actions {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--sp-3);
	}

	.panel-header {
		padding-bottom: var(--sp-4);
		border-bottom: var(--border-thin);
	}

	.panel-actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-2);
		justify-content: flex-end;
	}

	.status-toggle {
		display: flex;
		gap: var(--sp-2);
		flex-wrap: wrap;
	}

	.status-toggle .btn.is-selected {
		border-color: color-mix(in srgb, var(--amber) 35%, var(--border-default));
		background: color-mix(in srgb, var(--amber-light) 70%, var(--surface-panel) 30%);
		color: var(--text-primary);
	}

	.task-filters {
		display: flex;
		flex-direction: column;
		gap: var(--sp-3);
		align-items: stretch;
	}

	.filter-field {
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
		min-width: 0;
	}

	.filter-field label {
		color: var(--text-secondary);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: var(--letter-spacing-mono);
		text-transform: uppercase;
	}

	.task-search-input {
		min-height: 32px;
		padding: 6px 8px;
		font-size: var(--text-sm);
	}

	.task-filters > .btn {
		align-self: flex-start;
	}

	.panel-header-copy {
		display: flex;
		flex-direction: column;
		gap: var(--sp-1);
	}

	.panel-title,
	.detail-title {
		margin: 0;
		color: var(--text-primary);
		font-family: var(--font-display);
		font-weight: var(--font-weight-display);
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}

	.panel-title {
		font-size: var(--text-xl);
	}

	.detail-title {
		margin-top: var(--sp-1);
		font-size: var(--text-2xl);
	}

	.panel-meta,
	.field-hint,
	.detail-description,
	.panel-placeholder p,
	.page-message p,
	.route-loading p {
		margin: 0;
		color: var(--text-secondary);
	}

	.panel-meta,
	.field-hint {
		font-size: var(--text-xs);
	}

	.task-list {
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
		padding: 0;
		margin: 0;
		list-style: none;
	}

	.task-item {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		gap: var(--sp-2);
		align-items: stretch;
		border: var(--border-thin);
		border-radius: var(--radius-md);
		background: color-mix(in srgb, var(--surface-panel) 90%, var(--surface-subtle) 10%);
	}

	.task-item.selected {
		border-color: color-mix(in srgb, var(--amber) 35%, var(--border-default));
		background: color-mix(in srgb, var(--amber-light) 70%, var(--surface-panel) 30%);
	}

	.task-select {
		display: flex;
		flex-direction: column;
		gap: var(--sp-1);
		min-width: 0;
		padding: var(--sp-3);
		border: 0;
		background: transparent;
		color: inherit;
		text-align: left;
		cursor: pointer;
	}

	.task-code {
		color: var(--text-primary);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: var(--letter-spacing-mono);
	}

	.task-title {
		color: var(--text-primary);
		font-size: var(--text-sm);
		font-weight: var(--font-weight-semibold);
	}

	.task-meta {
		color: var(--text-secondary);
		font-size: var(--text-xs);
	}

	.task-reorder {
		display: flex;
		flex-direction: column;
		gap: 1px;
		padding: var(--sp-2);
	}

	.btn-move {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 1.5rem;
		height: 1.5rem;
		padding: 0;
		border: var(--border-thin);
		border-radius: var(--radius-sm);
		background: transparent;
		color: var(--text-secondary);
		font-size: 10px;
		cursor: pointer;
	}

	.btn-move:disabled {
		opacity: 0.25;
		cursor: default;
	}

	.form-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: var(--sp-4);
	}

	.form-field {
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
	}

	.form-field.full {
		grid-column: 1 / -1;
	}

	.detail-fields {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: var(--sp-3);
		margin: 0;
	}

	.detail-fields > div {
		padding: var(--sp-3);
		border: var(--border-thin);
		border-radius: var(--radius-md);
		background: var(--surface-subtle);
	}

	.detail-fields dt {
		margin-bottom: var(--sp-1);
		color: var(--text-secondary);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: var(--letter-spacing-mono);
		text-transform: uppercase;
	}

	.detail-fields dd {
		margin: 0;
		color: var(--text-primary);
		font-size: var(--text-sm);
	}

	.detail-actions {
		padding-top: var(--sp-4);
		border-top: var(--border-thin);
	}

	@media (max-width: 820px) {
		.import-route-workspace,
		.library-layout {
			grid-template-columns: 1fr;
			padding: var(--sp-4);
		}

		.form-grid,
		.detail-fields {
			grid-template-columns: 1fr;
		}
	}
</style>
