<script lang="ts">
	import { tick, untrack } from 'svelte';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import type { EvalTrackerContext, TrackerStepFilter } from '../contexts/EvalTrackerContext.svelte';
	import { NCOER_REPORT_TYPES, WORKFLOW_STEPS, type RatingSchemeEntry, type ReportType } from '../rating-scheme.types';
	import { WAITING_ROLE_CODE, waitingOnName, type ReadyToStart, type TrackerStatusFilter } from '../utils/evalTracker';
	import { EVALUATION_PHASE_COUNT, evaluationPhase, waitingOn, workflowRoles } from '../utils/evaluationWorkflow';
	import { spokenPersonLabel } from '../utils/personLabel';
	import { getRatingDueLabel, getReportTypeLabel } from '../utils/ratingScheme';
	import { ratingDueTone, type RatingDueTone } from '../utils/ratingDueTone';
	import EvalsTabs from './EvalsTabs.svelte';
	import * as Alert from '$lib/components/ui/alert';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import * as Empty from '$lib/components/ui/empty';
	import { SegmentedProgress } from '$lib/components/ui/progress';
	import * as Table from '$lib/components/ui/table';
	import * as PageShell from '$lib/components/patterns/page-shell';
	import {
		WorkspaceToolbar,
		type ToolbarItem,
		type WorkspaceToolbarProps
	} from '$lib/components/patterns/workspace-toolbar';
	import { reportClientFailure } from '$lib/stores/errorReportLedger';
	import { stillInOrganizationLifetime } from '$lib/stores/core';
	import { visibleUrl } from '$lib/utils/visibleUrl';
	import { toastStore } from '$lib/stores/toast.svelte';
	import { formatDayMonthShortYear } from '$lib/utils/dates';
	import { cn } from '$lib/utils';

	interface Props {
		ctx: EvalTrackerContext;
	}

	let { ctx }: Props = $props();

	// The view mounts once the workspace streams in, after the first navigation, so it follows the shown address itself.
	$effect(() => {
		const url = visibleUrl();
		untrack(() => ctx.followAddress(url));
	});

	let exportLoading = $state(false);
	let workspace = $state<HTMLElement | null>(null);
	let sheetOpener: Element | null = null;
	let sheetEvaluationId: string | null = null;
	let sheetWasOpen = false;

	// The row can move (its due changes) or leave the filter (it completed), so the opener is not always there.
	$effect.pre(() => {
		const open = ctx.sheet !== undefined || ctx.start !== undefined;
		if (open && !sheetWasOpen) {
			sheetOpener = document.activeElement;
			sheetEvaluationId = ctx.sheet?.evaluationId ?? null;
		} else if (!open && sheetWasOpen) {
			void restoreFocus(sheetOpener, sheetEvaluationId);
		}
		sheetWasOpen = open;
	});

	async function restoreFocus(opener: Element | null, evaluationId: string | null) {
		await tick();
		const row = evaluationId
			? workspace?.querySelector(`[data-evaluation-id="${CSS.escape(evaluationId)}"]:not([hidden])`)
			: null;
		const start = workspace?.querySelector('[data-toolbar-row] [data-toolbar-item="start-evaluation"] button');
		const target = opener?.isConnected ? opener : (row ?? start);
		if (target instanceof HTMLElement) target.focus();
	}

	const writeAffordance = $derived(ctx.writeAffordance);
	const canEdit = $derived(writeAffordance.allowed);
	const rows = $derived(ctx.rows);
	const ready = $derived(ctx.ready);
	const summary = $derived(ctx.summary);
	const listedCount = $derived(ctx.listed.length);
	const shownLabel = $derived(`${rows.length} of ${listedCount} shown`);
	const people = $derived(new Map(ctx.personnelLookup.map((person) => [person.id, person])));

	const statusOptions = [
		{ value: 'open', label: 'Status: Open' },
		{ value: 'completed', label: 'Completed' },
		{ value: 'all', label: 'Open and completed' }
	];
	const reportOptions = [
		{ value: 'all', label: 'Report: All' },
		...NCOER_REPORT_TYPES.map((option) => ({ value: option.value, label: `${option.value} · ${option.label}` }))
	];
	const stepOptions = [
		{ value: 'all', label: 'Step: All' },
		{ value: 'not-tracked', label: 'Not tracked' },
		...WORKFLOW_STEPS.map((step) => ({ value: step.value, label: step.label }))
	];

	async function exportRows(): Promise<void> {
		exportLoading = true;
		const current = stillInOrganizationLifetime();
		try {
			const { exportRatingScheme } = await import('../utils/ratingSchemeExport');
			await exportRatingScheme(rows, ctx.personnelLookup);
		} catch (err) {
			if (current()) {
				reportClientFailure(err);
				toastStore.error(err instanceof Error ? err.message : 'Export failed');
			}
		} finally {
			exportLoading = false;
		}
	}

	const toolbarItems = $derived.by<ToolbarItem[]>(() => [
		{
			kind: 'select',
			id: 'status',
			label: 'Evaluation status',
			ariaLabel: 'Status filter',
			options: statusOptions,
			value: ctx.view.status,
			defaultValue: 'open',
			onValueChange: (value) => (ctx.view.status = value as TrackerStatusFilter)
		},
		{
			kind: 'select',
			id: 'report',
			label: 'Report type',
			ariaLabel: 'Report filter',
			options: reportOptions,
			value: ctx.view.reportFilter,
			defaultValue: 'all',
			onValueChange: (value) => (ctx.view.reportFilter = value as 'all' | ReportType)
		},
		{
			kind: 'select',
			id: 'step',
			label: 'Workflow step',
			ariaLabel: 'Step filter',
			options: stepOptions,
			value: ctx.view.stepFilter,
			defaultValue: 'all',
			onValueChange: (value) => (ctx.view.stepFilter = value as TrackerStepFilter)
		},
		{
			kind: 'action',
			id: 'export',
			label: exportLoading ? 'Exporting...' : 'Export',
			icon: 'download',
			onclick: exportRows,
			loading: exportLoading
		}
	]);

	const toolbarSearch = $derived({
		label: 'Search by Soldier or signer',
		placeholder: 'Search Soldier or signer...',
		value: ctx.view.searchQuery,
		onValueChange: (value) => (ctx.view.searchQuery = value)
	} satisfies NonNullable<WorkspaceToolbarProps['search']>);

	const toolbarPrimary = $derived.by<WorkspaceToolbarProps['primary']>(() =>
		writeAffordance.visible
			? {
					kind: 'action',
					id: 'start-evaluation',
					label: 'Start evaluation',
					icon: 'plus',
					onclick: () => ctx.openStart(null),
					disabled: !canEdit,
					disabledReason: canEdit ? undefined : writeAffordance.explanation
				}
			: undefined
	);

	function personName(personId: string | null, name: string | null = null): string {
		if (!personId) return name?.trim() || 'Not set';
		const person = people.get(personId);
		return person ? spokenPersonLabel(person) : 'Unknown';
	}

	interface RowView {
		name: string;
		rater: string;
		report: string;
		due: { text: string; tone: RatingDueTone };
		phase: ReturnType<typeof evaluationPhase>;
		waiting: { code: string; name: string } | null;
	}

	function view(entry: RatingSchemeEntry): RowView {
		const roles = workflowRoles(entry);
		const role = waitingOn(entry.workflowStatus, roles);
		const due =
			entry.workflowStatus === 'submitted-to-hrc'
				? { text: 'Submitted', tone: ratingDueTone.completed }
				: (({ status, text }) => ({ text, tone: ratingDueTone[status] }))(
						getRatingDueLabel(entry.ratingPeriodEnd, entry.workflowStatus)
					);
		return {
			name: personName(entry.ratedPersonId),
			rater: personName(entry.raterPersonId, entry.raterName),
			report: getReportTypeLabel(entry.reportType, entry.evalType) || 'Not set',
			due,
			phase: evaluationPhase(entry.workflowStatus),
			waiting: role
				? { code: WAITING_ROLE_CODE[role], name: waitingOnName(role, entry, ctx.personnelLookup) ?? 'Not set' }
				: null
		};
	}

	const period = (start: string, end: string) => `${formatDayMonthShortYear(start)} → ${formatDayMonthShortYear(end)}`;

	function lastLine({ last }: ReadyToStart): string {
		if (!last) return 'No evaluation on record';
		const label = getReportTypeLabel(last.reportType, last.evalType) || 'evaluation';
		const signed = last.signedChain?.signedAt;
		return `Last ${label}${signed ? ` completed ${formatDayMonthShortYear(signed.slice(0, 10))},` : ''} thru ${formatDayMonthShortYear(last.ratingPeriodEnd)}`;
	}

	const startLabel = (row: ReadyToStart) => (row.next ? 'Start next Annual' : 'Start evaluation');

	function openRow(event: MouseEvent | KeyboardEvent, entry: RatingSchemeEntry) {
		if (event instanceof KeyboardEvent) {
			if (event.key !== 'Enter' && event.key !== ' ') return;
			event.preventDefault();
		}
		ctx.openEvaluation(entry.id);
	}

	/** Below xl the table fits a 1024 px window: Period folds under Report and Waiting on under Workflow, as on a card. */
	const columns = [
		['Due', 'w-[108px]'],
		['Rated Soldier', ''],
		['Report', 'w-[132px] max-xl:w-[168px]'],
		['Period', 'w-[176px] max-xl:hidden'],
		['Workflow', 'w-[184px] max-xl:w-[208px]'],
		['Waiting on', 'w-[180px] max-xl:hidden'],
		['', 'w-10']
	] as const;
	const cardClass = 'relative grid w-full gap-1.5 overflow-clip rounded-md border bg-card py-3 pr-3.5 pl-4 text-left';

	const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
