<script lang="ts">
	import PageToolbar from '$lib/components/PageToolbar.svelte';
	import DataTable from '$lib/components/ui/data-table/DataTable.svelte';
	import Badge from '$lib/components/ui/Badge.svelte';
	import type { ColumnDef } from '$lib/components/ui/data-table/useDataTable.svelte';
	import { getOrgContext } from '$lib/stores/orgContext.svelte';
	import IctCompletionModal from '$features/critical-tasks/components/IctCompletionModal.svelte';
	import { ictTasksStore } from '$features/critical-tasks/stores/ictTasks.svelte';
	import { personnelIctCompletionsStore } from '$features/critical-tasks/stores/personnelIctCompletions.svelte';
	import { getIctStatus } from '$features/critical-tasks/utils/ictStatus';
	import { getActiveIctTasksForLibrary, isIctTaskApplicableToMos } from '$features/critical-tasks/utils/ictTaskLibrary';
	import type {
		CriticalTasksPersonnelHistoryData,
		CriticalTasksPersonnelHistoryRow,
		IctTask,
		PersonnelIctCompletion
	} from '$features/critical-tasks/criticalTasks.types';

	interface Props {
		data: {
			orgId: string;
			criticalTasksPersonnelHistory: CriticalTasksPersonnelHistoryData;
			criticalTasksSettings?: {
				defaultExpirationMonths: number;
				expiringSoonWarningDays: number;
			};
			permissions?: {
				canViewTraining: boolean;
				canEditTraining: boolean;
			};
			session?:
				| (Record<string, unknown> & {
						user?:
							| (Record<string, unknown> & {
									user_metadata?: unknown;
							  })
							| null;
				  })
				| null;
		};
	}

	interface ActiveTaskRow {
		task: IctTask;
		completion: PersonnelIctCompletion | undefined;
		statusInfo: ReturnType<typeof getIctStatus>;
	}

	type IctStatusValue = ActiveTaskRow['statusInfo']['status'];

	let { data }: Props = $props();

	const org = getOrgContext();
	const history = $derived(data.criticalTasksPersonnelHistory);
	const personnelName = $derived(
		[history.personnel.rank, `${history.personnel.lastName}, ${history.personnel.firstName}`].filter(Boolean).join(' ')
	);
	const permissions = $derived(data.permissions ?? org.permissions);
	const canEditTraining = $derived(permissions.canEditTraining && !org.readOnly);
	let activeEditorRow = $state<ActiveTaskRow | null>(null);
	let showTaskInputModal = $state(false);

	function compareCompletionRecency(a: PersonnelIctCompletion, b: PersonnelIctCompletion): number {
		const completedAtDiff = a.completedAt.localeCompare(b.completedAt);
		if (completedAtDiff !== 0) return completedAtDiff;
		return a.createdAt.localeCompare(b.createdAt);
	}

	function latestCompletionForTask(taskId: string): PersonnelIctCompletion | undefined {
		return personnelIctCompletionsStore.items
			.filter((completion) => completion.personnelId === history.personnel.id && completion.ictTaskId === taskId)
			.sort(compareCompletionRecency)
			.at(-1);
	}

	function compareTaskLibraryOrder(
		a: Pick<IctTask, 'sortOrder' | 'taskCode'>,
		b: Pick<IctTask, 'sortOrder' | 'taskCode'>
	): number {
		return a.sortOrder - b.sortOrder || a.taskCode.localeCompare(b.taskCode);
	}

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

	const activeRows = $derived.by<ActiveTaskRow[]>(() =>
		getActiveIctTasksForLibrary(ictTasksStore.items)
			.filter((task) => isIctTaskApplicableToMos(task, history.personnel.mos))
			.map((task) => {
				const completion = latestCompletionForTask(task.id);
				return {
					task,
					completion,
					statusInfo: getIctStatus(completion?.completedAt ?? null, task, data.criticalTasksSettings)
				};
			})
	);

	const archivedHistoryRows = $derived(history.rows.filter((row) => row.taskArchivedAt !== null || row.task === null));
	const currentUserDisplayName = $derived(getCurrentUserDisplayName());
	const applicableTaskOptions = $derived(activeRows.map((row) => row.task));
	const canInputTask = $derived(canEditTraining && applicableTaskOptions.length > 0);

	const statusLabels = {
		current: 'Current',
		'expiring-soon': 'Expiring soon',
		expired: 'Expired',
		'not-recorded': 'Not recorded'
	} as const;

	function statusBadgeColor(status: IctStatusValue): string | undefined {
		switch (status) {
			case 'current':
				return 'var(--success)';
			case 'expiring-soon':
				return 'var(--amber-dark)';
			case 'expired':
				return 'var(--danger)';
			default:
				return undefined;
		}
	}

	const activeTaskColumns = $derived.by<ColumnDef<ActiveTaskRow>[]>(() => {
		const columns: ColumnDef<ActiveTaskRow>[] = [
			{
				key: 'task',
				header: 'Task',
				value: (row) => row.task.taskCode,
				searchValue: (row) => `${row.task.taskCode} ${row.task.title}`,
				compare: (a, b) => compareTaskLibraryOrder(a.task, b.task)
			},
			{
				key: 'status',
				header: 'Status',
				value: (row) => statusLabels[row.statusInfo.status]
			},
			{
				key: 'completed',
				header: 'Completed',
				value: (row) => row.completion?.completedAt ?? null
			},
			{
				key: 'expires',
				header: 'Expires',
				value: (row) => row.statusInfo.expirationDate ?? null
			},
			{
				key: 'method',
				header: 'Method',
				value: (row) => row.completion?.validationMethod ?? null
			},
			{
				key: 'validator',
				header: 'Validator',
				value: (row) => row.completion?.validatedBy ?? null
			},
			{
				key: 'notes',
				header: 'Notes',
				value: (row) => row.completion?.notes ?? null
			}
		];

		if (canEditTraining) {
			columns.push({
				key: 'action',
				header: 'Action',
				value: () => null,
				sortable: false,
				searchable: false
			});
		}

		return columns;
	});

	const historyColumns: ColumnDef<CriticalTasksPersonnelHistoryRow>[] = [
		{
			key: 'task',
			header: 'Task',
			value: (row) => row.taskCode,
			searchValue: (row) => `${row.taskCode} ${row.taskTitle}`,
			compare: (a, b) => a.taskCode.localeCompare(b.taskCode)
		},
		{
			key: 'completed',
			header: 'Completed',
			value: (row) => row.completion.completedAt
		},
		{
			key: 'method',
			header: 'Method',
			value: (row) => row.completion.validationMethod
		},
		{
			key: 'validator',
			header: 'Validator',
			value: (row) => row.completion.validatedBy ?? null
		},
		{
			key: 'notes',
			header: 'Notes',
			value: (row) => row.completion.notes ?? null
		}
	];

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

	function handleTaskInput(): void {
		if (!canInputTask) return;
		activeEditorRow = null;
		showTaskInputModal = true;
	}
