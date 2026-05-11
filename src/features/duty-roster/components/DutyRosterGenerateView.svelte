<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import { AlertTriangle, Calendar, CheckCircle2, Info, Printer, Save, X } from '@lucide/svelte';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { DatePicker } from '$lib/components/ui/date-picker';
	import * as Tabs from '$lib/components/ui/tabs';
	import SearchCombobox from '$lib/components/ui/SearchCombobox.svelte';
	import SkeletonGrid from '$lib/components/ui/SkeletonGrid.svelte';
	import { Textarea } from '$lib/components/ui/textarea';
	import * as OperationalMatrix from '$lib/components/ui/operational-matrix';
	import type { OperationalMatrixColumn, OperationalMatrixRow } from '$lib/components/ui/operational-matrix';
	import { printDutyRosterForBrowser } from '$features/duty-roster/export/dutyRosterBrowserExport';
	import {
		buildDutyRosterPreviewReviewModel,
		type DutyRosterPreviewReviewModel
	} from '$features/duty-roster/workspace/dutyRosterPreviewReview';
	import type { DutyRosterTemplatePreview } from '$features/duty-roster/templates/dutyRosterTemplatePreview';
	import type { DutyRosterGenerateWorkspaceModel } from '$features/duty-roster/workspace/dutyRosterWorkspaceReadModel';

	let { generate }: { generate: DutyRosterGenerateWorkspaceModel } = $props();

	let previewMode = $state<'list' | 'matrix'>('list');
	let generatingPreview = $state(false);
	let activePreviewDate = $state<string | null>(null);
	let selectedPreviewAssignees = $state<Record<string, string>>({});
	let startDateOverride = $state('');
	let endDateOverride = $state('');

	type Da6MatrixCell = NonNullable<DutyRosterPreviewReviewModel['matrix']['rows'][number]['cells'][number]>;
	type Da6MatrixRow = OperationalMatrixRow & { meta: { cells: Da6MatrixCell[] } };
	type Da6MatrixColumn = OperationalMatrixColumn & { meta: { date: string } };

	const selectedTemplate = $derived(generate.selectedTemplate);
	const actionForm = $derived(generate.actionForm);
	const preview = $derived(generate.preview);
	const generateAction = $derived(generate.generateAction);
	const manualPreviewAction = $derived(generate.manualPreviewAction);
	const acceptPreviewAction = $derived(generate.acceptPreviewAction);
	const applyPreviewAction = $derived(generate.applyPreviewAction);
	const historyPath = $derived(generate.historyPath);
	const countReadModel = $derived(generate.countReadModel);
	const acceptedRuns = $derived(generate.acceptedRuns);
	const generateStartDate = $derived(generate.generateStartDate);
	const generateEndDate = $derived(generate.generateEndDate);
	const startDateValue = $derived(startDateOverride || generateStartDate);
	const endDateValue = $derived(endDateOverride || generateEndDate);
	const canGenerate = $derived(generate.canGenerate);
	const previewReview: DutyRosterPreviewReviewModel | null = $derived(
		preview ? buildDutyRosterPreviewReviewModel({ preview, selectedAssigneeIds: selectedPreviewAssignees }) : null
	);
	const activePreviewRow = $derived(previewReview?.rows.find((row) => row.date === activePreviewDate) ?? null);
	const previewMetrics = $derived(
		previewReview?.rows.reduce(
			(metrics, row) => ({
				assignedCount: metrics.assignedCount + (row.finalAssignee ? 1 : 0),
				manualCount: metrics.manualCount + (row.manualSelection ? 1 : 0),
				requiresActionCount: metrics.requiresActionCount + (row.finalAssignee ? 0 : 1),
				warningCount: metrics.warningCount + row.liveWarnings.length
			}),
			{ assignedCount: 0, manualCount: 0, requiresActionCount: 0, warningCount: 0 }
		) ?? { assignedCount: 0, manualCount: 0, requiresActionCount: 0, warningCount: 0 }
	);
	const previewAssignedCount = $derived(previewMetrics.assignedCount);
	const previewManualCount = $derived(previewMetrics.manualCount);
	const previewRequiresActionCount = $derived(previewMetrics.requiresActionCount);
	const previewWarningCount = $derived(previewMetrics.warningCount);
	const previewIsCommitReady = $derived(previewRequiresActionCount === 0 && previewWarningCount === 0);
	const recentAcceptedRuns = $derived(acceptedRuns.slice(0, 3));

	const previewMatrixColumns = $derived<Da6MatrixColumn[]>(
		(previewReview?.matrix.columns ?? []).map((column) => ({
			id: column.date,
			label: dayMonthLabel(column.date),
			meta: { date: column.date }
		}))
	);
	const previewMatrixRows = $derived<Da6MatrixRow[]>(
		(previewReview?.matrix.rows ?? []).map((row) => ({
			id: row.personnelId,
			label: row.soldierLabel,
			meta: { cells: row.cells }
		}))
	);

	function handleGenerateEnhance() {
		generatingPreview = true;

		return async ({ update }: { update: () => Promise<void> }) => {
			await update();
			generatingPreview = false;
		};
	}

	function printDraftPreview(preview: DutyRosterTemplatePreview): void {
		printDutyRosterForBrowser({ templatePreview: preview, statusLabel: 'Draft' });
	}

	function openManualChange(row: DutyRosterPreviewReviewModel['rows'][number]): void {
		activePreviewDate = row.date;
		selectedPreviewAssignees = {
			...selectedPreviewAssignees,
			[row.date]: row.editAssigneeId
		};
	}

	function dateParts(date: string): { weekday: string; label: string } {
		const [year, month, day] = date.split('-').map(Number);
		const value = new Date(Date.UTC(year, month - 1, day));
		const weekday = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'UTC' }).format(value).toUpperCase();
		const label = new Intl.DateTimeFormat('en-US', {
			day: '2-digit',
			month: 'short',
			year: 'numeric',
			timeZone: 'UTC'
		})
			.format(value)
			.toUpperCase();

		return { weekday, label };
	}

	function dayMonthLabel(date: string): string {
		const [year, month, day] = date.split('-').map(Number);
		const value = new Date(Date.UTC(year, month - 1, day));
		const parts = new Intl.DateTimeFormat('en-US', {
			day: '2-digit',
			month: 'short',
			timeZone: 'UTC'
		}).formatToParts(value);
		const dayPart = parts.find((part) => part.type === 'day')?.value ?? date.slice(-2);
		const monthPart = parts.find((part) => part.type === 'month')?.value.toUpperCase() ?? '';

		return `${dayPart}-${monthPart}`;
	}

	function previewMatrixCell(row: Da6MatrixRow, column: Da6MatrixColumn): Da6MatrixCell | undefined {
		return row.meta.cells.find((cell) => cell.date === column.meta.date);
	}
