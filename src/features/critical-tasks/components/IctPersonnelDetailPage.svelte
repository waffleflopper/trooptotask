<script lang="ts">
	import { SvelteDate } from 'svelte/reactivity';
	import Badge from '$lib/components/ui/Badge.svelte';
	import {
		Toolbar,
		ToolbarActions,
		ToolbarFilterSelect,
		ToolbarGroup,
		ToolbarSearchItem,
		type ToolbarActionConfig
	} from '$lib/components/ui/toolbar';
	import { getOrgContext } from '$lib/stores/orgContext.svelte';
	import IctCompletionModal from '$features/critical-tasks/components/IctCompletionModal.svelte';
	import { ictTasksStore } from '$features/critical-tasks/stores/ictTasks.svelte';
	import { personnelIctCompletionsStore } from '$features/critical-tasks/stores/personnelIctCompletions.svelte';
	import {
		calculateIctExpirationDate,
		getIctStatus,
		normalizeCriticalTasksSettings
	} from '$features/critical-tasks/utils/ictStatus';
	import { getActiveIctTasksForLibrary, isIctTaskApplicableToMos } from '$features/critical-tasks/utils/ictTaskLibrary';
	import type {
		CriticalTasksPersonnelHistoryData,
		CriticalTasksPersonnelHistoryRow,
		IctTask,
		PersonnelIctCompletion
	} from '$features/critical-tasks/criticalTasks.types';
	import type { OrganizationMemberPermissions } from '$lib/types';
	import { parseDate } from '$lib/utils/dates';

	interface Props {
		data: {
			orgId: string;
			criticalTasksPersonnelHistory: CriticalTasksPersonnelHistoryData;
			criticalTasksSettings?: {
				defaultExpirationMonths: number;
				expiringSoonWarningDays: number;
			};
			permissions?: Partial<OrganizationMemberPermissions> | null;
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
	type IctStatusFilter = IctStatusValue | 'all';

	let { data }: Props = $props();

	const org = getOrgContext();
	const history = $derived(data.criticalTasksPersonnelHistory);
	const personnelDisplayName = $derived(`${history.personnel.lastName}, ${history.personnel.firstName}`);
	const personnelName = $derived([history.personnel.rank, personnelDisplayName].filter(Boolean).join(' '));
	const settings = $derived(normalizeCriticalTasksSettings(data.criticalTasksSettings));
	const permissions = $derived(data.permissions ?? org.permissions);
	const canEditCriticalTasks = $derived(!!permissions.canEditCriticalTasks && !org.readOnly);
	let activeEditorRow = $state<ActiveTaskRow | null>(null);
	let showTaskInputModal = $state(false);
	let taskSearch = $state('');
	let statusFilter = $state<IctStatusFilter>('all');
	let categoryFilter = $state('all');

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
					statusInfo: getIctStatus(completion?.completedAt ?? null, task, settings)
				};
			})
	);

	const archivedHistoryRows = $derived(history.rows.filter((row) => row.taskArchivedAt !== null || row.task === null));
	const currentUserDisplayName = $derived(getCurrentUserDisplayName());
	const applicableTaskOptions = $derived(activeRows.map((row) => row.task));
	const canInputTask = $derived(
		!!permissions.canViewCriticalTasks && canEditCriticalTasks && applicableTaskOptions.length > 0
	);
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

			if (row.completion && (!lastCompletion || compareCompletionRecency(row.completion, lastCompletion) > 0)) {
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

	function handlePrint(): void {
		window.print();
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

	function handleTaskInput(): void {
		if (!canInputTask) return;
		activeEditorRow = null;
		showTaskInputModal = true;
	}

	const toolbarActionItems = $derived.by<ToolbarActionConfig[]>(() => {
		const items: ToolbarActionConfig[] = [];

		items.push({
			id: 'print-record',
			label: 'Print Record',
			icon: 'printer',
			onclick: handlePrint,
			priority: 'normal',
			variant: 'default'
		});

		if (canEditCriticalTasks) {
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

<svelte:head>
	<title>{personnelName} Critical Tasks Record - Troop to Task</title>
</svelte:head>

<main class="record-page">
	<Toolbar ariaLabel="Personnel critical task controls" collapse="medium" leadingMin="34rem" searchCompactAt={1180}>
		{#snippet leading()}
			<ToolbarGroup label="Applicable task filters" activeCount={activeFilterCount} testId="ict-detail-filters">
				{#snippet full()}
					<ToolbarFilterSelect
						ariaLabel="Status"
						options={statusFilterOptions}
						value={statusFilter}
						defaultValue="all"
						width="wide"
						mode="full"
						onValueChange={(value) => (statusFilter = value as IctStatusFilter)}
					/>
					<ToolbarFilterSelect
						ariaLabel="Category"
						options={categoryFilterOptions}
						value={categoryFilter}
						defaultValue="all"
						width="wide"
						mode="full"
						onValueChange={(value) => (categoryFilter = value)}
					/>
					<ToolbarSearchItem
						ariaLabel="Filter by task ID or name"
						placeholder="Filter by task ID or name..."
						width="wide"
						bind:value={taskSearch}
					/>
				{/snippet}
				{#snippet panel()}
					<ToolbarFilterSelect
						ariaLabel="Status"
						options={statusFilterOptions}
						value={statusFilter}
						defaultValue="all"
						width="wide"
						mode="full"
						onValueChange={(value) => (statusFilter = value as IctStatusFilter)}
					/>
					<ToolbarFilterSelect
						ariaLabel="Category"
						options={categoryFilterOptions}
						value={categoryFilter}
						defaultValue="all"
						width="wide"
						mode="full"
						onValueChange={(value) => (categoryFilter = value)}
					/>
					<ToolbarSearchItem
						ariaLabel="Filter by task ID or name"
						placeholder="Filter by task ID or name..."
						width="wide"
						mode="full"
						bind:value={taskSearch}
					/>
				{/snippet}
			</ToolbarGroup>
		{/snippet}

		<ToolbarActions
			actions={toolbarActionItems}
			ariaLabel="Personnel critical task actions"
			overflowAriaLabel="More personnel critical task actions"
		/>
	</Toolbar>

	{#if recordContextItems.length > 0}
		<section class="record-context" aria-label="Personnel record context">
			{#each recordContextItems as item (item)}
				<span>{item}</span>
			{/each}
		</section>
	{/if}

	<section class="summary" aria-label="Individual critical tasks summary">
		<article class="summary-card readiness-card">
			<div class="summary-label"><span class="signal amber"></span>Individual Readiness</div>
			<div class="summary-value amber">{summary.readinessPercent}<span>%</span></div>
			<div class="readiness-bar" aria-hidden="true">
				<div class="readiness-bar-fill" style={`width: ${summary.readinessPercent}%`}></div>
			</div>
			<div class="status-breakdown">
				<span><span class="dot current"></span>{summary.current} current</span>
				<span><span class="dot expiring"></span>{summary.expiringSoon} soon</span>
				<span><span class="dot expired"></span>{summary.expired} expired</span>
				<span><span class="dot none"></span>{summary.notRecorded} none</span>
			</div>
		</article>
		<article class="summary-card">
			<div class="summary-label"><span class="signal amber"></span>Expiring ≤{settings.expiringSoonWarningDays}d</div>
			<div class="summary-value amber">{summary.expiringSoon}</div>
			<div class="summary-sub">{nextExpiringLabel(summary.nextExpiring)}</div>
		</article>
		<article class="summary-card">
			<div class="summary-label"><span class="signal red"></span>Expired / Overdue</div>
			<div class="summary-value red">{summary.expired}</div>
			<div class="summary-sub">{expiredSummaryLabel(summary.oldestExpired)}</div>
		</article>
		<article class="summary-card">
			<div class="summary-label">Last Validation</div>
			<div class="summary-value compact">{formatRecordDate(summary.lastCompletion?.completedAt)}</div>
			<div class="summary-sub">
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

	<section class="record-section" aria-labelledby="ict-detail-title">
		<div class="section-head">
			<div>
				<h2 id="ict-detail-title">Applicable Critical Tasks</h2>
				<p>Current ICTL record for this soldier in one place.</p>
			</div>
			<span class="section-meta">{summary.total} tasks assigned</span>
		</div>

		<div class="table-frame">
			<table class="task-table" aria-label="Applicable Critical Tasks">
				<thead>
					<tr>
						<th>Task</th>
						<th>Status</th>
						<th>Completed</th>
						<th>Expires</th>
						<th>Method</th>
						<th>Validator</th>
						<th>Notes</th>
						{#if canEditCriticalTasks}
							<th class="action-col">Action</th>
						{/if}
					</tr>
				</thead>
				<tbody>
					{#if filteredActiveRows.length === 0}
						<tr>
							<td class="empty" colspan={canEditCriticalTasks ? 8 : 7}>No active critical tasks match this view.</td>
						</tr>
					{:else}
						{#each filteredActiveRows as row (row.task.id)}
							<tr>
								<td>
									<span class="task-id">{row.task.taskCode}</span>
									<span class="task-name">{row.task.title}</span>
								</td>
								<td>
									<span class="status-pill {statusTone(row.statusInfo.status)}">
										{statusLabels[row.statusInfo.status]}
									</span>
								</td>
								<td>
									<span class:unrecorded={!row.completion} class="date-cell">
										{formatRecordDate(row.completion?.completedAt)}
									</span>
								</td>
								<td>
									<span class:unrecorded={!row.statusInfo.expirationDate} class="date-cell">
										{formatRecordDate(row.statusInfo.expirationDate)}
										{#if expirationSubLabel(row)}
											<span class="sub" data-status={statusTone(row.statusInfo.status)}>
												{expirationSubLabel(row)}
											</span>
										{/if}
									</span>
								</td>
								<td>
									<span class:unrecorded={!row.completion?.validationMethod} class="method-cell">
										{row.completion?.validationMethod ?? '—'}
									</span>
								</td>
								<td>
									<span class:unrecorded={!row.completion?.validatedBy} class="validator-cell">
										{row.completion?.validatedBy ?? '—'}
									</span>
								</td>
								<td>
									<div class:empty-note={!row.completion?.notes} class="notes-cell">
										{row.completion?.notes ?? 'No notes'}
									</div>
								</td>
								{#if canEditCriticalTasks}
									<td class="action-cell">
										<button
											type="button"
											class:btn-primary={!row.completion}
											class="btn btn-sm"
											aria-label={`${row.completion ? 'Edit' : 'Log'} completion for ${row.task.taskCode}`}
											onclick={() => (activeEditorRow = row)}
										>
											{row.completion ? 'Edit' : 'Log Completion'}
										</button>
									</td>
								{/if}
							</tr>
						{/each}
					{/if}
				</tbody>
			</table>
		</div>
	</section>

	<section class="record-section historical" aria-labelledby="ict-history-title">
		<div class="section-head">
			<div>
				<h2 id="ict-history-title">Historical Completions</h2>
				<p>Archived task records retained for audit context. Read-only.</p>
			</div>
			<span class="section-meta">Audit archive · {archivedHistoryRows.length} records</span>
		</div>

		<div class="table-frame">
			<table class="task-table" aria-label="ICT completion history">
				<thead>
					<tr>
						<th>Task</th>
						<th>Completed</th>
						<th>Expired</th>
						<th>Method</th>
						<th>Validator</th>
						<th>Notes</th>
					</tr>
				</thead>
				<tbody>
					{#if archivedHistoryRows.length === 0}
						<tr>
							<td class="empty" colspan="6">No ICT completion history recorded for this person.</td>
						</tr>
					{:else}
						{#each archivedHistoryRows as row (row.completion.id)}
							<tr>
								<td>
									<span class="task-id">{row.taskCode}</span>
									<span class="task-name">{row.taskTitle}</span>
									{#if row.taskArchivedAt}
										<Badge label="Archived" variant="outlined" />
									{/if}
								</td>
								<td><span class="date-cell">{formatRecordDate(row.completion.completedAt)}</span></td>
								<td>
									<span class:unrecorded={!historyExpirationDate(row)} class="date-cell">
										{formatRecordDate(historyExpirationDate(row))}
									</span>
								</td>
								<td><span class="method-cell">{row.completion.validationMethod}</span></td>
								<td>
									<span class:unrecorded={!row.completion.validatedBy} class="validator-cell">
										{row.completion.validatedBy ?? '—'}
									</span>
								</td>
								<td>
									<div class:empty-note={!row.completion.notes} class="notes-cell">
										{row.completion.notes ?? 'No notes'}
									</div>
								</td>
							</tr>
						{/each}
					{/if}
				</tbody>
			</table>
		</div>
	</section>

	<footer class="record-foot">
		<span>All dates in local time · Edits audited</span>
		<span>Record reflects latest workspace sync</span>
	</footer>
</main>

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
	.record-page {
		--record-rule: color-mix(in srgb, var(--text-primary) 12%, transparent);
		--record-rule-strong: color-mix(in srgb, var(--text-primary) 22%, transparent);
		--record-paper-2: color-mix(in srgb, var(--surface-subtle) 76%, var(--surface-panel) 24%);
		--record-paper-3: color-mix(in srgb, var(--border-default) 58%, var(--surface-panel) 42%);
		--record-green-fill: color-mix(in srgb, var(--success-bg) 84%, var(--surface-panel) 16%);
		--record-amber-fill: color-mix(in srgb, var(--amber-light) 84%, var(--surface-panel) 16%);
		--record-red-fill: color-mix(in srgb, var(--danger-bg) 84%, var(--surface-panel) 16%);

		display: flex;
		flex-direction: column;
		gap: var(--sp-5);
		max-width: 1480px;
		margin: 0 auto;
		padding: var(--sp-5);
		color: var(--text-primary);
	}

	.summary-label,
	.section-meta,
	.record-foot {
		font-family: var(--font-mono);
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}

	.record-context {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--sp-2);
		color: var(--text-secondary);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}

	.record-context span + span::before {
		color: var(--text-tertiary);
		content: '·';
		margin-right: var(--sp-2);
	}

	.summary {
		display: grid;
		grid-template-columns: minmax(20rem, 2fr) repeat(3, minmax(12rem, 1fr));
		gap: var(--sp-3);
	}

	.summary-card {
		padding: var(--sp-4);
		border: 1px solid var(--record-rule);
		border-radius: var(--radius-sm);
		background: var(--surface-panel);
	}

	.summary-label {
		display: flex;
		gap: var(--sp-2);
		align-items: center;
		margin-bottom: 10px;
		color: var(--text-secondary);
		font-size: 0.625rem;
	}

	.signal,
	.dot {
		display: inline-block;
		flex: none;
		border-radius: 1px;
	}

	.signal {
		width: 0.5rem;
		height: 0.5rem;
	}

	.signal.amber,
	.dot.expiring {
		background: var(--amber);
	}

	.signal.red,
	.dot.expired {
		background: var(--danger);
	}

	.dot.current {
		background: var(--success);
	}

	.dot.none {
		background: var(--text-tertiary);
	}

	.summary-value {
		color: var(--text-primary);
		font-family: var(--font-display);
		font-size: 2.125rem;
		font-weight: var(--font-weight-display);
		letter-spacing: 0.01em;
		line-height: 1;
	}

	.summary-value span {
		font-size: 1.375rem;
	}

	.summary-value.amber {
		color: var(--amber);
	}

	.summary-value.red {
		color: var(--danger);
	}

	.summary-value.compact {
		padding-top: 6px;
		font-size: 1.5rem;
	}

	.summary-sub {
		margin-top: var(--sp-2);
		color: var(--text-secondary);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		line-height: 1.4;
	}

	.readiness-bar {
		height: 4px;
		margin-top: var(--sp-3);
		overflow: hidden;
		border-radius: 0;
		background: var(--record-paper-3);
	}

	.readiness-bar-fill {
		height: 100%;
		background: var(--amber);
	}

	.status-breakdown {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-3);
		margin-top: 10px;
		color: var(--text-secondary);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		letter-spacing: 0.04em;
	}

	.status-breakdown span {
		display: inline-flex;
		gap: 5px;
		align-items: center;
	}

	.dot {
		width: 0.5rem;
		height: 0.5rem;
	}

	.record-section {
		padding: var(--sp-5);
		border: 1px solid var(--record-rule);
		border-radius: var(--radius-sm);
		background: var(--surface-panel);
	}

	.record-section.historical {
		background: var(--record-paper-2);
	}

	.section-head {
		display: flex;
		gap: var(--sp-4);
		align-items: baseline;
		justify-content: space-between;
		margin-bottom: var(--sp-4);
	}

	.section-head h2,
	.section-head p {
		margin: 0;
	}

	.section-head h2 {
		font-family: var(--font-display);
		font-size: 1.375rem;
		font-weight: var(--font-weight-display);
		letter-spacing: 0.04em;
		line-height: 1;
		text-transform: uppercase;
	}

	.section-head p {
		margin-top: 6px;
		color: var(--text-secondary);
		font-style: italic;
	}

	.section-meta {
		flex: none;
		color: var(--text-secondary);
		font-size: 0.625rem;
	}

	.table-frame {
		overflow-x: auto;
		border: 1px solid var(--record-rule);
		border-radius: var(--radius-sm);
		background: var(--surface-panel);
	}

	.task-table {
		width: 100%;
		min-width: 58rem;
		border-collapse: collapse;
	}

	.task-table th {
		padding: 10px 12px;
		border-top: 1px solid var(--record-rule-strong);
		border-bottom: 1px solid var(--record-rule-strong);
		background: var(--record-paper-2);
		color: var(--text-secondary);
		font-family: var(--font-mono);
		font-size: 0.625rem;
		font-weight: var(--font-weight-regular);
		letter-spacing: 0.1em;
		text-align: left;
		text-transform: uppercase;
	}

	.historical .task-table th {
		background: var(--record-paper-3);
	}

	.task-table td {
		padding: 14px 12px;
		border-bottom: 1px solid var(--record-rule);
		color: var(--text-primary);
		font-size: var(--text-sm);
		vertical-align: middle;
	}

	.task-table tr:last-child td {
		border-bottom: 0;
	}

	.task-table tbody tr:hover td:not(.action-cell) {
		background: var(--record-paper-2);
	}

	.historical .task-table td {
		color: var(--text-secondary);
	}

	.action-col,
	.action-cell {
		text-align: right;
	}

	.task-id {
		display: block;
		margin-bottom: 3px;
		color: var(--text-secondary);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		letter-spacing: 0.02em;
	}

	.task-name {
		display: block;
		color: var(--text-primary);
		font-weight: var(--font-weight-semibold);
		line-height: 1.3;
	}

	.historical .task-name {
		color: var(--text-secondary);
		font-weight: var(--font-weight-regular);
	}

	.status-pill {
		display: inline-flex;
		gap: 6px;
		align-items: center;
		padding: 4px 10px;
		border-radius: var(--radius-sm);
		font-family: var(--font-mono);
		font-size: 0.625rem;
		font-weight: var(--font-weight-medium);
		letter-spacing: 0.08em;
		text-transform: uppercase;
		white-space: nowrap;
	}

	.status-pill::before {
		display: inline-block;
		width: 6px;
		height: 6px;
		border-radius: 999px;
		content: '';
	}

	.status-pill.current {
		background: var(--record-green-fill);
		color: var(--success);
	}

	.status-pill.current::before {
		background: var(--success);
	}

	.status-pill.expiring {
		background: var(--record-amber-fill);
		color: var(--amber-dark);
	}

	.status-pill.expiring::before {
		background: var(--amber);
	}

	.status-pill.expired {
		background: var(--record-red-fill);
		color: var(--danger);
	}

	.status-pill.expired::before {
		background: var(--danger);
	}

	.status-pill.none {
		border: 1px solid var(--record-rule-strong);
		background: transparent;
		color: var(--text-secondary);
	}

	.status-pill.none::before {
		background: var(--text-tertiary);
	}

	.date-cell,
	.validator-cell {
		color: var(--text-primary);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		letter-spacing: 0.02em;
	}

	.method-cell,
	.notes-cell {
		color: var(--text-secondary);
		font-size: var(--text-xs);
		line-height: 1.4;
	}

	.notes-cell {
		max-width: 18rem;
		font-family: var(--font-body);
	}

	.sub {
		display: block;
		margin-top: 2px;
		color: var(--text-secondary);
		font-size: 0.625rem;
		letter-spacing: 0.04em;
	}

	.sub[data-status='expiring'] {
		color: var(--amber-dark);
	}

	.sub[data-status='expired'] {
		color: var(--danger);
	}

	.unrecorded,
	.empty-note {
		color: var(--text-tertiary);
		font-family: var(--font-body);
		font-style: italic;
	}

	.empty {
		padding: var(--sp-6) var(--sp-4);
		color: var(--text-secondary);
		font-style: italic;
		text-align: center;
	}

	.record-foot {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-3);
		justify-content: space-between;
		padding: var(--sp-4) 0;
		border-top: 1px solid var(--record-rule);
		color: var(--text-tertiary);
		font-size: 0.625rem;
	}

	@media (max-width: 820px) {
		.record-page {
			padding: var(--sp-4);
		}

		.section-head {
			align-items: stretch;
			flex-direction: column;
		}

		.summary {
			grid-template-columns: 1fr;
		}
	}

	@media (min-width: 821px) and (max-width: 1180px) {
		.summary {
			grid-template-columns: 1fr 1fr;
		}
	}
</style>