</script>

<svelte:head>
	<title>{personnelName} Critical Tasks Record - Troop to Task</title>
</svelte:head>

<PageToolbar
	title="Critical Tasks Record"
	titleBadge="Beta"
	subtitle={personnelName}
	breadcrumbs={[
		{ label: 'Critical Tasks', href: `/org/${data.orgId}/critical-tasks` },
		{ label: history.personnel.lastName }
	]}
>
	{#if canEditTraining}
		<button class="btn btn-primary btn-sm" type="button" onclick={handleTaskInput} disabled={!canInputTask}>
			Input Task
		</button>
	{/if}
	<a href={`/org/${data.orgId}/critical-tasks`} class="btn btn-sm">Back</a>
</PageToolbar>

<section class="history-page" aria-labelledby="ict-detail-title">
	<div class="history-heading">
		<h2 id="ict-detail-title">Applicable Critical Tasks</h2>
		<p>Review the current ICTL record for this soldier in one place.</p>
	</div>

	<DataTable
		data={activeRows}
		columns={activeTaskColumns}
		ariaLabel="Applicable Critical Tasks"
		emptyMessage="No active critical tasks apply to this person."
		rowKey={(row) => row.task.id}
		compact
	>
		{#snippet cell(row, col)}
			{#if col.key === 'task'}
				<div class="task-cell">
					<span class="task-code">{row.task.taskCode}</span>
					<span class="task-title">{row.task.title}</span>
				</div>
			{:else if col.key === 'status'}
				<Badge
					label={statusLabels[row.statusInfo.status]}
					color={statusBadgeColor(row.statusInfo.status)}
					variant={row.statusInfo.status === 'not-recorded' ? 'outlined' : 'filled'}
				/>
			{:else if col.key === 'completed'}
				{row.completion?.completedAt ?? 'Not recorded'}
			{:else if col.key === 'expires'}
				{row.statusInfo.expirationDate ?? 'Not recorded'}
			{:else if col.key === 'method'}
				{row.completion?.validationMethod ?? 'Not recorded'}
			{:else if col.key === 'validator'}
				{row.completion?.validatedBy ?? 'Not recorded'}
			{:else if col.key === 'notes'}
				{row.completion?.notes ?? 'None'}
			{:else if col.key === 'action'}
				<div class="action-cell">
					<button
						type="button"
						class="btn btn-sm btn-secondary"
						aria-label={`${row.completion ? 'Edit' : 'Log'} completion for ${row.task.taskCode}`}
						onclick={() => (activeEditorRow = row)}
					>
						{row.completion ? 'Edit completion' : 'Log completion'}
					</button>
				</div>
			{/if}
		{/snippet}
	</DataTable>
</section>

<section class="history-page" aria-labelledby="ict-history-title">
	<div class="history-heading">
		<h2 id="ict-history-title">Historical Completions</h2>
		<p>Archived task records remain available here for audit context.</p>
	</div>

	<DataTable
		data={archivedHistoryRows}
		columns={historyColumns}
		ariaLabel="ICT completion history"
		emptyMessage="No ICT completion history recorded for this person."
		rowKey={(row) => row.completion.id}
		compact
	>
		{#snippet cell(row, col)}
			{#if col.key === 'task'}
				<div class="task-cell">
					<span class="task-code">{row.taskCode}</span>
					<span class="task-title">{row.taskTitle}</span>
					{#if row.taskArchivedAt}
						<Badge label="Archived" variant="outlined" />
					{/if}
				</div>
			{:else if col.key === 'completed'}
				{row.completion.completedAt}
			{:else if col.key === 'method'}
				{row.completion.validationMethod}
			{:else if col.key === 'validator'}
				{row.completion.validatedBy ?? 'Not recorded'}
			{:else if col.key === 'notes'}
				{row.completion.notes ?? 'None'}
			{/if}
		{/snippet}
	</DataTable>
</section>

{#if activeEditorRow}
	<IctCompletionModal
		person={history.personnel}
		task={activeEditorRow.task}
		existingCompletion={activeEditorRow.completion}
		settings={data.criticalTasksSettings ?? null}
		{currentUserDisplayName}
		onSave={handleCompletionSave}
		onClose={() => (activeEditorRow = null)}
	/>
{:else if showTaskInputModal}
	<IctCompletionModal
		person={history.personnel}
		taskOptions={applicableTaskOptions}
		completions={personnelIctCompletionsStore.items}
		settings={data.criticalTasksSettings ?? null}
		{currentUserDisplayName}
		onSave={handleCompletionSave}
		onClose={() => (showTaskInputModal = false)}
	/>
{/if}

<style>
	.history-page {
		display: flex;
		flex-direction: column;
		gap: var(--sp-4);
		padding: var(--sp-5);
	}

	.history-heading {
		display: flex;
		flex-direction: column;
		gap: var(--sp-1);
	}

	.history-heading h2,
	.history-heading p {
		margin: 0;
	}

	.history-heading h2 {
		color: var(--text-primary);
		font-family: var(--font-display);
		font-size: var(--text-2xl);
		font-weight: var(--font-weight-display);
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}

	.history-heading p {
		color: var(--text-secondary);
	}

	.task-cell {
		display: flex;
		flex-direction: column;
		gap: var(--sp-1);
		color: var(--text-primary);
	}

	.task-code {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: var(--letter-spacing-mono);
	}

	.task-title {
		font-weight: var(--font-weight-semibold);
	}

	.action-cell {
		display: flex;
		justify-content: flex-end;
	}

	@media (max-width: 820px) {
		.history-page {
			padding: var(--sp-4);
		}
	}
</style>
