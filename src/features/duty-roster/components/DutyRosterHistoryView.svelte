<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import {
		Calendar,
		Database,
		Download,
		Eye,
		List,
		Printer,
		RefreshCw,
		Save,
		ShieldCheck,
		Trash2,
		Wrench,
		X
	} from '@lucide/svelte';
	import { Badge } from '$lib/components/ui/badge';
	import * as AppDialog from '$lib/components/ui/app-dialog';
	import { Button } from '$lib/components/ui/button';
	import * as Combobox from '$lib/components/ui/combobox';
	import * as Field from '$lib/components/ui/field';
	import { Input } from '$lib/components/ui/input';
	import * as Select from '$lib/components/ui/select';
	import * as Tabs from '$lib/components/ui/tabs';
	import {
		DA6Matrix,
		DutyRosterStatusBadge,
		WarningSummary,
		buildDa6MatrixDisplay,
		type DA6MatrixMetadataItem,
		type Da6MatrixDisplay,
		type DutyRosterStatus
	} from '$features/duty-roster/components/shared';
	import { printDutyRosterForBrowser } from '$features/duty-roster/export/dutyRosterBrowserExport';
	import { exportDutyRosterForBrowser } from '$features/duty-roster/export/dutyRosterWorkbookExport';
	import type {
		DutyRosterTemplate,
		DutyRosterTemplateAcceptedRun
	} from '$features/duty-roster/templates/dutyRosterTemplates';
	import {
		type DutyRosterWorkspaceActionForm,
		type DutyRosterWorkspaceReadModel
	} from '$features/duty-roster/workspace/dutyRosterWorkspaceReadModel';
	import {
		buildDutyRosterAcceptedRunReviewModel,
		correctionKey
	} from '$features/duty-roster/workspace/dutyRosterPreviewReview';

	let {
		basePath,
		selectedTemplate,
		actionForm,
		acceptedRuns,
		historyPage,
		historyDetailRun,
		latestHistoryRunId,
		todayDate,
		historyMode,
		applyAcceptedRunAction,
		invalidateAcceptedRunAction,
		correctAcceptedRunAction
	}: {
		basePath: string;
		selectedTemplate: DutyRosterTemplate;
		actionForm: DutyRosterWorkspaceActionForm | null;
		acceptedRuns: DutyRosterTemplateAcceptedRun[];
		historyPage: DutyRosterWorkspaceReadModel['historyPage'];
		historyDetailRun: DutyRosterTemplateAcceptedRun | null;
		latestHistoryRunId: string | null;
		todayDate: string;
		historyMode: DutyRosterWorkspaceReadModel['historyMode'];
		applyAcceptedRunAction: string;
		invalidateAcceptedRunAction: string;
		correctAcceptedRunAction: string;
	} = $props();

	let confirmingInvalidationRunId = $state<string | null>(null);
	let confirmingCalendarSyncRunId = $state<string | null>(null);
	let selectedCorrectionAssignees = $state<Record<string, string>>({});
	let historySearch = $state('');
	let historyStateFilter = $state<'all' | 'accepted' | 'invalidated' | 'applied' | 'not-applied'>('all');
	let selectedCorrectionKey = $state<string | null>(null);
	let pendingHistoryAction = $state<'apply' | 'invalidate' | 'correction' | null>(null);

	const historyStateOptions: Array<{ value: typeof historyStateFilter; label: string }> = [
		{ value: 'all', label: 'All' },
		{ value: 'accepted', label: 'Accepted' },
		{ value: 'invalidated', label: 'Invalidated' },
		{ value: 'applied', label: 'Applied' },
		{ value: 'not-applied', label: 'Not applied runs' }
	];

	function historyDetailHref(run: DutyRosterTemplateAcceptedRun, mode: 'roster' | 'da6'): string {
		const detailPath = `${basePath}/${selectedTemplate.slug}/history/${run.id}`;
		return mode === 'da6' ? `${detailPath}?mode=da6` : detailPath;
	}

	function historyListHref(): string {
		return `${basePath}/${selectedTemplate.slug}/history`;
	}

	function historyPageHref(page: number): string {
		const listHref = historyListHref();
		return page <= 1 ? listHref : `${listHref}?page=${page}`;
	}

	function selectedCorrectionAssigneeId(runId: string, date: string): string {
		return selectedCorrectionAssignees[correctionKey(runId, date)] ?? '';
	}

	function selectedCorrectionOverrideWarning(): string | null {
		if (!selectedCorrectionRow) return null;
		const assigneeId = selectedCorrectionAssigneeId(selectedCorrectionRow.run.id, selectedCorrectionRow.date);
		return selectedCorrectionRow.correctionOverrideWarnings[assigneeId] ?? null;
	}

	const selectedCorrectionWarning = $derived(selectedCorrectionOverrideWarning());
	const isArchivedTemplate = $derived(selectedTemplate.status === 'archived');

	function handleHistoryActionEnhance(action: 'apply' | 'invalidate' | 'correction') {
		pendingHistoryAction = action;

		return async ({ update }: { update: () => Promise<void> }) => {
			await update();
			if (action === 'apply') {
				confirmingCalendarSyncRunId = null;
			}
			pendingHistoryAction = null;
		};
	}

	function openCorrection(runId: string, date: string): void {
		selectedCorrectionKey = correctionKey(runId, date);
	}

	function closeCorrection(): void {
		selectedCorrectionKey = null;
	}

	function printAcceptedRun(run: DutyRosterTemplateAcceptedRun): void {
		printDutyRosterForBrowser({
			acceptedSnapshot: buildDutyRosterAcceptedRunReviewModel({
				run,
				todayDate
			}).snapshot,
			statusLabel: 'Official'
		});
	}

	async function exportAcceptedRun(run: DutyRosterTemplateAcceptedRun): Promise<void> {
		await exportDutyRosterForBrowser({
			acceptedSnapshot: buildDutyRosterAcceptedRunReviewModel({
				run,
				todayDate
			}).snapshot,
			statusLabel: 'Official'
		});
	}

	function formatDutyDate(value: string): string {
		const [year, month, day] = value.split('-').map(Number);
		if (!year || !month || !day) return value;
		return new Intl.DateTimeFormat('en-US', {
			weekday: 'short',
			day: '2-digit',
			month: 'short',
			timeZone: 'UTC'
		})
			.format(new Date(Date.UTC(year, month - 1, day)))
			.toUpperCase();
	}

	function formatDate(value: string | null | undefined): string {
		if (!value) return '-';
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return value;
		return new Intl.DateTimeFormat('en-US', {
			day: '2-digit',
			month: 'short',
			year: 'numeric',
			timeZone: 'UTC'
		})
			.format(date)
			.toUpperCase();
	}

	function formatDateTime(value: string | null | undefined): string {
		if (!value) return '-';
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return value;
		const dateText = new Intl.DateTimeFormat('en-US', {
			day: '2-digit',
			month: 'short',
			year: 'numeric',
			timeZone: 'UTC'
		})
			.format(date)
			.toUpperCase();
		const timeText = new Intl.DateTimeFormat('en-US', {
			hour: '2-digit',
			minute: '2-digit',
			hour12: false
		}).format(date);
		return `${dateText} ${timeText}`;
	}

	function soldierName(display: { rank: string; lastName: string; firstName: string } | null | undefined): string {
		return display ? `${display.rank} ${display.lastName}, ${display.firstName}` : 'Unfilled';
	}

	function soldierGroup(display: { groupName?: string | null } | null | undefined): string {
		return display?.groupName ?? '';
	}

	function runStatusLabel(run: DutyRosterTemplateAcceptedRun): string {
		if (run.status === 'invalidated') return 'Invalidated';
		return 'Official';
	}

	function runStatusBadge(run: DutyRosterTemplateAcceptedRun): DutyRosterStatus {
		if (run.status === 'invalidated') return 'invalidated';
		if (
			run.calendarSyncState?.status === 'calendar-manually-changed' ||
			run.calendarSyncState?.status === 'needs-review'
		) {
			return 'review';
		}
		if (run.appliedAt && run.calendarSyncState?.status === 'duty-roster-newer') return 'needs-sync';
		if (run.appliedAt && run.calendarAssignmentsEdited) return 'needs-sync';
		if (run.appliedAt) return 'applied';
		return 'official';
	}

	function acceptedByLabel(run: DutyRosterTemplateAcceptedRun): string {
		return run.acceptedByDisplayName ?? 'Unknown';
	}

	function calendarStateLabel(run: DutyRosterTemplateAcceptedRun): string {
		if (run.calendarSyncState) return run.calendarSyncState.label;
		if (!run.appliedAt) return 'Not applied';
		return run.calendarAssignmentsEdited ? 'Needs sync' : 'Applied';
	}

	function calendarSyncTone(run: DutyRosterTemplateAcceptedRun): 'warning' | 'destructive' {
		if (
			run.calendarSyncState?.status === 'calendar-manually-changed' ||
			run.calendarSyncState?.status === 'needs-review'
		) {
			return 'destructive';
		}
		return 'warning';
	}

	function runMatchesHistoryFilter(run: DutyRosterTemplateAcceptedRun): boolean {
		const query = historySearch.trim().toLowerCase();
		const haystack = [
			run.templateName,
			run.startDate,
			run.endDate,
			run.acceptedAt,
			acceptedByLabel(run),
			runStatusLabel(run)
		]
			.join(' ')
			.toLowerCase();

		if (query && !haystack.includes(query)) return false;
		if (historyStateFilter === 'all') return true;
		if (historyStateFilter === 'accepted') return run.status === 'accepted';
		if (historyStateFilter === 'invalidated') return run.status === 'invalidated';
		if (historyStateFilter === 'applied') return run.status === 'accepted' && Boolean(run.appliedAt);
		return run.status === 'accepted' && !run.appliedAt;
	}

	function resetHistoryFilters(): void {
		historySearch = '';
		historyStateFilter = 'all';
	}

	const historyStateFilterLabel = $derived(
		historyStateOptions.find((option) => option.value === historyStateFilter)?.label ?? 'All'
	);
	const filteredAcceptedRuns = $derived(acceptedRuns.filter(runMatchesHistoryFilter));
	const latestRun = $derived(
		historyPage ? (acceptedRuns.find((run) => run.id === latestHistoryRunId) ?? null) : (acceptedRuns[0] ?? null)
	);
	const acceptedRunCount = $derived(acceptedRuns.filter((run) => run.status === 'accepted').length);
	const pendingCorrectionCount = $derived(acceptedRuns.reduce((total, run) => total + run.corrections.length, 0));
	const canInvalidateAnyRun = $derived(
		!isArchivedTemplate && acceptedRuns.some((run) => run.status === 'accepted' && run.endDate >= todayDate)
	);
	const detailReview = $derived(
		historyDetailRun
			? buildDutyRosterAcceptedRunReviewModel({
					run: historyDetailRun,
					todayDate
				})
			: null
	);
	const detailFollowOnRuns = $derived(historyDetailRun ? followOnAcceptedRuns(historyDetailRun) : []);
	const selectedCorrectionRow = $derived(
		detailReview?.rows.find((row) => correctionKey(row.run.id, row.date) === selectedCorrectionKey) ?? null
	);
	const acceptedMatrixDisplay = $derived<Da6MatrixDisplay | null>(
		detailReview ? buildDa6MatrixDisplay(detailReview.snapshot.da6, 'official') : null
	);
	const acceptedMatrixColumns = $derived(acceptedMatrixDisplay?.columns ?? []);
	const acceptedMatrixRows = $derived(acceptedMatrixDisplay?.rows ?? []);
	const acceptedMatrixCells = $derived(acceptedMatrixDisplay?.cells ?? {});
	const acceptedMatrixFooterRows = $derived(acceptedMatrixDisplay?.footerRows ?? []);
	const acceptedMatrixMetadata = $derived<DA6MatrixMetadataItem[]>(
		historyDetailRun
			? [
					{ label: 'Run', value: historyDetailRun.templateName },
					{
						label: 'Date Range',
						value: `${formatDate(historyDetailRun.startDate)} to ${formatDate(historyDetailRun.endDate)}`
					},
					{ label: 'Accepted', value: formatDateTime(historyDetailRun.acceptedAt) },
					{ label: 'Accepted By', value: acceptedByLabel(historyDetailRun) },
					{ label: 'State', value: runStatusLabel(historyDetailRun) },
					{ label: 'Calendar', value: calendarStateLabel(historyDetailRun) }
				]
			: []
	);

	function followOnAcceptedRuns(run: DutyRosterTemplateAcceptedRun): DutyRosterTemplateAcceptedRun[] {
		return acceptedRuns
			.filter((candidate) => candidate.status === 'accepted' && candidate.id !== run.id && runIsAfter(candidate, run))
			.sort(compareRunTimeline);
	}

	function runIsAfter(candidate: DutyRosterTemplateAcceptedRun, selected: DutyRosterTemplateAcceptedRun): boolean {
		if (candidate.startDate !== selected.startDate) {
			return candidate.startDate > selected.startDate;
		}
		if (candidate.endDate !== selected.endDate) {
			return candidate.endDate > selected.endDate;
		}
		return candidate.acceptedAt > selected.acceptedAt;
	}

	function compareRunTimeline(left: DutyRosterTemplateAcceptedRun, right: DutyRosterTemplateAcceptedRun): number {
		return (
			left.startDate.localeCompare(right.startDate) ||
			left.endDate.localeCompare(right.endDate) ||
			left.acceptedAt.localeCompare(right.acceptedAt)
		);
	}