</script>

{#snippet headerCounts()}
	<span class="flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[15px]">
		<span><span class="tabular-nums">{summary.open}</span> open</span>
		<span class="h-3.5 w-px bg-border max-sm:hidden" aria-hidden="true"></span>
		<span class="font-semibold {ratingDueTone.overdue.text}">
			<span class="tabular-nums">{summary.overdue}</span> past thru
		</span>
		<span class="h-3.5 w-px bg-border max-sm:hidden" aria-hidden="true"></span>
		<span class="font-semibold {ratingDueTone['due-30'].text}">
			<span class="tabular-nums">{summary['due-30']}</span> thru in 30 days
		</span>
		<span class="h-3.5 w-px bg-border max-sm:hidden" aria-hidden="true"></span>
		<span class="font-semibold {ratingDueTone['due-60'].text} max-sm:hidden">
			<span class="tabular-nums">{summary['due-60']}</span> thru in 31 to 60 days
		</span>
	</span>
{/snippet}

{#snippet shownCount()}
	<span class="text-xs font-medium text-muted-foreground" role="status" aria-label={shownLabel}>{shownLabel}</span>
{/snippet}

{#snippet meter(phase: RowView['phase'], width: string)}
	<SegmentedProgress
		class={cn('shrink-0', width)}
		value={phase.step}
		max={EVALUATION_PHASE_COUNT}
		aria-label="Evaluation step {phase.step} of {EVALUATION_PHASE_COUNT}"
	/>
{/snippet}

{#snippet waitingCell(waiting: RowView['waiting'])}
	{#if waiting}
		<span class="flex min-w-0 items-baseline gap-1.5">
			<span class="w-[30px] shrink-0 font-mono text-[11px] text-muted-foreground">{waiting.code}</span>
			<span class={cn('truncate', waiting.code === 'HRC' && 'text-muted-foreground')}>{waiting.name}</span>
		</span>
	{:else}
		<span class="text-muted-foreground">—</span>
	{/if}
{/snippet}

{#snippet cardBody(entry: RatingSchemeEntry, row: RowView)}
	<span class={cn('absolute inset-y-0 left-0 w-[3px]', row.due.tone.rail)} aria-hidden="true"></span>
	<span class="flex items-baseline justify-between gap-3">
		<span class="truncate text-[15px] font-semibold">{row.name}</span>
		<span class={cn('shrink-0 font-mono text-xs font-semibold', row.due.tone.text)}>{row.due.text}</span>
	</span>
	<span class="flex items-center gap-2">
		<Badge variant="outline" class="font-mono text-[11px]">{entry.evalType}</Badge>
		<span class="truncate font-mono text-xs">
			{entry.reportType ?? '—'} · {period(entry.ratingPeriodStart, entry.ratingPeriodEnd)}
		</span>
	</span>
	<span class="flex items-center gap-2.5 text-sm">
		{@render meter(row.phase, 'w-[78px]')}
		<span class="truncate">{row.phase.label}</span>
	</span>
	<span class="text-sm">{@render waitingCell(row.waiting)}</span>
{/snippet}

<div class="flex h-full min-h-0 flex-col overflow-hidden bg-background" bind:this={workspace}>
	{#if !ctx.canViewRatingScheme}
		<div class="p-4 md:p-6">
			<Alert.Root variant="warning">
				<Alert.Title>Access Restricted</Alert.Title>
				<Alert.Description>
					You don't have permission to view this area. Contact your organization admin for access.
				</Alert.Description>
			</Alert.Root>
		</div>
	{:else}
		<div class="flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-hidden px-6 pt-4 pb-5 max-sm:p-3">
			<PageShell.Header
				variant="display"
				eyebrow="Eval tracker · {ctx.orgName}"
				title="Evals"
				subtitle={headerCounts}
				aside={shownCount}
			/>
			<EvalsTabs orgId={ctx.orgId} section="tracker" pastThru={summary.overdue} />

			<WorkspaceToolbar
				ariaLabel="Eval Tracker controls"
				items={toolbarItems}
				search={toolbarSearch}
				primary={toolbarPrimary}
				compactBelow="sm"
			/>

			<div class="grid min-h-0 flex-1 content-start gap-6 overflow-auto">
				{#if rows.length === 0 && ready.length === 0}
					<Empty.Root class="border-border bg-card">
						<Empty.Header>
							{#if ctx.hasActiveSearchOrFilters}
								<Empty.Title>No evaluations match</Empty.Title>
								<Empty.Description>Nothing fits the current search and filters.</Empty.Description>
							{:else}
								<Empty.Title>No evaluations in work</Empty.Title>
								<Empty.Description>
									Add Soldiers to the Rating Scheme, then start their evaluations here.
								</Empty.Description>
							{/if}
						</Empty.Header>
						<Empty.Content>
							{#if ctx.hasActiveSearchOrFilters}
								<Button variant="outline" onclick={() => ctx.clearSearchAndFilters()}>Clear search and filters</Button>
							{:else}
								<Button variant="outline" href="/org/{ctx.orgId}/evals/rating-scheme">Open the Rating Scheme</Button>
							{/if}
						</Empty.Content>
					</Empty.Root>
				{/if}

				{#if rows.length > 0}
					<div class="overflow-clip rounded-md border bg-card max-sm:hidden">
						<Table.Root class="min-w-[640px] table-fixed" scrollRegionLabel="Evaluations, scrollable">
							<Table.Header>
								<Table.Row class="h-9 hover:bg-transparent">
									{#each columns as [label, width] (label)}
										<Table.Head
											class={cn(
												'font-mono text-[0.6875rem] font-medium tracking-[0.08em] text-muted-foreground uppercase',
												width
											)}
										>
											{#if label}{label}{:else}<span class="sr-only">Open</span>{/if}
										</Table.Head>
									{/each}
								</Table.Row>
							</Table.Header>
							<Table.Body>
								{#each rows as entry (entry.id)}
									{@const row = view(entry)}
									<Table.Row
										class={cn(
											'h-15',
											canEdit &&
												'cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset'
										)}
										data-evaluation-id={entry.id}
										tabindex={canEdit ? 0 : undefined}
										aria-label={canEdit ? `Open evaluation for ${row.name}` : undefined}
										onclick={canEdit ? (event) => openRow(event, entry) : undefined}
										onkeydown={canEdit ? (event) => openRow(event, entry) : undefined}
									>
										<Table.Cell
											class={cn('font-mono text-xs font-semibold', row.due.tone.text, row.due.tone.insetRail)}
										>
											{row.due.text}
										</Table.Cell>
										<Table.Cell>
											<p class="truncate text-[15px] leading-5 font-semibold">{row.name}</p>
											<p class="truncate text-[13px] leading-4 text-muted-foreground">Rater {row.rater}</p>
										</Table.Cell>
										<Table.Cell>
											<span class="flex min-w-0 items-center gap-2">
												<Badge variant="outline" class="font-mono text-[11px]">{entry.evalType}</Badge>
												<span class="truncate text-sm">{row.report}</span>
											</span>
											<p class="mt-1 truncate font-mono text-xs xl:hidden">
												{period(entry.ratingPeriodStart, entry.ratingPeriodEnd)}
											</p>
										</Table.Cell>
										<Table.Cell class="font-mono text-xs max-xl:hidden">
											{period(entry.ratingPeriodStart, entry.ratingPeriodEnd)}
										</Table.Cell>
										<Table.Cell>
											<span class="flex min-w-0 items-center gap-2.5">
												{@render meter(row.phase, 'w-[62px]')}
												<span class="truncate text-sm">{row.phase.label}</span>
											</span>
											<span class="mt-1 block text-sm xl:hidden">{@render waitingCell(row.waiting)}</span>
										</Table.Cell>
										<Table.Cell class="text-sm max-xl:hidden">{@render waitingCell(row.waiting)}</Table.Cell>
										<Table.Cell>
											{#if canEdit}<ChevronRightIcon class="size-4 text-muted-foreground" aria-hidden="true" />{/if}
										</Table.Cell>
									</Table.Row>
								{/each}
							</Table.Body>
						</Table.Root>
					</div>

					<ul class="grid gap-2 sm:hidden" aria-label="Evaluations">
						{#each rows as entry (entry.id)}
							{@const row = view(entry)}
							<li>
								{#if canEdit}
									<button
										type="button"
										data-evaluation-id={entry.id}
										class="{cardClass} outline-none focus-visible:ring-2 focus-visible:ring-ring"
										aria-label="Open evaluation for {row.name}"
										onclick={() => ctx.openEvaluation(entry.id)}
									>
										{@render cardBody(entry, row)}
									</button>
								{:else}
									<div data-evaluation-id={entry.id} class={cardClass}>{@render cardBody(entry, row)}</div>
								{/if}
							</li>
						{/each}
					</ul>
				{/if}

				{#if ready.length > 0}
					<section class="grid gap-3" aria-labelledby="ready-to-start">
						<div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
							<h2
								id="ready-to-start"
								class="font-heading text-[22px] leading-6 font-extrabold uppercase max-sm:font-mono max-sm:text-[0.6875rem] max-sm:leading-3.5 max-sm:font-medium max-sm:tracking-[0.08em] max-sm:text-muted-foreground"
							>
								Ready to start<span class="sm:hidden">{` · ${ready.length}`}</span>
							</h2>
							<p class="text-sm text-muted-foreground max-sm:hidden">On the rating scheme with no open evaluation</p>
						</div>
						<ul class="grid overflow-clip rounded-md border bg-card max-sm:gap-2 max-sm:border-0 max-sm:bg-transparent">
							{#each ready as row (row.scheme.id)}
								<li
									class="flex min-h-15 items-center gap-4 px-4 py-2.5 not-last:border-b max-sm:flex-wrap max-sm:gap-2 max-sm:rounded-md max-sm:border max-sm:border-dashed max-sm:bg-card max-sm:not-last:border-b"
								>
									<div class="w-[200px] min-w-0 max-sm:w-full">
										<p class="truncate text-[15px] leading-5 font-semibold">{personName(row.scheme.ratedPersonId)}</p>
										<p class="truncate text-[13px] leading-4 text-muted-foreground max-sm:hidden">
											Rater {personName(row.scheme.raterPersonId, row.scheme.raterName)}
										</p>
									</div>
									<Badge variant="outline" class="font-mono text-[11px] max-sm:hidden">{row.scheme.evalType}</Badge>
									<p class="min-w-0 flex-1 truncate text-sm text-muted-foreground">{lastLine(row)}</p>
									<p class="w-[176px] shrink-0 font-mono text-xs max-lg:hidden">
										{#if row.next}
											{period(row.next.ratingPeriodStart, row.next.ratingPeriodEnd)}
										{:else}
											<span class="font-sans text-muted-foreground">Set the period</span>
										{/if}
									</p>
									{#if writeAffordance.visible}
										<Button
											variant="outline"
											size="sm"
											class="w-[150px] shrink-0 max-sm:w-auto"
											disabled={!canEdit}
											aria-label="{startLabel(row)} for {personName(row.scheme.ratedPersonId)}"
											onclick={() => ctx.openStart(row.scheme.id)}
										>
											<span class="max-sm:hidden">{startLabel(row)}</span>
											<span class="sm:hidden">{row.next ? 'Start next Annual' : 'Start'}</span>
										</Button>
									{/if}
								</li>
							{/each}
						</ul>
					</section>
				{/if}

				{#if ctx.view.status === 'open' && ctx.completedCount > 0}
					<div
						class="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md border border-dashed px-4 py-3.5 max-sm:border-0 max-sm:px-0 max-sm:py-1"
					>
						<h2 class="font-heading text-lg leading-5 font-extrabold uppercase max-sm:hidden">Completed</h2>
						<p class="flex-1 text-sm text-muted-foreground max-sm:hidden">
							{plural(ctx.completedCount, 'completed evaluation', 'completed evaluations')}. Each keeps the chain that
							signed it.
						</p>
						<Button
							variant="link"
							size="none"
							class="gap-1 text-sm underline"
							onclick={() => (ctx.view.status = 'all')}
						>
							Show completed <span class="sm:hidden">({ctx.completedCount})</span>
						</Button>
					</div>
				{/if}
			</div>
		</div>
	{/if}
</div>
