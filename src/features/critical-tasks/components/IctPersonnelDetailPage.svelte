<script lang="ts">
	import { SvelteDate } from 'svelte/reactivity';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import * as DataTable from '$lib/components/ui/data-table';
	import type { ColumnDef } from '$lib/components/ui/data-table';
	import * as WorkspaceToolbar from '$lib/components/patterns/workspace-toolbar';
	import type { WorkspaceToolbarAction } from '$lib/components/patterns/workspace-toolbar';
	import type { CriticalTasksPageAccess } from '../contracts';
	import IctCompletionModal from '$features/critical-tasks/components/IctCompletionModal.svelte';
	import { ictTasksStore } from '$features/critical-tasks/stores/ictTasks.svelte';
	import { personnelIctCompletionsStore } from '$features/critical-tasks/stores/personnelIctCompletions.svelte';
	import {
		calculateIctExpirationDate,
		getIctStatus,
		normalizeCriticalTasksSettings
	} from '$features/critical-tasks/utils/ictStatus';
	import {
		criticalTasksPolicyResourceForGroup,
		criticalTasksRecordCompletionAffordance
	} from '$features/critical-tasks/utils/criticalTasksPolicy';
	import { criticalTasksSettingsFromWorkspaceData } from '$features/critical-tasks/utils/criticalTasksWorkspaceData';
	import { getActiveIctTasksForLibrary, isIctTaskApplicableToMos } from '$features/critical-tasks/utils/ictTaskLibrary';
	import type {
		CriticalTasksPersonnelHistoryData,
		CriticalTasksPersonnelHistoryRow,
		IctTask,
		PersonnelIctCompletion
	} from '$features/critical-tasks/criticalTasks.types';
	import { parseDate } from '$lib/utils/dates';
	import { compareIctCompletionRecency } from '../utils/ictReadinessSnapshot';

	interface Props {
		org: CriticalTasksPageAccess;
		data: {
			orgId: string;
			criticalTasksPersonnelHistory: CriticalTasksPersonnelHistoryData;
			criticalTasks?: {
				data?: {
					settings?: {
						defaultExpirationMonths: number;
						expiringSoonWarningDays: number;
					} | null;
				} | null;
			};
			viewer?: { displayName: string | null } | null;
		};
	}

	interface ActiveTaskRow {
		task: IctTask;
		completion: PersonnelIctCompletion | undefined;
		statusInfo: ReturnType<typeof getIctStatus>;
	}

	type IctStatusValue = ActiveTaskRow['statusInfo']['status'];
	type IctStatusFilter = IctStatusValue | 'all';

	let { data, org }: Props = $props();

	const history = $derived(data.criticalTasksPersonnelHistory);
	const personnelDisplayName = $derived(`${history.personnel.lastName}, ${history.personnel.firstName}`);
	const personnelName = $derived([history.personnel.rank, personnelDisplayName].filter(Boolean).join(' '));
	const settings = $derived(normalizeCriticalTasksSettings(criticalTasksSettingsFromWorkspaceData(data, data.orgId)));
	const recordCompletionAffordance = $derived(
		criticalTasksRecordCompletionAffordance(org, criticalTasksPolicyResourceForGroup(history.personnel.groupId))
	);
	const canRecordCompletion = $derived(!history.personnel.archivedAt && recordCompletionAffordance.allowed);
	let activeEditorRow = $state<ActiveTaskRow | null>(null);
	let showTaskInputModal = $state(false);
	let displayedPersonId: string | null = null;
	let taskSearch = $state('');
	let statusFilter = $state<IctStatusFilter>('all');
	let categoryFilter = $state('all');
	$effect.pre(() => {
		const nextPersonId = history.personnel.id;
		if (displayedPersonId === nextPersonId) return;
		displayedPersonId = nextPersonId;
		activeEditorRow = null;
		showTaskInputModal = false;
	});

	function latestCompletionForTask(taskId: string): PersonnelIctCompletion | undefined {
		const completions = history.personnel.archivedAt
			? history.rows.map((row) => row.completion)
			: personnelIctCompletionsStore.items;
		return completions
			.filter((completion) => completion.personnelId === history.personnel.id && completion.ictTaskId === taskId)
			.sort(compareIctCompletionRecency)
			.at(-1);
	}

	function compareTaskLibraryOrder(
		a: Pick<IctTask, 'sortOrder' | 'taskCode'>,
		b: Pick<IctTask, 'sortOrder' | 'taskCode'>
	): number {
		return a.sortOrder - b.sortOrder || a.taskCode.localeCompare(b.taskCode);
	}

	const activeRows = $derived.by<ActiveTaskRow[]>(() =>
		getActiveIctTasksForLibrary(ictTasksStore.items)
			.filter((task) => isIctTaskApplicableToMos(task, history.personnel.mos))
			.map((task) => {
				const completion = latestCompletionForTask(task.id);
				return {
					task,
					completion,
					statusInfo: getIctStatus(completion?.completedAt ?? null, task, settings)
				};
			})
	);

	const archivedHistoryRows = $derived(
		history.personnel.archivedAt
			? history.rows
			: history.rows.filter((row) => row.taskArchivedAt !== null || row.task === null)
	);
	const currentUserDisplayName = $derived(data.viewer?.displayName ?? null);
	const applicableTaskOptions = $derived(activeRows.map((row) => row.task));
	const canInputTask = $derived(canRecordCompletion && applicableTaskOptions.length > 0);
	const activeFilterCount = $derived(
		(statusFilter !== 'all' ? 1 : 0) + (categoryFilter !== 'all' ? 1 : 0) + (taskSearch.trim() ? 1 : 0)
	);
	const recordContextItems = $derived.by(() => {
		const items = [
			history.personnel.mos ? `MOS ${history.personnel.mos}` : 'No MOS',
			history.personnel.clinicRole || null,
			history.personnel.groupName || null
		];

		if (history.personnel.deros) {
			items.push(`DEROS ${formatRecordDate(history.personnel.deros)}`);
		} else if (history.personnel.ets) {
			items.push(`ETS ${formatRecordDate(history.personnel.ets)}`);
		}

		return items.filter((item): item is string => Boolean(item));
	});
	const statusLabels = {
		current: 'Current',
		'expiring-soon': 'Expiring Soon',
		expired: 'Expired',
		'not-recorded': 'Not Recorded'
	} as const;
	const statusFilterOptions = [
		{ value: 'all', label: 'All Statuses' },
		{ value: 'current', label: 'Current' },
		{ value: 'expiring-soon', label: 'Expiring Soon' },
		{ value: 'expired', label: 'Expired' },
		{ value: 'not-recorded', label: 'Not Recorded' }
	];

	const taskCategories = $derived.by(() => {
		const categories: string[] = [];
		for (const row of activeRows) {
			const category = row.task.category?.trim();
			if (category && !categories.includes(category)) {
				categories.push(category);
			}
		}
		return categories.sort((a, b) => a.localeCompare(b));
	});
	const categoryFilterOptions = $derived([
		{ value: 'all', label: 'All Categories' },
		{ value: 'Uncategorized', label: 'Uncategorized' },
		...taskCategories.map((category) => ({ value: category, label: category }))
	]);

	const filteredActiveRows = $derived.by(() => {
		const search = taskSearch.trim().toLocaleLowerCase('en-US');
		return activeRows
			.filter((row) => {
				const category = row.task.category?.trim() || 'Uncategorized';
				const matchesSearch =
					!search ||
					row.task.taskCode.toLocaleLowerCase('en-US').includes(search) ||
					row.task.title.toLocaleLowerCase('en-US').includes(search) ||
					category.toLocaleLowerCase('en-US').includes(search);
				const matchesStatus = statusFilter === 'all' || row.statusInfo.status === statusFilter;
				const matchesCategory = categoryFilter === 'all' || category === categoryFilter;
				return matchesSearch && matchesStatus && matchesCategory;
			})
			.sort(compareTaskUrgency);
	});

	const summary = $derived.by(() => {
		let current = 0;
		let expiringSoon = 0;
		let expired = 0;
		let notRecorded = 0;
		let lastCompletion: PersonnelIctCompletion | null = null;
		let nextExpiring: ActiveTaskRow | null = null;
		let oldestExpired: ActiveTaskRow | null = null;

		for (const row of activeRows) {
			switch (row.statusInfo.status) {
				case 'current':
					current += 1;
					break;
				case 'expiring-soon':
					expiringSoon += 1;
					if (!nextExpiring || compareStatusDays(row, nextExpiring) < 0) {
						nextExpiring = row;
					}
					break;
				case 'expired':
					expired += 1;
					if (!oldestExpired || compareStatusDays(row, oldestExpired) < 0) {
						oldestExpired = row;
					}
					break;
				case 'not-recorded':
					notRecorded += 1;
					break;
			}

			if (row.completion && (!lastCompletion || compareIctCompletionRecency(row.completion, lastCompletion) > 0)) {
				lastCompletion = row.completion;
			}
		}

		const ready = current + expiringSoon;
		const readinessPercent = activeRows.length === 0 ? 0 : Math.round((ready / activeRows.length) * 100);

		return {
			current,
			expiringSoon,
			expired,
			notRecorded,
			readinessPercent,
			lastCompletion,
			nextExpiring,
			oldestExpired,
			total: activeRows.length
		};
	});

	function compareStatusDays(a: ActiveTaskRow, b: ActiveTaskRow): number {
		return (
			(a.statusInfo.daysUntilExpiration ?? Number.MAX_SAFE_INTEGER) -
			(b.statusInfo.daysUntilExpiration ?? Number.MAX_SAFE_INTEGER)
		);
	}

	function compareTaskUrgency(a: ActiveTaskRow, b: ActiveTaskRow): number {
		const statusOrder: Record<IctStatusValue, number> = {
			'expiring-soon': 0,
			expired: 1,
			'not-recorded': 2,
			current: 3
		};
		const statusDiff = statusOrder[a.statusInfo.status] - statusOrder[b.statusInfo.status];
		if (statusDiff !== 0) return statusDiff;
		const dayDiff = compareStatusDays(a, b);
		if (dayDiff !== 0) return dayDiff;
		return compareTaskLibraryOrder(a.task, b.task);
	}

	function statusTone(status: IctStatusValue): 'current' | 'expiring' | 'expired' | 'none' {
		switch (status) {
			case 'current':
				return 'current';
			case 'expiring-soon':
				return 'expiring';
			case 'expired':
				return 'expired';
			default:
				return 'none';
		}
	}

	function statusVariant(status: IctStatusValue): 'success' | 'warning' | 'danger' | 'outline' {
		switch (status) {
			case 'current':
				return 'success';
			case 'expiring-soon':
				return 'warning';
			case 'expired':
				return 'danger';
			default:
				return 'outline';
		}
	}

	function formatRecordDate(date: string | null | undefined): string {
		if (!date) return 'Not recorded';
		const parsed = date.includes('T') ? new Date(date) : parseDate(date);
		const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
		return `${String(parsed.getDate()).padStart(2, '0')} ${months[parsed.getMonth()]} ${parsed.getFullYear()}`;
	}

	function relativeDateLabel(date: string | null | undefined): string {
		if (!date) return 'No date recorded';
		const dayMs = 1000 * 60 * 60 * 24;
		const today = new SvelteDate();
		today.setHours(0, 0, 0, 0);
		const parsed = parseDate(date);
		const days = Math.round((today.getTime() - parsed.getTime()) / dayMs);
		if (days === 0) return 'today';
		if (days === 1) return '1 day ago';
		if (days > 1) return `${days} days ago`;
		if (days === -1) return 'in 1 day';
		return `in ${Math.abs(days)} days`;
	}

	function expirationSubLabel(row: ActiveTaskRow): string | null {
		const days = row.statusInfo.daysUntilExpiration;
		if (days === null) return null;
		if (days < 0) return `${Math.abs(days)}d overdue`;
		if (days === 0) return 'expires today';
		return `in ${days}d`;
	}

	function expirationSubLabelClass(status: IctStatusValue): string {
		switch (statusTone(status)) {
			case 'expired':
				return 'text-danger-foreground';
			case 'expiring':
				return 'text-warning-foreground';
			default:
				return 'text-muted-foreground';
		}
	}

	function nextExpiringLabel(row: ActiveTaskRow | null): string {
		if (!row || !row.statusInfo.expirationDate) return 'No tasks inside warning window';
		return `Next: ${row.task.taskCode} on ${formatRecordDate(row.statusInfo.expirationDate)}`;
	}

	function expiredSummaryLabel(row: ActiveTaskRow | null): string {
		if (!row || !row.statusInfo.expirationDate) return 'No overdue task records';
		return `${row.task.taskCode} since ${formatRecordDate(row.statusInfo.expirationDate)}`;
	}

	function historyExpirationDate(row: CriticalTasksPersonnelHistoryRow): string | null {
		if (!row.task) return null;
		return calculateIctExpirationDate(row.completion.completedAt, row.task, settings);
	}

	// Both tables keep the task library order, so no column sorts or searches.
	function column<Row>(key: string, header: string, value: (row: Row) => unknown): ColumnDef<Row> {
		return { key, header, value, sortable: false, searchable: false };
	}

	const activeColumns = $derived.by<ColumnDef<ActiveTaskRow>[]>(() => {
		const columns = [
			{ ...column<ActiveTaskRow>('task', 'Task', (row) => row.task.taskCode), rowHeader: true },
			column<ActiveTaskRow>('status', 'Status', (row) => statusLabels[row.statusInfo.status]),
			column<ActiveTaskRow>('completed', 'Completed', (row) => formatRecordDate(row.completion?.completedAt)),
			column<ActiveTaskRow>('expires', 'Expires', (row) => formatRecordDate(row.statusInfo.expirationDate)),
			column<ActiveTaskRow>('method', 'Method', (row) => row.completion?.validationMethod ?? '—'),
			column<ActiveTaskRow>('validator', 'Validator', (row) => row.completion?.validatedBy ?? '—'),
			column<ActiveTaskRow>('notes', 'Notes', (row) => row.completion?.notes ?? 'No notes')
		];
		if (canRecordCompletion) {
			columns.push({ ...column<ActiveTaskRow>('action', 'Action', () => ''), align: 'right' });
		}
		return columns;
	});
	const historyColumns: ColumnDef<CriticalTasksPersonnelHistoryRow>[] = [
		{ ...column<CriticalTasksPersonnelHistoryRow>('task', 'Task', (row) => row.taskCode), rowHeader: true },
		column<CriticalTasksPersonnelHistoryRow>('completed', 'Completed', (row) =>
			formatRecordDate(row.completion.completedAt)
		),
		column<CriticalTasksPersonnelHistoryRow>('expired', 'Expired', (row) =>
			formatRecordDate(historyExpirationDate(row))
		),
		column<CriticalTasksPersonnelHistoryRow>('method', 'Method', (row) => row.completion.validationMethod),
		column<CriticalTasksPersonnelHistoryRow>('validator', 'Validator', (row) => row.completion.validatedBy ?? '—'),
		column<CriticalTasksPersonnelHistoryRow>('notes', 'Notes', (row) => row.completion.notes ?? 'No notes')
	];

	function handlePrint(): void {
		window.print();
	}

	async function handleCompletionSave(
		saveData: Omit<PersonnelIctCompletion, 'id' | 'loggedBy' | 'createdAt'>,
		existingId?: string
	): Promise<void> {
		if (!canRecordCompletion || saveData.personnelId !== history.personnel.id) {
			throw new Error('ICT completion editing is unavailable for this person');
		}

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

	const toolbarActionItems = $derived.by<WorkspaceToolbarAction[]>(() => {
		const items: WorkspaceToolbarAction[] = [];

		items.push({
			id: 'print-record',
			label: 'Print Record',
			icon: 'printer',
			onclick: handlePrint,
			priority: 'normal',
			variant: 'default'
		});

		if (canRecordCompletion) {
			items.push({
				id: 'input-task',
				label: 'Input Task',
				icon: 'clipboard-check',
				onclick: handleTaskInput,
				disabled: !canInputTask,
				priority: 'critical',
				overflow: 'never',
				variant: 'primary'
			});
		}

		return items;
	});
</script>

{#snippet activeCell(row: ActiveTaskRow, column: ColumnDef<ActiveTaskRow>)}
	{#if column.key === 'task'}
		<span class="block font-mono text-xs text-muted-foreground">{row.task.taskCode}</span>
		<span class="block font-medium leading-5 whitespace-normal">{row.task.title}</span>
	{:else if column.key === 'status'}
		<Badge variant={statusVariant(row.statusInfo.status)}>{statusLabels[row.statusInfo.status]}</Badge>
	{:else if column.key === 'completed'}
		<span class={!row.completion ? 'font-mono text-xs italic text-muted-foreground' : 'font-mono text-xs'}>
			{formatRecordDate(row.completion?.completedAt)}
		</span>
	{:else if column.key === 'expires'}
		<span
			class={!row.statusInfo.expirationDate ? 'font-mono text-xs italic text-muted-foreground' : 'font-mono text-xs'}
		>
			{formatRecordDate(row.statusInfo.expirationDate)}
			{#if expirationSubLabel(row)}
				<span class={`mt-0.5 block text-[0.65rem] ${expirationSubLabelClass(row.statusInfo.status)}`}>
					{expirationSubLabel(row)}
				</span>
			{/if}
		</span>
	{:else if column.key === 'method'}
		<span
			class={!row.completion?.validationMethod
				? 'text-xs italic text-muted-foreground'
				: 'text-xs text-muted-foreground'}
		>
			{row.completion?.validationMethod ?? '—'}
		</span>
	{:else if column.key === 'validator'}
		<span class={!row.completion?.validatedBy ? 'font-mono text-xs italic text-muted-foreground' : 'font-mono text-xs'}>
			{row.completion?.validatedBy ?? '—'}
		</span>
	{:else if column.key === 'notes'}
		<div
			class={!row.completion?.notes
				? 'max-w-72 text-xs italic whitespace-normal text-muted-foreground'
				: 'max-w-72 text-xs leading-5 whitespace-normal text-muted-foreground'}
		>
			{row.completion?.notes ?? 'No notes'}
		</div>
	{:else}
		<Button
			type="button"
			variant={row.completion ? 'outline' : 'default'}
			size="sm"
			aria-label={`${row.completion ? 'Edit' : 'Log'} completion for ${row.task.taskCode}`}
			onclick={() => (activeEditorRow = row)}
		>
			{row.completion ? 'Edit' : 'Log Completion'}
		</Button>
	{/if}
{/snippet}

{#snippet historyCell(row: CriticalTasksPersonnelHistoryRow, column: ColumnDef<CriticalTasksPersonnelHistoryRow>)}
	{#if column.key === 'task'}
		<span class="block font-mono text-xs text-muted-foreground">{row.taskCode}</span>
		<span class="block font-medium leading-5 whitespace-normal text-muted-foreground">{row.taskTitle}</span>
		{#if row.taskArchivedAt}
			<Badge variant="outline" class="mt-1">Archived</Badge>
		{/if}
	{:else if column.key === 'completed'}
		<span class="font-mono text-xs">{formatRecordDate(row.completion.completedAt)}</span>
	{:else if column.key === 'expired'}
		<span class={!historyExpirationDate(row) ? 'font-mono text-xs italic text-muted-foreground' : 'font-mono text-xs'}>
			{formatRecordDate(historyExpirationDate(row))}
		</span>
	{:else if column.key === 'method'}
		<span class="text-xs text-muted-foreground">{row.completion.validationMethod}</span>
	{:else if column.key === 'validator'}
		<span class={!row.completion.validatedBy ? 'font-mono text-xs italic text-muted-foreground' : 'font-mono text-xs'}>
			{row.completion.validatedBy ?? '—'}
		</span>
	{:else}
		<div
			class={!row.completion.notes
				? 'max-w-72 text-xs italic whitespace-normal text-muted-foreground'
				: 'max-w-72 text-xs leading-5 whitespace-normal text-muted-foreground'}
		>
			{row.completion.notes ?? 'No notes'}
		</div>
	{/if}
{/snippet}

<svelte:head>
	<title>{personnelName} Critical Tasks Record - Troop to Task</title>
</svelte:head>

<div class="mx-auto flex max-w-[1480px] flex-col gap-5 p-4 text-foreground sm:p-5">
	<WorkspaceToolbar.Root ariaLabel="Personnel critical task controls" wrap>
		<WorkspaceToolbar.Group
			label="Applicable task filters"
			activeCount={activeFilterCount}
			data-testid="ict-detail-filters"
		>
			<WorkspaceToolbar.Select
				ariaLabel="Status"
				options={statusFilterOptions}
				value={statusFilter}
				onValueChange={(value) => (statusFilter = value as IctStatusFilter)}
			/>
			<WorkspaceToolbar.Select
				ariaLabel="Category"
				options={categoryFilterOptions}
				value={categoryFilter}
				onValueChange={(value) => (categoryFilter = value)}
			/>
			<WorkspaceToolbar.Search
				ariaLabel="Filter by task ID or name"
				placeholder="Filter by task ID or name..."
				bind:value={taskSearch}
			/>
		</WorkspaceToolbar.Group>

		<WorkspaceToolbar.Group label="Personnel critical task actions" zone="actions">
			<WorkspaceToolbar.Actions
				actions={toolbarActionItems}
				ariaLabel="Personnel critical task actions"
				overflowAriaLabel="More personnel critical task actions"
			/>
		</WorkspaceToolbar.Group>
	</WorkspaceToolbar.Root>

	{#if recordContextItems.length > 0}
		<section
			class="flex flex-wrap items-center gap-2 font-mono text-xs uppercase tracking-[0.04em] text-muted-foreground"
			aria-label="Personnel record context"
		>
			{#each recordContextItems as item, index (item)}
				<span
					>{#if index > 0}<span class="mr-2 text-muted-foreground/60">·</span>{/if}{item}</span
				>
			{/each}
		</section>
	{/if}

	<section
		class="grid gap-3 lg:grid-cols-[minmax(20rem,2fr)_repeat(3,minmax(12rem,1fr))]"
		aria-label="Individual critical tasks summary"
	>
		<article class="rounded-lg border bg-card p-4 text-card-foreground">
			<div
				class="mb-2 flex items-center gap-2 font-mono text-[0.65rem] font-semibold uppercase tracking-[0.08em] text-muted-foreground"
			>
				<span class="size-2 rounded-sm bg-warning"></span>Individual Readiness
			</div>
			<div class="font-mono text-3xl font-semibold text-warning">
				{summary.readinessPercent}<span class="text-xl">%</span>
			</div>
			<div class="mt-3 h-1 overflow-hidden rounded-full bg-muted" aria-hidden="true">
				<div class="h-full bg-warning" style={`width: ${summary.readinessPercent}%`}></div>
			</div>
			<div class="mt-3 flex flex-wrap gap-3 font-mono text-xs tracking-[0.04em] text-muted-foreground">
				<span class="inline-flex items-center gap-1"
					><span class="size-2 rounded-sm bg-success"></span>{summary.current} current</span
				>
				<span class="inline-flex items-center gap-1"
					><span class="size-2 rounded-sm bg-warning"></span>{summary.expiringSoon} soon</span
				>
				<span class="inline-flex items-center gap-1"
					><span class="size-2 rounded-sm bg-danger"></span>{summary.expired} expired</span
				>
				<span class="inline-flex items-center gap-1"
					><span class="size-2 rounded-sm bg-muted-foreground"></span>{summary.notRecorded} none</span
				>
			</div>
		</article>
		<article class="rounded-lg border bg-card p-4 text-card-foreground">
			<div
				class="mb-2 flex items-center gap-2 font-mono text-[0.65rem] font-semibold uppercase tracking-[0.08em] text-muted-foreground"
			>
				<span class="size-2 rounded-sm bg-warning"></span>Expiring ≤{settings.expiringSoonWarningDays}d
			</div>
			<div class="font-mono text-3xl font-semibold text-warning">{summary.expiringSoon}</div>
			<div class="mt-2 font-mono text-xs leading-5 text-muted-foreground">
				{nextExpiringLabel(summary.nextExpiring)}
			</div>
		</article>
		<article class="rounded-lg border bg-card p-4 text-card-foreground">
			<div
				class="mb-2 flex items-center gap-2 font-mono text-[0.65rem] font-semibold uppercase tracking-[0.08em] text-muted-foreground"
			>
				<span class="size-2 rounded-sm bg-danger"></span>Expired / Overdue
			</div>
			<div class="font-mono text-3xl font-semibold text-danger">{summary.expired}</div>
			<div class="mt-2 font-mono text-xs leading-5 text-muted-foreground">
				{expiredSummaryLabel(summary.oldestExpired)}
			</div>
		</article>
		<article class="rounded-lg border bg-card p-4 text-card-foreground">
			<div class="mb-2 font-mono text-[0.65rem] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
				Last Validation
			</div>
			<div class="pt-1 font-mono text-xl font-semibold">{formatRecordDate(summary.lastCompletion?.completedAt)}</div>
			<div class="mt-2 font-mono text-xs leading-5 text-muted-foreground">
				{#if summary.lastCompletion}
					by {summary.lastCompletion.validatedBy ?? 'Validator not recorded'} · {relativeDateLabel(
						summary.lastCompletion.completedAt
					)}
				{:else}
					No completion recorded
				{/if}
			</div>
		</article>
	</section>

	<section class="rounded-lg border bg-card p-4 text-card-foreground sm:p-5" aria-labelledby="ict-detail-title">
		<div class="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
			<div>
				<h2 id="ict-detail-title" class="text-xl font-semibold">Applicable Critical Tasks</h2>
				<p class="mt-1 text-sm text-muted-foreground">Current ICTL record for this soldier in one place.</p>
			</div>
			<span class="font-mono text-xs uppercase tracking-[0.08em] text-muted-foreground"
				>{summary.total} tasks assigned</span
			>
		</div>

		<DataTable.DataTable
			data={filteredActiveRows}
			columns={activeColumns}
			ariaLabel="Applicable Critical Tasks"
			scrollRegionLabel="Applicable Critical Tasks, scrollable"
			emptyMessage="No active critical tasks match this view."
			rowKey={(row) => row.task.id}
			cell={activeCell}
		/>
	</section>

	<section class="rounded-lg border bg-muted/20 p-4 sm:p-5" aria-labelledby="ict-history-title">
		<div class="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
			<div>
				<h2 id="ict-history-title" class="text-xl font-semibold">Historical Completions</h2>
				<p class="mt-1 text-sm text-muted-foreground">
					{history.personnel.archivedAt
						? 'Retained completion records for this archived person. Read-only.'
						: 'Archived task records retained for audit context. Read-only.'}
				</p>
			</div>
			<span class="font-mono text-xs uppercase tracking-[0.08em] text-muted-foreground"
				>Audit archive · {archivedHistoryRows.length} records</span
			>
		</div>

		<DataTable.DataTable
			data={archivedHistoryRows}
			columns={historyColumns}
			ariaLabel="ICT completion history"
			scrollRegionLabel="ICT completion history, scrollable"
			emptyMessage={history.personnel.archivedAt
				? 'No completion history recorded for this person.'
				: 'No archived task completions recorded.'}
			rowKey={(row) => row.completion.id}
			cell={historyCell}
		/>
	</section>

	<footer
		class="flex flex-wrap justify-between gap-3 border-t py-4 font-mono text-[0.65rem] uppercase tracking-[0.08em] text-muted-foreground"
	>
		<span>All dates in local time · Edits audited</span>
		<span>Record reflects latest workspace sync</span>
	</footer>
</div>

{#if activeEditorRow && canRecordCompletion}
	<IctCompletionModal
		person={history.personnel}
		task={activeEditorRow.task}
		existingCompletion={activeEditorRow.completion}
		{settings}
		{currentUserDisplayName}
		onSave={handleCompletionSave}
		onClose={() => (activeEditorRow = null)}
	/>
{:else if showTaskInputModal && canRecordCompletion}
	<IctCompletionModal
		person={history.personnel}
		taskOptions={applicableTaskOptions}
		completions={personnelIctCompletionsStore.items}
		{settings}
		{currentUserDisplayName}
		onSave={handleCompletionSave}
		onClose={() => (showTaskInputModal = false)}
	/>
{/if}