</script>

<h2 id="template-view-heading" class="sr-only">Accepted runs</h2>
{#if actionForm?.applyError}
	<WarningSummary tone="destructive" title="Calendar apply failed" description={actionForm.applyError} />
{/if}
{#if actionForm?.invalidateError}
	<WarningSummary tone="destructive" title="Run invalidation failed" description={actionForm.invalidateError} />
{/if}
{#if actionForm?.correctionError}
	<WarningSummary tone="destructive" title="Correction failed" description={actionForm.correctionError} />
{/if}
{#if acceptedRuns.length === 0}
	<div class="grid place-items-center gap-2 px-5 py-12 text-center text-sm text-muted-foreground">
		<p class="font-medium text-foreground">History is empty</p>
		<p>History is empty until a DA6 run is accepted.</p>
	</div>
{:else if historyDetailRun}
	{#if detailReview}
		<section
			class="grid gap-0 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,20rem)]"
			aria-label="Accepted Duty Roster record"
		>
			<div class="grid min-w-0 content-start gap-4">
				<header class="flex flex-wrap items-center gap-3 rounded-md border border-border bg-muted/30 px-4 py-3">
					<Button variant="outline" size="sm" href={historyListHref()}>Back to history</Button>
					<div class="flex flex-wrap items-center gap-2 text-xs text-muted-foreground" aria-label="Run status">
						<DutyRosterStatusBadge status={runStatusBadge(historyDetailRun)} />
						{#if historyDetailRun.appliedAt && !detailReview.isInvalidated}
							<span class="inline-flex items-center gap-1"><Calendar size={14} aria-hidden="true" /> Applied</span>
						{/if}
						<span class="inline-flex items-center gap-1" title={`Accepted by ${acceptedByLabel(historyDetailRun)}`}>
							<ShieldCheck size={14} aria-hidden="true" />
							<span>{acceptedByLabel(historyDetailRun)}</span>
						</span>
						<span class="inline-flex items-center gap-1">
							<Calendar size={14} aria-hidden="true" />
							{formatDate(historyDetailRun.startDate)} to {formatDate(historyDetailRun.endDate)}
						</span>
					</div>
					<div class="ml-auto flex items-center gap-2">
						<Tabs.Root value={historyMode}>
							<Tabs.List aria-label="History detail review mode">
								<Tabs.Trigger
									value="list"
									onclick={() =>
										void goto(
											resolve(
												historyDetailHref(
													historyDetailRun,
													'roster'
												) as `/org/${string}/duty-rosters/${string}/history/${string}`
											)
										)}
								>
									<span class="inline-flex items-center gap-1">
										<List size={14} aria-hidden="true" />
										List
									</span>
								</Tabs.Trigger>
								<Tabs.Trigger
									value="matrix"
									onclick={() =>
										void goto(
											resolve(
												historyDetailHref(
													historyDetailRun,
													'da6'
												) as `/org/${string}/duty-rosters/${string}/history/${string}?${string}`
											)
										)}
								>
									<span class="inline-flex items-center gap-1">
										<Database size={14} aria-hidden="true" />
										DA6
									</span>
								</Tabs.Trigger>
							</Tabs.List>
						</Tabs.Root>
						<Button variant="outline" size="sm" type="button" onclick={() => printAcceptedRun(historyDetailRun)}>
							<Printer size={14} aria-hidden="true" />
							Print
						</Button>
						<Button variant="outline" size="sm" type="button" onclick={() => void exportAcceptedRun(historyDetailRun)}>
							<Download size={14} aria-hidden="true" />
							Export
						</Button>
					</div>
				</header>

				{#if historyDetailRun.calendarSyncState && historyDetailRun.calendarSyncState.status !== 'in-sync' && historyDetailRun.calendarSyncState.status !== 'not-applied' && !detailReview.isInvalidated}
					<WarningSummary
						tone={calendarSyncTone(historyDetailRun)}
						title={historyDetailRun.calendarSyncState.label}
						description={historyDetailRun.calendarSyncState.summary}
					/>
				{/if}

				{#if historyMode === 'list'}
					<div class="min-w-0 overflow-x-auto">
						<table class="w-full text-sm" aria-label="Accepted Duty Roster list">
							<thead>
								<tr class="border-b border-border bg-muted/50">
									<th class="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Date</th>
									<th class="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Accepted Soldier</th>
									<th class="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Actual Served</th>
									<th class="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Correction</th>
									<th class="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Reason</th>
									<th class="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Calendar</th>
									<th class="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Audit</th>
								</tr>
							</thead>
							<tbody>
								{#each detailReview.rows as tableRow (tableRow.id)}
									{@const rowKey = correctionKey(tableRow.run.id, tableRow.date)}
									{@const actualDisplay = tableRow.correction?.replacementDisplay ?? tableRow.finalRow.finalDisplay}
									<tr
										class={[
											'border-b border-border transition-colors',
											selectedCorrectionKey === rowKey && 'bg-muted/50'
										]}
									>
										<td class="whitespace-nowrap px-3 py-2 text-xs font-medium">{formatDutyDate(tableRow.date)}</td>
										<td class="px-3 py-2">
											<span class="text-sm font-medium text-foreground"
												>{soldierName(tableRow.finalRow.finalDisplay)}</span
											>
											<span class="block text-xs text-muted-foreground"
												>{soldierGroup(tableRow.finalRow.finalDisplay)}</span
											>
										</td>
										<td class="px-3 py-2">
											<span class="text-sm font-medium text-foreground">{soldierName(actualDisplay)}</span>
											<span class="block text-xs text-muted-foreground">{soldierGroup(actualDisplay)}</span>
											{#if tableRow.correctionSummary}
												<span class="block text-xs text-muted-foreground"
													>Actual: {tableRow.correctionSummary.replacementName}</span
												>
											{/if}
										</td>
										<td class="px-3 py-2">
											{#if tableRow.correction}
												<Badge variant="warning">Corrected</Badge>
											{:else}
												<span class="text-muted-foreground">-</span>
											{/if}
										</td>
										<td class="max-w-[12rem] px-3 py-2 text-xs text-muted-foreground">
											{tableRow.correctionSummary?.reason ?? tableRow.reasonText ?? '-'}
										</td>
										<td class="px-3 py-2">
											<span class="block text-xs font-medium"
												>{historyDetailRun.appliedAt ? 'Calendar' : 'History'}</span
											>
											<span class="block text-xs text-muted-foreground">{tableRow.calendarStepLabel}</span>
										</td>
										<td class="px-3 py-2">
											{#if !isArchivedTemplate && tableRow.canCorrect}
												<Button
													variant="outline"
													size="sm"
													type="button"
													onclick={() => openCorrection(tableRow.run.id, tableRow.date)}
												>
													<Eye size={14} aria-hidden="true" />
													Change Assignment
												</Button>
											{:else if tableRow.correctionLockedText}
												<span class="text-xs text-muted-foreground">{tableRow.correctionLockedText}</span>
											{:else}
												<span class="text-muted-foreground">-</span>
											{/if}
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
					<p class="px-3 text-xs text-muted-foreground">
						Showing 1-{detailReview.rows.length} of {detailReview.rows.length} entries
					</p>
				{:else}
					<DA6Matrix
						title="Accepted DA6 matrix"
						description="Immutable DA Form 6 matrix from accepted history."
						mode="official"
						rows={acceptedMatrixRows}
						columns={acceptedMatrixColumns}
						cells={acceptedMatrixCells}
						footerRows={acceptedMatrixFooterRows}
						metadata={acceptedMatrixMetadata}
					/>
				{/if}
			</div>

			<aside
				class="grid content-start gap-4 border-l border-border bg-muted/20 p-4"
				aria-label="Run correction controls"
			>
				{#if selectedCorrectionRow && !isArchivedTemplate}
					<div class="flex items-start justify-between gap-3">
						<div>
							<p class="text-xs font-medium text-muted-foreground">Record Correction</p>
							<h3 class="text-sm font-semibold text-foreground">{formatDate(selectedCorrectionRow.date)}</h3>
						</div>
						<Button
							variant="ghost"
							size="icon-sm"
							type="button"
							aria-label="Close correction panel"
							onclick={closeCorrection}
						>
							<X size={18} aria-hidden="true" />
						</Button>
					</div>
					<form
						class="grid gap-3"
						method="post"
						action={correctAcceptedRunAction}
						use:enhance={() => handleHistoryActionEnhance('correction')}
					>
						<input type="hidden" name="runId" value={selectedCorrectionRow.run.id} />
						<input type="hidden" name="runRowDate" value={selectedCorrectionRow.date} />
						<input
							type="hidden"
							name="replacementAssigneeId"
							value={selectedCorrectionAssigneeId(selectedCorrectionRow.run.id, selectedCorrectionRow.date)}
						/>
						<div class="grid gap-1">
							<span class="text-xs text-muted-foreground">Originally Assigned</span>
							<div class="rounded-md border border-border bg-muted/30 px-3 py-2">
								<span class="text-sm font-medium text-foreground"
									>{soldierName(selectedCorrectionRow.finalRow.finalDisplay)}</span
								>
								<span class="block text-xs text-muted-foreground"
									>{soldierGroup(selectedCorrectionRow.finalRow.finalDisplay)}</span
								>
							</div>
						</div>
						{#if selectedCorrectionRow.correctionSummary}
							<p class="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
								Actual: {selectedCorrectionRow.correctionSummary.replacementName}
								performed duty for {selectedCorrectionRow.correctionSummary.originalName}.
								{selectedCorrectionRow.correctionSummary.countText}
							</p>
							{#if selectedCorrectionRow.correctionSummary.overrideText}
								<p
									class="rounded-md border border-warning/50 bg-warning-muted px-3 py-2 text-xs text-warning-foreground"
								>
									{selectedCorrectionRow.correctionSummary.overrideText}
								</p>
							{/if}
						{/if}
						<Field.Root>
							<Field.Label>Soldier who actually served</Field.Label>
							<Combobox.Root
								items={selectedCorrectionRow.correctionOptions}
								value={selectedCorrectionAssigneeId(selectedCorrectionRow.run.id, selectedCorrectionRow.date)}
								label={`Actual Soldier for ${selectedCorrectionRow.date}`}
								onValueChange={(value) => {
									selectedCorrectionAssignees = {
										...selectedCorrectionAssignees,
										[correctionKey(selectedCorrectionRow.run.id, selectedCorrectionRow.date)]: Array.isArray(value)
											? (value[0] ?? '')
											: value
									};
								}}
								autoHighlight
							>
								<Combobox.Trigger
									aria-label={`Actual Soldier for ${selectedCorrectionRow.date}`}
									placeholder="Search Soldier"
								/>
								<Combobox.Content>
									<Combobox.Search placeholder="Search Soldier" />
									<Combobox.Empty>No Soldiers found.</Combobox.Empty>
									<Combobox.List />
								</Combobox.Content>
							</Combobox.Root>
						</Field.Root>
						{#if selectedCorrectionWarning}
							<p class="rounded-md border border-warning/50 bg-warning-muted px-3 py-2 text-xs text-warning-foreground">
								{selectedCorrectionWarning}
							</p>
						{/if}
						<Field.Root>
							<Field.Label for="duty-roster-correction-reason">Reason</Field.Label>
							<Input id="duty-roster-correction-reason" name="reason" placeholder="Reason for correction" required />
						</Field.Root>
						<p class="text-xs text-muted-foreground">
							Corrections update future counts and histories based on the Soldier who actually performed the duty.
						</p>
						{#if historyDetailRun.corrections.length}
							<div class="grid gap-2 border-t border-border pt-3">
								<p class="text-xs font-medium text-muted-foreground">Prior corrections</p>
								{#each historyDetailRun.corrections as correction (correction.id)}
									<div class="grid gap-0.5 rounded-md border border-border bg-card px-3 py-2">
										<span class="text-xs font-medium text-foreground">{formatDateTime(correction.correctedAt)}</span>
										<span class="text-xs text-muted-foreground"
											>{soldierName(correction.originalDisplay)} to {soldierName(correction.replacementDisplay)}</span
										>
										<span class="text-xs text-muted-foreground">{correction.reason}</span>
										{#if correction.poolOverride}
											<span class="text-xs text-muted-foreground">Outside normal pool. Saved as an override.</span>
										{/if}
									</div>
								{/each}
							</div>
						{/if}
						<Button type="submit" disabled={pendingHistoryAction === 'correction'}>
							<Save size={16} aria-hidden="true" />
							{pendingHistoryAction === 'correction' ? 'Saving...' : 'Save'}
						</Button>
						<Button variant="outline" type="button" onclick={closeCorrection}>Cancel</Button>
					</form>
				{:else}
					<div>
						<p class="text-xs font-medium text-muted-foreground">Run Controls</p>
						<h3 class="text-sm font-semibold text-foreground">Official record</h3>
					</div>
					<div class="grid gap-3">
						{#if isArchivedTemplate}
							<p class="text-xs text-muted-foreground">
								Archived Duty Roster Template history is read-only. Corrections, invalidations, and Calendar writes are
								disabled.
							</p>
						{:else}
							<p class="text-xs text-muted-foreground">
								Use Change Assignment on a roster row to record who actually served.
							</p>
						{/if}
						{#if !isArchivedTemplate && !detailReview.isInvalidated && detailReview.calendarState === 'apply'}
							<form
								method="post"
								action={applyAcceptedRunAction}
								use:enhance={() => handleHistoryActionEnhance('apply')}
							>
								<input type="hidden" name="runId" value={historyDetailRun.id} />
								<Button type="submit" class="w-full" disabled={pendingHistoryAction === 'apply'}>
									<RefreshCw size={16} aria-hidden="true" />
									{#if pendingHistoryAction === 'apply'}
										Applying...
									{:else}
										Apply to Calendar
									{/if}
								</Button>
							</form>
						{/if}
						{#if !isArchivedTemplate && !detailReview.isInvalidated && detailReview.calendarState === 'reapply' && historyDetailRun.calendarSyncState}
							<Button
								type="button"
								class="w-full"
								variant={calendarSyncTone(historyDetailRun) === 'destructive' ? 'destructive' : 'default'}
								aria-expanded={confirmingCalendarSyncRunId === historyDetailRun.id}
								onclick={() => (confirmingCalendarSyncRunId = historyDetailRun.id)}
							>
								<RefreshCw size={16} aria-hidden="true" />
								Review Calendar Reapply
							</Button>
							<p class="text-xs text-muted-foreground">{historyDetailRun.calendarSyncState.summary}</p>
						{/if}
						{#if historyDetailRun.calendarSyncState?.invalidationRemovalSummary}
							<p class="text-xs text-muted-foreground">
								{historyDetailRun.calendarSyncState.invalidationRemovalSummary}
							</p>
						{/if}
						{#if !isArchivedTemplate && detailReview.canInvalidate}
							<Button
								variant="destructive"
								type="button"
								aria-expanded={confirmingInvalidationRunId === historyDetailRun.id}
								onclick={() =>
									(confirmingInvalidationRunId =
										confirmingInvalidationRunId === historyDetailRun.id ? null : historyDetailRun.id)}
							>
								<Trash2 size={16} aria-hidden="true" />
								Invalidate run
							</Button>
						{/if}
						{#if !isArchivedTemplate && detailReview.canInvalidate && confirmingInvalidationRunId === historyDetailRun.id}
							<AppDialog.Root open onClose={() => (confirmingInvalidationRunId = null)}>
								<AppDialog.Content closeBlocked={pendingHistoryAction === 'invalidate'}>
									<AppDialog.Header>
										<AppDialog.Title>
											{detailFollowOnRuns.length > 0
												? 'Invalidate related Duty Roster runs?'
												: 'Invalidate Duty Roster run?'}
										</AppDialog.Title>
										<AppDialog.Description>
											Run {historyDetailRun.startDate} to {historyDetailRun.endDate} will be marked invalidated.
										</AppDialog.Description>
									</AppDialog.Header>
									<AppDialog.Body class="grid gap-3 text-sm text-muted-foreground">
										{#if detailFollowOnRuns.length > 0}
											<p>
												{detailFollowOnRuns.length}
												follow-on accepted {detailFollowOnRuns.length === 1 ? 'run was' : 'runs were'} generated from counts
												that include this run.
											</p>
											<ul class="grid gap-1 pl-4 text-xs">
												{#each detailFollowOnRuns.slice(0, 4) as run (run.id)}
													<li>{formatDate(run.startDate)} to {formatDate(run.endDate)}</li>
												{/each}
												{#if detailFollowOnRuns.length > 4}
													<li>and {detailFollowOnRuns.length - 4} more</li>
												{/if}
											</ul>
										{:else}
											<p>
												{historyDetailRun.calendarSyncState?.invalidationRemovalSummary ??
													'Linked Calendar assignments will be removed because they came from this invalidated Accepted Duty Roster Run. Future previews will ignore this run.'}
											</p>
										{/if}
									</AppDialog.Body>
									<AppDialog.Footer>
										<Button
											variant="outline"
											type="button"
											disabled={pendingHistoryAction === 'invalidate'}
											onclick={() => (confirmingInvalidationRunId = null)}
										>
											Cancel
										</Button>
										<form
											method="post"
											action={invalidateAcceptedRunAction}
											use:enhance={() => handleHistoryActionEnhance('invalidate')}
										>
											<input type="hidden" name="runId" value={historyDetailRun.id} />
											<input type="hidden" name="cascade" value="false" />
											<Button variant="destructive" type="submit" disabled={pendingHistoryAction === 'invalidate'}>
												{pendingHistoryAction === 'invalidate'
													? 'Invalidating...'
													: detailFollowOnRuns.length > 0
														? 'Invalidate this run'
														: 'Confirm invalidation'}
											</Button>
										</form>
										{#if detailFollowOnRuns.length > 0}
											<form
												method="post"
												action={invalidateAcceptedRunAction}
												use:enhance={() => handleHistoryActionEnhance('invalidate')}
											>
												<input type="hidden" name="runId" value={historyDetailRun.id} />
												<input type="hidden" name="cascade" value="true" />
												<Button type="submit" disabled={pendingHistoryAction === 'invalidate'}>
													{pendingHistoryAction === 'invalidate' ? 'Invalidating...' : 'Invalidate recommended runs'}
												</Button>
											</form>
										{/if}
									</AppDialog.Footer>
								</AppDialog.Content>
							</AppDialog.Root>
						{/if}
						{#if !isArchivedTemplate && confirmingCalendarSyncRunId === historyDetailRun.id && historyDetailRun.calendarSyncState && historyDetailRun.calendarSyncState.plan.changes.length > 0}
							<AppDialog.Root open onClose={() => (confirmingCalendarSyncRunId = null)}>
								<AppDialog.Content closeBlocked={pendingHistoryAction === 'apply'} size="wide">
									<AppDialog.Header>
										<AppDialog.Title>Re-apply Duty Roster to Calendar?</AppDialog.Title>
										<AppDialog.Description>
											Review the Calendar assignment changes before anything is written.
										</AppDialog.Description>
									</AppDialog.Header>
									<AppDialog.Body class="grid gap-4 text-sm">
										<div
											class={[
												'rounded-md border px-3 py-2',
												calendarSyncTone(historyDetailRun) === 'destructive'
													? 'border-destructive/40 bg-destructive/10 text-destructive'
													: 'border-warning/50 bg-warning-muted text-warning-foreground'
											]}
										>
											<p class="font-medium">{historyDetailRun.calendarSyncState.label}</p>
											<p class="text-xs">{historyDetailRun.calendarSyncState.summary}</p>
										</div>
										<div class="min-w-0 overflow-x-auto rounded-md border border-border">
											<table class="w-full text-sm" aria-label="Calendar reapply plan">
												<thead>
													<tr class="border-b border-border bg-muted/50">
														<th class="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Date</th>
														<th class="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Current</th>
														<th class="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Planned</th>
														<th class="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Reason</th>
													</tr>
												</thead>
												<tbody>
													{#each historyDetailRun.calendarSyncState.plan.changes as change (change.id)}
														<tr class="border-b border-border last:border-b-0">
															<td class="whitespace-nowrap px-3 py-2 text-xs font-medium">
																{formatDutyDate(change.date)}
															</td>
															<td class="px-3 py-2 text-xs text-muted-foreground">
																{change.currentAssigneeLabel ?? change.currentAssigneeId ?? 'Empty'}
															</td>
															<td class="px-3 py-2 text-xs font-medium text-foreground">
																{change.plannedAssigneeLabel ?? change.plannedAssigneeId ?? 'Clear assignment'}
															</td>
															<td class="px-3 py-2 text-xs text-muted-foreground">
																{change.reason}
															</td>
														</tr>
													{/each}
												</tbody>
											</table>
										</div>
									</AppDialog.Body>
									<AppDialog.Footer>
										<Button
											variant="outline"
											type="button"
											disabled={pendingHistoryAction === 'apply'}
											onclick={() => (confirmingCalendarSyncRunId = null)}
										>
											Cancel
										</Button>
										<form
											method="post"
											action={applyAcceptedRunAction}
											use:enhance={() => handleHistoryActionEnhance('apply')}
										>
											<input type="hidden" name="runId" value={historyDetailRun.id} />
											<input
												type="hidden"
												name="calendarSyncPlanToken"
												value={historyDetailRun.calendarSyncState.plan.token}
											/>
											<Button
												variant={calendarSyncTone(historyDetailRun) === 'destructive' ? 'destructive' : 'default'}
												type="submit"
												disabled={pendingHistoryAction === 'apply'}
											>
												{pendingHistoryAction === 'apply' ? 'Re-applying...' : 'Confirm reapply'}
											</Button>
										</form>
									</AppDialog.Footer>
								</AppDialog.Content>
							</AppDialog.Root>
						{/if}
						{#if !detailReview.canInvalidate && detailReview.isInvalidated}
							<p class="text-xs text-muted-foreground">Non-counting because this run is invalidated.</p>
						{:else if detailReview.invalidateDisabledReason}
							<p class="text-xs text-muted-foreground">{detailReview.invalidateDisabledReason}</p>
						{:else if !detailReview.canInvalidate}
							<p class="text-xs text-muted-foreground">This accepted run cannot be invalidated.</p>
						{/if}
					</div>
				{/if}
			</aside>
		</section>
	{/if}
{:else}
	<section class="grid gap-4" aria-label="Accepted Duty Roster history">
		<p class="text-sm text-muted-foreground">
			Accepted runs are immutable history snapshots of the roster as it was generated. Official exports are produced
			from accepted history.
		</p>
		<div class="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Duty Roster history summary">
			<div class="grid gap-1 rounded-md border border-border bg-card p-3">
				<Calendar size={18} class="text-muted-foreground" aria-hidden="true" />
				<span class="text-xs text-muted-foreground">Latest accepted</span>
				<strong class="text-xs font-semibold text-foreground"
					>{latestRun ? formatDateTime(latestRun.acceptedAt) : '-'}</strong
				>
			</div>
			<div class="grid gap-1 rounded-md border border-border bg-card p-3">
				<Database size={18} class="text-muted-foreground" aria-hidden="true" />
				<span class="text-xs text-muted-foreground">Accepted runs</span>
				<strong class="text-xs font-semibold text-foreground">{acceptedRunCount}</strong>
			</div>
			<div class="grid gap-1 rounded-md border border-border bg-card p-3">
				<Wrench size={18} class="text-muted-foreground" aria-hidden="true" />
				<span class="text-xs text-muted-foreground">Corrections</span>
				<strong class="text-xs font-semibold text-foreground">{pendingCorrectionCount}</strong>
			</div>
			<div class="grid gap-1 rounded-md border border-border bg-card p-3">
				<ShieldCheck size={18} class="text-muted-foreground" aria-hidden="true" />
				<span class="text-xs text-muted-foreground">Can invalidate</span>
				<strong class="text-xs font-semibold text-foreground">{canInvalidateAnyRun ? 'Yes' : 'No'}</strong>
			</div>
		</div>

		<div class="grid gap-0 rounded-md border border-border bg-card">
			<div class="flex flex-wrap items-end gap-3 border-b border-border px-4 py-3">
				<label class="grid gap-1">
					<span class="sr-only">Search history</span>
					<Input type="search" placeholder="Search history..." bind:value={historySearch} class="w-48" />
				</label>
				<label class="grid gap-1">
					<span class="text-xs font-medium text-muted-foreground">State</span>
					<Select.Root type="single" bind:value={historyStateFilter}>
						<Select.Trigger class="w-40" aria-label="History state filter">
							{historyStateFilterLabel}
						</Select.Trigger>
						<Select.Content>
							{#each historyStateOptions as option (option.value)}
								<Select.Item value={option.value} label={option.label} />
							{/each}
						</Select.Content>
					</Select.Root>
				</label>
				<Button variant="outline" size="sm" type="button" onclick={resetHistoryFilters}>
					<RefreshCw size={14} aria-hidden="true" />
					Reset
				</Button>
			</div>

			<div class="min-w-0 overflow-x-auto">
				<table class="w-full text-sm" aria-label="Duty Roster accepted runs">
					<thead>
						<tr class="border-b border-border">
							<th class="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Run</th>
							<th class="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Calendar</th>
							<th class="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Corrections</th>
							<th class="px-4 py-2 text-left text-xs font-medium text-muted-foreground">State</th>
							<th class="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Actions</th>
						</tr>
					</thead>
					<tbody>
						{#each filteredAcceptedRuns as run (run.id)}
							<tr class={['border-b border-border transition-colors', run.id === latestHistoryRunId && 'bg-muted/30']}>
								<td class="px-4 py-2.5">
									<span class="block text-sm font-medium text-foreground"
										>{formatDate(run.startDate)} to {formatDate(run.endDate)}</span
									>
									<span class="block text-xs text-muted-foreground">Accepted {formatDateTime(run.acceptedAt)}</span>
									{#if run.id === latestHistoryRunId}
										<Badge variant="info" class="mt-1 w-fit">Latest</Badge>
									{/if}
								</td>
								<td class="px-4 py-2.5">
									<span class="block text-xs font-medium text-foreground">{run.appliedAt ? 'Calendar' : 'History'}</span
									>
									<span class="block text-xs text-muted-foreground">{calendarStateLabel(run)}</span>
									<span class="block text-xs text-muted-foreground" title={acceptedByLabel(run)}
										>By {acceptedByLabel(run)}</span
									>
								</td>
								<td class="px-4 py-2.5 text-center text-sm font-medium text-foreground">{run.corrections.length}</td>
								<td class="px-4 py-2.5"><DutyRosterStatusBadge status={runStatusBadge(run)} /></td>
								<td class="px-4 py-2.5">
									<div class="flex items-center gap-1">
										<Button
											variant="outline"
											size="sm"
											href={historyDetailHref(run, 'roster')}
											aria-label={formatDate(run.startDate) + ' to ' + formatDate(run.endDate)}
										>
											<Eye size={14} aria-hidden="true" />
											Open
										</Button>
										{#if run.status === 'accepted'}
											<Button variant="outline" size="sm" type="button" onclick={() => printAcceptedRun(run)}>
												<Printer size={14} aria-hidden="true" />
												Print
											</Button>
											<Button variant="outline" size="sm" type="button" onclick={() => void exportAcceptedRun(run)}>
												<Download size={14} aria-hidden="true" />
												Export
											</Button>
										{/if}
									</div>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
			<div
				class="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3"
				aria-label="History pagination"
			>
				<p class="text-xs text-muted-foreground">
					{#if historyPage}
						Page {historyPage.page}. Showing {filteredAcceptedRuns.length} of {acceptedRuns.length} loaded runs.
					{:else}
						Showing {filteredAcceptedRuns.length} of {acceptedRuns.length} loaded runs.
					{/if}
				</p>
				<div class="flex items-center gap-2">
					{#if historyPage?.previousPage}
						<Button variant="outline" size="sm" href={historyPageHref(historyPage.previousPage)}>Newer runs</Button>
					{:else}
						<Button variant="outline" size="sm" disabled>Newer runs</Button>
					{/if}
					{#if historyPage?.hasMore && historyPage.nextPage}
						<Button variant="outline" size="sm" href={historyPageHref(historyPage.nextPage)}>Older runs</Button>
					{:else}
						<Button variant="outline" size="sm" disabled>Older runs</Button>
					{/if}
				</div>
			</div>
		</div>
	</section>
{/if}