</script>

<h2 id="template-view-heading" class="sr-only">Generate Duty Roster preview</h2>

{#if actionForm?.generateError}
	<p class="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive" role="alert">
		{actionForm.generateError}
	</p>
{/if}

<div class="grid gap-5" class:gap-4={Boolean(preview)}>
	{#if !preview}
		<div class="grid items-start gap-4 lg:grid-cols-[minmax(0,1.28fr)_minmax(20rem,0.96fr)]">
			<div class="grid content-start gap-4">
				<section class="rounded-md border border-border bg-card p-5" aria-labelledby="generation-setup-heading">
					<h3
						id="generation-setup-heading"
						class="font-display text-[1.35rem] font-extrabold uppercase leading-none tracking-[0.04em] text-foreground"
					>
						Generation Setup
					</h3>
					<p class="mt-2 text-[0.95rem] leading-relaxed text-muted-foreground">
						Configure the run dates below. Generate creates a preview only and does not affect official history.
					</p>
					<form
						id="generate-preview-form"
						class="mt-5 grid gap-5"
						method="POST"
						action={generateAction}
						use:enhance={handleGenerateEnhance}
					>
						<input type="hidden" name="templateId" value={selectedTemplate.id} />
						<div class="grid gap-4 sm:grid-cols-2">
							<label
								class="grid gap-1 font-mono text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground"
							>
								<span>Start date</span>
								<input type="hidden" name="startDate" value={startDateValue} />
								<DatePicker
									id="generate-start-date"
									value={startDateValue}
									placeholder="Select start date"
									aria-label="Start date"
									onValueChange={(value) => (startDateOverride = value)}
								/>
							</label>
							<label
								class="grid gap-1 font-mono text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground"
							>
								<span>End date</span>
								<input type="hidden" name="endDate" value={endDateValue} />
								<DatePicker
									id="generate-end-date"
									value={endDateValue}
									placeholder="Select end date"
									aria-label="End date"
									onValueChange={(value) => (endDateOverride = value)}
								/>
							</label>
						</div>
						<p class="text-sm text-muted-foreground">
							Start date must be today or later, and the end date must be on or after the start date.
						</p>
						<div
							class="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-3 rounded-md border border-dashed border-border px-4 py-3 text-sm leading-relaxed text-muted-foreground"
							role="note"
						>
							<Info size={20} class="text-info-foreground" aria-hidden="true" />
							<span>
								Generate builds a preview roster using current pools, rules, and settings. No history is written until
								you accept the run.
							</span>
						</div>
					</form>
				</section>

				<section class="rounded-md border border-border bg-card p-5" aria-labelledby="pool-snapshot-heading">
					<h3
						id="pool-snapshot-heading"
						class="font-display text-[1.35rem] font-extrabold uppercase leading-none tracking-[0.04em] text-foreground"
					>
						Pool Snapshot <span
							class="font-mono text-xs font-semibold normal-case tracking-[0.08em] text-muted-foreground"
							>(as of now)</span
						>
					</h3>
					<div class="mt-4 grid gap-3 sm:grid-cols-2">
						<div class="grid gap-1">
							<span class="font-mono text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground"
								>Pool Size</span
							>
							<strong class="text-lg font-bold text-foreground">{countReadModel?.rows.length ?? 0}</strong>
							<small class="text-sm text-muted-foreground">Soldiers</small>
						</div>
						<div class="grid gap-1">
							<span class="font-mono text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground"
								>Current Count Source</span
							>
							<strong class="text-lg font-bold text-foreground"
								>{countReadModel?.sourceLabel ?? 'DA6 roster order'}</strong
							>
							<small class="text-sm text-muted-foreground"
								>{countReadModel?.sourceDescription ?? 'Preview uses the current roster order.'}</small
							>
						</div>
						<div class="grid gap-1">
							<span class="font-mono text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground"
								>Accepted Runs</span
							>
							<strong class="text-lg font-bold text-foreground">{countReadModel?.acceptedRunCount ?? 0}</strong>
							<small class="text-sm text-muted-foreground">Available to this count model</small>
						</div>
						<div class="grid gap-1">
							<span class="font-mono text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground"
								>Corrections</span
							>
							<strong class="text-lg font-bold text-foreground">{countReadModel?.countingCorrectionCount ?? 0}</strong>
							<small class="text-sm text-muted-foreground">Counting toward future DA6</small>
						</div>
					</div>
				</section>

				<div class="flex items-center gap-3" aria-label="Generation actions">
					<Button variant="outline" type="reset" form="generate-preview-form" disabled={generatingPreview}>
						Reset
					</Button>
					<Button type="submit" form="generate-preview-form" disabled={!canGenerate || generatingPreview}>
						{generatingPreview ? 'Generating...' : 'Generate Preview'}
					</Button>
				</div>
				<p class="flex items-center gap-2 text-sm text-muted-foreground">
					<Info size={16} aria-hidden="true" /> Preview only. Nothing is saved until you accept.
				</p>
			</div>

			<div class="grid content-start gap-4">
				<section
					class="grid gap-4 rounded-md border border-border bg-card p-5"
					aria-labelledby="generation-rules-heading"
				>
					<h3
						id="generation-rules-heading"
						class="font-display text-[1.35rem] font-extrabold uppercase leading-none tracking-[0.04em] text-foreground"
					>
						Rules at a Glance
					</h3>
					<div class="grid gap-4">
						<div class="border-t border-border pt-4 first:border-t-0 first:pt-0">
							<h4 class="mb-2 font-mono text-[0.78rem] font-bold uppercase tracking-[0.1em] text-foreground">
								DA6 Selection
							</h4>
							<ul class="grid gap-1 pl-5 text-[0.95rem] leading-relaxed text-muted-foreground">
								<li>Soldiers are selected from {selectedTemplate.shortCode ?? selectedTemplate.name} pool.</li>
								<li>Lowest DA6 value is chosen first.</li>
								<li>Ties are broken by earliest last-run date, then by name.</li>
								<li>Soldiers on exclusion status are skipped.</li>
							</ul>
						</div>
						<div class="border-t border-border pt-4">
							<h4 class="mb-2 font-mono text-[0.78rem] font-bold uppercase tracking-[0.1em] text-foreground">
								A / D Treatment
							</h4>
							<dl class="grid gap-2">
								<div class="grid grid-cols-[minmax(3rem,auto)_minmax(0,1fr)] items-baseline gap-3">
									<dt class="font-mono text-[0.75rem] font-bold uppercase text-foreground">A</dt>
									<dd class="text-[0.92rem] leading-snug text-muted-foreground">
										Authorized absence. Removed from consideration.
									</dd>
								</div>
								<div class="grid grid-cols-[minmax(3rem,auto)_minmax(0,1fr)] items-baseline gap-3">
									<dt class="font-mono text-[0.75rem] font-bold uppercase text-foreground">D</dt>
									<dd class="text-[0.92rem] leading-snug text-muted-foreground">
										Other duty. Counted as a run for DA6 purposes.
									</dd>
								</div>
							</dl>
						</div>
						<div class="border-t border-border pt-4">
							<h4 class="mb-2 font-mono text-[0.78rem] font-bold uppercase tracking-[0.1em] text-foreground">
								On Accept
							</h4>
							<p class="text-[0.95rem] leading-relaxed text-muted-foreground">
								Updates history, DA6 values, and assignment counts.
							</p>
						</div>
						<div class="border-t border-border pt-4">
							<h4 class="mb-2 font-mono text-[0.78rem] font-bold uppercase tracking-[0.1em] text-foreground">
								On Apply to Calendar
							</h4>
							<p class="text-[0.95rem] leading-relaxed text-muted-foreground">
								Creates Calendar events for the roster date range after accepting the preview.
							</p>
						</div>
					</div>
				</section>

				<section class="rounded-md border border-border bg-card p-5" aria-labelledby="recent-history-heading">
					<div class="flex items-center justify-between gap-3">
						<h3
							id="recent-history-heading"
							class="font-display text-[1.35rem] font-extrabold uppercase leading-none tracking-[0.04em] text-foreground"
						>
							Recent History
						</h3>
						<a
							href={resolve(historyPath as `/org/${string}/duty-rosters/${string}/${string}`)}
							class="font-mono text-xs font-semibold uppercase tracking-[0.08em] text-primary hover:underline"
						>
							View All
						</a>
					</div>
					{#if recentAcceptedRuns.length > 0}
						<div class="mt-3 grid gap-1">
							{#each recentAcceptedRuns as run (run.id)}
								<a
									href={resolve(
										`${historyPath}/${run.id}` as `/org/${string}/duty-rosters/${string}/history/${string}`
									)}
									class="flex items-center justify-between gap-3 rounded px-3 py-2 text-sm text-foreground no-underline hover:bg-muted/40"
								>
									<span>{dayMonthLabel(run.startDate)} to {dayMonthLabel(run.endDate)}</span>
									<strong class="font-mono text-xs uppercase"
										>{run.status === 'invalidated' ? 'Invalidated' : 'Accepted'}</strong
									>
									<small class="text-muted-foreground">{dateParts(run.acceptedAt.slice(0, 10)).label}</small>
								</a>
							{/each}
						</div>
					{:else}
						<p class="mt-3 text-sm text-muted-foreground">No accepted runs yet.</p>
					{/if}
				</section>
			</div>
		</div>
	{:else}
		<div class="grid gap-4">
			{#if generatingPreview}
				<div class="py-8" aria-label="Generating Duty Roster preview">
					<SkeletonGrid rows={4} columns={3} />
				</div>
			{/if}

			<div class="flex flex-wrap items-center justify-between gap-4" aria-label="Generated preview summary">
				<p
					class="flex flex-wrap items-center gap-2 font-mono text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground"
				>
					Preview <span class="text-foreground"
						>{dayMonthLabel(generateStartDate)} to {dayMonthLabel(generateEndDate)}</span
					>
					<span>{preview.rosterRows.length} duty dates</span>
				</p>
				<div class="flex flex-wrap items-center gap-3" aria-label="Draft preview and official run actions">
					<div class="flex items-center gap-2">
						<span class="font-mono text-[0.7rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground"
							>Draft</span
						>
						<Button variant="outline" size="sm" type="button" onclick={() => printDraftPreview(preview)}>
							<Printer size={16} aria-hidden="true" />
							Print Draft
						</Button>
					</div>
					<div class="flex items-center gap-2">
						<span class="font-mono text-[0.7rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground"
							>Official</span
						>
						<form class="flex items-center gap-2" method="POST" action={acceptPreviewAction}>
							<input type="hidden" name="preview" value={previewReview?.previewPayload ?? ''} />
							<Button variant="outline" size="sm" type="submit">
								<CheckCircle2 size={16} aria-hidden="true" />
								Accept
							</Button>
							<Button variant="outline" size="sm" type="submit" name="intent" value="print">
								<Printer size={16} aria-hidden="true" />
								Accept + Print
							</Button>
							<Button size="sm" type="submit" formaction={applyPreviewAction}>
								<Calendar size={16} aria-hidden="true" />
								Accept + Apply
							</Button>
						</form>
					</div>
				</div>
			</div>

			<div class="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
				<Tabs.Root bind:value={previewMode}>
					<Tabs.List aria-label="Preview review mode">
						<Tabs.Trigger value="list">List View</Tabs.Trigger>
						<Tabs.Trigger value="matrix">DA6 Matrix</Tabs.Trigger>
					</Tabs.List>
				</Tabs.Root>
				<p class="flex items-center gap-1.5 text-sm text-muted-foreground">
					<Info size={15} aria-hidden="true" /> Accept writes official DA6 history. Accept + Apply also creates Calendar events.
				</p>
			</div>

			<section
				class="grid gap-3 rounded-md border border-border p-4 lg:grid-cols-[minmax(0,1fr)_auto_auto]"
				aria-labelledby="preview-readiness-heading"
			>
				<div
					class="rounded-md px-4 py-3"
					class:bg-success-muted={previewIsCommitReady}
					class:bg-warning-muted={!previewIsCommitReady}
				>
					<span class="font-mono text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground"
						>Commit Readiness</span
					>
					<h3
						id="preview-readiness-heading"
						class="mt-1 font-display text-base font-bold uppercase tracking-wide text-foreground"
					>
						{previewIsCommitReady ? 'Ready to accept' : 'Review before accepting'}
					</h3>
					<p class="mt-1 text-sm text-muted-foreground">
						{#if previewIsCommitReady}
							No unassigned dates or warnings remain. Official run actions can be used with confidence.
						{:else}
							Resolve unassigned dates and review warnings before writing official DA6 history.
						{/if}
					</p>
				</div>
				<div class="grid grid-cols-2 gap-4 sm:grid-cols-4" aria-label="Run summary">
					<div class="grid gap-0.5 text-center">
						<span class="font-mono text-[0.65rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground"
							>Run Window</span
						>
						<strong class="text-sm font-bold text-foreground"
							>{dayMonthLabel(generateStartDate)} to {dayMonthLabel(generateEndDate)}</strong
						>
					</div>
					<div class="grid gap-0.5 text-center">
						<span class="font-mono text-[0.65rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground"
							>Duty Dates</span
						>
						<strong class="text-sm font-bold text-foreground">{preview.rosterRows.length}</strong>
					</div>
					<div class="grid gap-0.5 text-center">
						<span class="font-mono text-[0.65rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground"
							>Automatic</span
						>
						<strong class="text-sm font-bold text-foreground">{previewAssignedCount}</strong>
					</div>
					<div class="grid gap-0.5 text-center">
						<span class="font-mono text-[0.65rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground"
							>Manual</span
						>
						<strong class="text-sm font-bold text-foreground">{previewManualCount}</strong>
					</div>
				</div>
				<div class="grid grid-cols-2 gap-4" aria-label="Unresolved review counts">
					<div class="grid gap-0.5 text-center">
						<span class="font-mono text-[0.65rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground"
							>Requires Action</span
						>
						<strong class="text-sm font-bold text-foreground">{previewRequiresActionCount}</strong>
					</div>
					<div class="grid gap-0.5 text-center">
						<span class="font-mono text-[0.65rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground"
							>Warnings</span
						>
						<strong class="text-sm font-bold text-foreground">{previewWarningCount}</strong>
					</div>
				</div>
			</section>

			{#if actionForm?.manualError}
				<p
					class="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive"
					role="alert"
				>
					{actionForm.manualError}
				</p>
			{/if}

			{#if previewMode === 'list'}
				<div class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,22rem)]">
					<section aria-labelledby="preview-list-heading">
						<h4 id="preview-list-heading" class="sr-only">Preview list</h4>
						<div
							class="overflow-hidden rounded-md border border-border"
							role="table"
							aria-label="Generated Duty Roster preview"
						>
							<div
								class="grid grid-cols-[8rem_minmax(0,1fr)_10rem_6rem] border-b border-border bg-muted/50 font-mono text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground"
								role="row"
							>
								<span class="px-3 py-2.5" role="columnheader">Date</span>
								<span class="px-3 py-2.5" role="columnheader">Assignment</span>
								<span class="px-3 py-2.5" role="columnheader">Review</span>
								<span class="px-3 py-2.5" role="columnheader">Action</span>
							</div>
							{#each previewReview?.rows ?? [] as row (row.date)}
								{@const parts = dateParts(row.date)}
								<div
									class={[
										'grid grid-cols-[8rem_minmax(0,1fr)_10rem_6rem] border-b border-border last:border-b-0',
										row.date === activePreviewDate && 'bg-primary/5'
									]}
									role="row"
								>
									<span class="flex flex-col px-3 py-2" role="cell">
										<strong class="font-mono text-xs font-bold text-foreground">{parts.weekday}</strong>
										<small class="text-xs text-muted-foreground">{parts.label}</small>
									</span>
									<div class="flex flex-col justify-center px-3 py-2" role="cell">
										{#if row.finalAssignee}
											<strong class="text-sm font-medium text-foreground">
												{row.finalAssignee.rank}
												{row.finalAssignee.lastName}, {row.finalAssignee.firstName}
											</strong>
										{:else}
											<span class="text-sm text-muted-foreground">{row.unfilledReason}</span>
										{/if}
										{#if row.manualSelection && row.generatedAssignee}
											<small class="text-xs text-muted-foreground">
												Generated {row.generatedAssignee.rank}
												{row.generatedAssignee.lastName}, {row.generatedAssignee.firstName}
											</small>
										{/if}
									</div>
									<span class="flex flex-col justify-center gap-1 px-3 py-2" role="cell">
										{#if row.liveWarnings.length > 0}
											<Badge variant="danger">Review</Badge>
											<details class="text-xs">
												<summary
													class="flex cursor-pointer items-center gap-1 text-muted-foreground hover:text-foreground"
												>
													<AlertTriangle size={15} aria-hidden="true" />
													{row.liveWarnings.length}
													{row.liveWarnings.length === 1 ? 'warning' : 'warnings'}
												</summary>
												<ul
													class="mt-1 grid gap-0.5 pl-4 text-muted-foreground"
													aria-label={`Warnings for ${parts.weekday} ${parts.label}`}
												>
													{#each row.liveWarnings as warning (warning)}
														<li>{warning}</li>
													{/each}
												</ul>
											</details>
										{:else if row.manualSelection}
											<Badge variant="warning">Manual</Badge>
											<small class="text-xs text-muted-foreground">Changed</small>
										{:else if !row.finalAssignee}
											<Badge variant="danger">Requires action</Badge>
											<small class="text-xs text-muted-foreground">No selection</small>
										{:else}
											<Badge variant="success">Ready</Badge>
											<small class="text-xs text-muted-foreground">No changes</small>
										{/if}
									</span>
									<div class="flex items-center px-3 py-2" role="cell">
										<Button
											variant="link"
											size="sm"
											type="button"
											aria-label={`${row.liveWarnings.length > 0 ? 'Review warning and change assignment' : 'Change assignment'} for ${parts.weekday} ${parts.label}`}
											onclick={() => openManualChange(row)}
										>
											{row.liveWarnings.length > 0 ? 'Review' : 'Change'}
										</Button>
									</div>
								</div>
							{/each}
						</div>
					</section>

					<aside
						class="grid content-start gap-4 rounded-md border border-border bg-muted/15 p-4"
						class:ring-2={Boolean(activePreviewRow)}
						class:ring-ring={Boolean(activePreviewRow)}
						aria-labelledby="manual-change-heading"
					>
						{#if activePreviewRow}
							{@const activeParts = dateParts(activePreviewRow.date)}
							<div class="flex items-start justify-between gap-3">
								<div>
									<h3
										id="manual-change-heading"
										class="font-display text-base font-bold uppercase tracking-wide text-foreground"
									>
										Change Assignment
									</h3>
									<p class="mt-1 text-sm text-muted-foreground">{activeParts.weekday} {activeParts.label}</p>
								</div>
								<Button
									variant="ghost"
									size="sm"
									type="button"
									class="h-7 w-7 p-0"
									aria-label="Close change assignment"
									onclick={() => (activePreviewDate = null)}
								>
									<X size={16} aria-hidden="true" />
								</Button>
							</div>
							<div class="grid gap-1 border-t border-border pt-3">
								<span class="font-mono text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground"
									>Current Selection</span
								>
								<strong class="text-sm text-foreground">
									{#if activePreviewRow.finalAssignee}
										{activePreviewRow.finalAssignee.rank}
										{activePreviewRow.finalAssignee.lastName}, {activePreviewRow.finalAssignee.firstName}
									{:else}
										No final selection
									{/if}
								</strong>
							</div>
							<div class="grid gap-1">
								<span class="font-mono text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground"
									>Generated Selection</span
								>
								<strong class="text-sm text-foreground">
									{#if activePreviewRow.generatedAssignee}
										{activePreviewRow.generatedAssignee.rank}
										{activePreviewRow.generatedAssignee.lastName}, {activePreviewRow.generatedAssignee.firstName}
									{:else}
										No generated selection
									{/if}
								</strong>
							</div>
							{#if activePreviewRow.manualSelection?.reason}
								<div class="grid gap-1">
									<span class="font-mono text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground"
										>Saved Reason</span
									>
									<p class="text-sm text-muted-foreground">{activePreviewRow.manualSelection.reason}</p>
								</div>
							{/if}
							<form class="grid gap-4 border-t border-border pt-3" method="POST" action={manualPreviewAction}>
								<input type="hidden" name="preview" value={previewReview?.previewPayload ?? ''} />
								<input type="hidden" name="date" value={activePreviewRow.date} />
								<input type="hidden" name="startDate" value={generateStartDate} />
								<input type="hidden" name="endDate" value={generateEndDate} />
								<input
									type="hidden"
									name="assigneeId"
									value={selectedPreviewAssignees[activePreviewRow.date] ?? activePreviewRow.editAssigneeId}
								/>
								<label
									class="grid gap-1 font-mono text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground"
								>
									<span>Select Replacement Soldier</span>
									<SearchCombobox
										options={previewReview?.selectionOptions ?? []}
										value={selectedPreviewAssignees[activePreviewRow.date] ?? activePreviewRow.editAssigneeId}
										ariaLabel={`Select Soldier for ${activeParts.weekday} ${activeParts.label}`}
										placeholder="Search by name..."
										clearable={false}
										onchange={(value) => {
											selectedPreviewAssignees = { ...selectedPreviewAssignees, [activePreviewRow.date]: value };
										}}
									/>
								</label>
								<div
									class="grid gap-2 rounded-md bg-muted/30 px-3 py-2"
									role="region"
									aria-live="polite"
									aria-labelledby="warning-summary-heading"
								>
									<span class="font-mono text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground"
										>Warning Summary</span
									>
									{#if activePreviewRow.liveWarnings.length > 0}
										<p id="warning-summary-heading" class="text-sm text-muted-foreground">
											Review these warnings before saving a manual change.
										</p>
										{#each activePreviewRow.liveWarnings as warning (warning)}
											<p class="flex items-center gap-1.5 text-sm text-warning-foreground">
												<AlertTriangle size={15} aria-hidden="true" />
												{warning}
											</p>
										{/each}
									{:else}
										<p id="warning-summary-heading" class="flex items-center gap-1.5 text-sm text-success-foreground">
											<CheckCircle2 size={15} aria-hidden="true" /> No warnings for selected replacement.
										</p>
									{/if}
								</div>
								{#if activePreviewRow.liveWarnings.length > 0}
									<label
										class="grid gap-1 font-mono text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground"
									>
										<span>Reason</span>
										<Textarea
											name="reason"
											placeholder="Enter reason for this manual change..."
											required
											value={activePreviewRow.manualSelection?.reason ?? ''}
										/>
									</label>
								{:else}
									<input type="hidden" name="reason" value="" />
								{/if}
								<Button type="submit">
									<Save size={16} aria-hidden="true" />
									Save Manual Change
								</Button>
								<Button variant="outline" type="button" onclick={() => (activePreviewDate = null)}>Cancel</Button>
							</form>
							<p class="flex items-center gap-1.5 text-xs text-muted-foreground">
								<Info size={15} aria-hidden="true" /> Archived or missing personnel cannot be selected.
							</p>
						{:else}
							<h3
								id="manual-change-heading"
								class="font-display text-base font-bold uppercase tracking-wide text-foreground"
							>
								Change Assignment
							</h3>
							<p class="text-sm text-muted-foreground">
								Select Review or Change on a preview row to review replacements.
							</p>
						{/if}
					</aside>
				</div>
			{/if}

			{#if previewMode === 'matrix'}
				<div class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,20rem)]">
					<section aria-labelledby="preview-matrix-heading">
						<h4 id="preview-matrix-heading" class="sr-only">DA6 matrix</h4>
						<OperationalMatrix.Root rows={previewMatrixRows} columns={previewMatrixColumns} readOnly>
							<OperationalMatrix.Viewport
								ariaLabel="DA6 preview matrix viewport"
								class="rounded-lg border border-border bg-card"
							>
								<OperationalMatrix.Table
									ariaLabel="DA6 preview matrix"
									class="min-w-max table-fixed text-sm [&_[data-matrix-cell]]:h-10 [&_[data-matrix-cell]]:w-10 [&_[data-matrix-cell]]:border [&_[data-matrix-cell]]:border-border [&_[data-matrix-cell]]:p-0 [&_[data-matrix-column-header]]:border [&_[data-matrix-column-header]]:border-border [&_[data-matrix-column-header]]:bg-muted/70 [&_[data-slot=operational-matrix-cell-content]]:grid [&_[data-slot=operational-matrix-cell-content]]:h-10 [&_[data-slot=operational-matrix-cell-content]]:place-items-center"
								>
									<OperationalMatrix.Header>
										<OperationalMatrix.HeaderRow>
											<OperationalMatrix.CornerCell
												sticky
												class="sticky left-0 top-0 z-30 min-w-40 bg-muted px-3 text-left"
											>
												Rank / Name
											</OperationalMatrix.CornerCell>
											{#each previewMatrixColumns as column (column.id)}
												<OperationalMatrix.ColumnHeader
													{column}
													orientation="vertical"
													sticky
													class="sticky top-0 z-20 bg-muted"
												/>
											{/each}
										</OperationalMatrix.HeaderRow>
									</OperationalMatrix.Header>
									<OperationalMatrix.Body>
										{#each previewMatrixRows as row (row.id)}
											<OperationalMatrix.Row {row} class="bg-card hover:bg-muted/20">
												<OperationalMatrix.RowHeader
													{row}
													sticky
													class="sticky left-0 z-10 min-w-40 border border-border bg-card px-3 py-2 text-left font-medium"
												>
													{row.label}
												</OperationalMatrix.RowHeader>
												{#each previewMatrixColumns as column (column.id)}
													{@const cell = previewMatrixCell(row, column)}
													<OperationalMatrix.Cell
														{row}
														{column}
														readOnly
														class={[
															cell?.tone === 'assigned' && 'bg-success-muted text-success-foreground',
															cell?.tone === 'warning' && 'bg-warning-muted text-warning-foreground',
															cell?.tone === 'danger' && 'bg-danger-muted text-danger-foreground'
														]}
													>
														<span class="font-mono text-xs font-semibold">{cell?.display ?? '-'}</span>
													</OperationalMatrix.Cell>
												{/each}
											</OperationalMatrix.Row>
										{/each}
									</OperationalMatrix.Body>
								</OperationalMatrix.Table>
							</OperationalMatrix.Viewport>
						</OperationalMatrix.Root>
					</section>
					<aside
						class="grid content-start gap-5 rounded-md border border-border bg-muted/15 p-4"
						aria-label="DA6 preview details"
					>
						<section class="grid gap-3">
							<h3 class="font-display text-base font-bold uppercase tracking-wide text-foreground">DA6 Legend</h3>
							<dl class="grid gap-2">
								<div class="grid grid-cols-[minmax(3rem,auto)_minmax(0,1fr)] items-baseline gap-3">
									<dt class="font-mono text-[0.75rem] font-bold uppercase text-foreground">X</dt>
									<dd class="text-[0.92rem] leading-snug text-muted-foreground">Assigned duty</dd>
								</div>
								<div class="grid grid-cols-[minmax(3rem,auto)_minmax(0,1fr)] items-baseline gap-3">
									<dt class="font-mono text-[0.75rem] font-bold uppercase text-foreground">1-10</dt>
									<dd class="text-[0.92rem] leading-snug text-muted-foreground">DA6 count</dd>
								</div>
								<div class="grid grid-cols-[minmax(3rem,auto)_minmax(0,1fr)] items-baseline gap-3">
									<dt class="font-mono text-[0.75rem] font-bold uppercase text-foreground">A</dt>
									<dd class="text-[0.92rem] leading-snug text-muted-foreground">Authorized absence</dd>
								</div>
								<div class="grid grid-cols-[minmax(3rem,auto)_minmax(0,1fr)] items-baseline gap-3">
									<dt class="font-mono text-[0.75rem] font-bold uppercase text-foreground">D</dt>
									<dd class="text-[0.92rem] leading-snug text-muted-foreground">Other duty</dd>
								</div>
								<div class="grid grid-cols-[minmax(3rem,auto)_minmax(0,1fr)] items-baseline gap-3">
									<dt class="font-mono text-[0.75rem] font-bold uppercase text-foreground">U</dt>
									<dd class="text-[0.92rem] leading-snug text-muted-foreground">Unavailable</dd>
								</div>
							</dl>
							<p class="text-sm text-muted-foreground">
								Highlighted cells flag assigned duty, authorized absence, and chargeable duty conflicts.
							</p>
						</section>
						<section class="grid gap-3 border-t border-border pt-4">
							<h3 class="font-display text-base font-bold uppercase tracking-wide text-foreground">Run Summary</h3>
							<dl class="grid gap-2">
								<div class="grid grid-cols-[minmax(3rem,auto)_minmax(0,1fr)] items-baseline gap-3">
									<dt class="font-mono text-[0.75rem] font-bold uppercase text-foreground">Template</dt>
									<dd class="text-[0.92rem] leading-snug text-muted-foreground">
										{selectedTemplate.shortCode ?? selectedTemplate.name}
									</dd>
								</div>
								<div class="grid grid-cols-[minmax(3rem,auto)_minmax(0,1fr)] items-baseline gap-3">
									<dt class="font-mono text-[0.75rem] font-bold uppercase text-foreground">Pool</dt>
									<dd class="text-[0.92rem] leading-snug text-muted-foreground">
										{countReadModel?.sourceLabel ?? 'DA6 roster order'}
									</dd>
								</div>
								<div class="grid grid-cols-[minmax(3rem,auto)_minmax(0,1fr)] items-baseline gap-3">
									<dt class="font-mono text-[0.75rem] font-bold uppercase text-foreground">Dates</dt>
									<dd class="text-[0.92rem] leading-snug text-muted-foreground">
										{dayMonthLabel(generateStartDate)} to {dayMonthLabel(generateEndDate)}
									</dd>
								</div>
								<div class="grid grid-cols-[minmax(3rem,auto)_minmax(0,1fr)] items-baseline gap-3">
									<dt class="font-mono text-[0.75rem] font-bold uppercase text-foreground">Rosters</dt>
									<dd class="text-[0.92rem] leading-snug text-muted-foreground">{preview.rosterRows.length} days</dd>
								</div>
								<div class="grid grid-cols-[minmax(3rem,auto)_minmax(0,1fr)] items-baseline gap-3">
									<dt class="font-mono text-[0.75rem] font-bold uppercase text-foreground">Soldiers</dt>
									<dd class="text-[0.92rem] leading-snug text-muted-foreground">{preview.da6.rows.length}</dd>
								</div>
								<div class="grid grid-cols-[minmax(3rem,auto)_minmax(0,1fr)] items-baseline gap-3">
									<dt class="font-mono text-[0.75rem] font-bold uppercase text-foreground">Assigned</dt>
									<dd class="text-[0.92rem] leading-snug text-muted-foreground">{previewAssignedCount}</dd>
								</div>
								<div class="grid grid-cols-[minmax(3rem,auto)_minmax(0,1fr)] items-baseline gap-3">
									<dt class="font-mono text-[0.75rem] font-bold uppercase text-foreground">Unassigned</dt>
									<dd class="text-[0.92rem] leading-snug text-muted-foreground">{previewRequiresActionCount}</dd>
								</div>
							</dl>
						</section>
						<section class="grid gap-2 border-t border-border pt-4">
							<h3 class="font-display text-base font-bold uppercase tracking-wide text-foreground">Warnings</h3>
							<p class="flex items-center gap-2 text-sm text-foreground">
								<AlertTriangle size={16} aria-hidden="true" />
								{previewWarningCount}
							</p>
						</section>
						<section class="border-t border-border pt-4">
							<Button variant="ghost" size="sm" type="button" onclick={() => printDraftPreview(preview)}>
								<Printer size={16} aria-hidden="true" />
								Print DA6 draft
							</Button>
						</section>
					</aside>
				</div>
			{/if}
		</div>
	{/if}
</div>
