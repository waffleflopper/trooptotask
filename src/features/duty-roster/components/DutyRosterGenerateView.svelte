<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { AlertTriangle, Calendar, CheckCircle2, Info, Pencil, Printer, Save, X } from '@lucide/svelte';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import * as ButtonGroup from '$lib/components/ui/button-group';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import * as Combobox from '$lib/components/ui/combobox';
	import { Label } from '$lib/components/ui/label';
	import * as Select from '$lib/components/ui/select';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import * as Tabs from '$lib/components/ui/tabs';
	import { Textarea } from '$lib/components/ui/textarea';
	import { printDutyRosterForBrowser } from '$features/duty-roster/export/dutyRosterBrowserExport';
	import {
		buildDutyRosterAcceptedRunReviewModel,
		buildDutyRosterPreviewReviewModel,
		type DutyRosterPreviewReviewModel
	} from '$features/duty-roster/workspace/dutyRosterPreviewReview';
	import {
		DA6Matrix,
		DateRangeControls,
		DutyRosterStatusBadge,
		WarningSummary,
		type DA6MatrixCell,
		type DA6MatrixColumn,
		type DA6MatrixFooterRow,
		type DA6MatrixMetadataItem,
		type DA6MatrixRow
	} from '$features/duty-roster/components/shared';
	import type { DutyRosterTemplateAcceptedRun } from '$features/duty-roster/templates/dutyRosterTemplates';
	import type { DutyRosterTemplatePreview } from '$features/duty-roster/templates/dutyRosterTemplatePreview';
	import type {
		DutyRosterGenerateWorkspaceModel,
		DutyRosterGenerationPattern
	} from '$features/duty-roster/workspace/dutyRosterWorkspaceReadModel';

	let { generate }: { generate: DutyRosterGenerateWorkspaceModel } = $props();

	type PreviewDa6MatrixCell = NonNullable<DutyRosterPreviewReviewModel['matrix']['rows'][number]['cells'][number]>;
	type GenerationPatternOption = { value: DutyRosterGenerationPattern; label: string };

	const generationPatternOptions: GenerationPatternOption[] = [
		{ value: 'daily', label: 'Daily' },
		{ value: 'weekday-only', label: 'Weekdays only' },
		{ value: 'weekend-only', label: 'Weekends only' },
		{ value: 'selected-weekdays', label: 'Selected weekdays' }
	];
	const weekdayOptions = [
		{ value: '1', label: 'Mon' },
		{ value: '2', label: 'Tue' },
		{ value: '3', label: 'Wed' },
		{ value: '4', label: 'Thu' },
		{ value: '5', label: 'Fri' },
		{ value: '6', label: 'Sat' },
		{ value: '0', label: 'Sun' }
	];
	const weekdayPreset = ['1', '2', '3', '4', '5'];
	const weekendPreset = ['0', '6'];

	let previewMode = $state<'list' | 'matrix'>('list');
	let generatingPreview = $state(false);
	let activePreviewDate = $state<string | null>(null);
	let selectedPreviewAssignees = $state<Record<string, string>>({});
	let startDateOverride = $state('');
	let endDateOverride = $state('');
	let generationPattern = $state<DutyRosterGenerationPattern>('daily');
	let selectedWeekdayValues = $state<string[]>([...weekdayPreset]);
	let skipHolidaysAndDonsas = $state(false);
	let syncedGenerationSettings = $state('');
	let pendingOfficialAction = $state<'accept' | 'print' | 'apply' | null>(null);

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
	const selectedWeekdaySet = $derived(new Set(selectedWeekdayValues));
	const canSubmitGenerate = $derived(
		canGenerate && (generationPattern !== 'selected-weekdays' || selectedWeekdayValues.length > 0)
	);
	const generationPatternLabel = $derived(
		generationPatternOptions.find((option) => option.value === generationPattern)?.label ?? 'Daily'
	);
	$effect(() => {
		const nextSettings = JSON.stringify({
			pattern: generate.generationPattern,
			selectedWeekdays: generate.selectedWeekdays,
			skipHolidaysAndDonsas: generate.skipHolidaysAndDonsas
		});
		if (syncedGenerationSettings !== nextSettings) {
			generationPattern = generate.generationPattern;
			selectedWeekdayValues = weekdayValuesFromNumbers(generate.selectedWeekdays);
			skipHolidaysAndDonsas = generate.skipHolidaysAndDonsas;
			syncedGenerationSettings = nextSettings;
		}
	});
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

	const previewMatrixColumns = $derived<DA6MatrixColumn[]>(
		(previewReview?.matrix.columns ?? []).map((column) => ({
			id: column.date,
			weekday: dateParts(column.date).weekday,
			date: dayMonthLabel(column.date),
			sequenceKind: da6SequenceKind(column.sequenceKind)
		}))
	);
	const previewMatrixRows = $derived<DA6MatrixRow[]>(
		(previewReview?.matrix.rows ?? []).map((row) => ({
			id: row.personnelId,
			label: row.soldierLabel
		}))
	);
	const previewMatrixCells = $derived<Record<string, Record<string, DA6MatrixCell>>>(
		Object.fromEntries(
			(previewReview?.matrix.rows ?? []).map((row) => [
				row.personnelId,
				Object.fromEntries(row.cells.map((cell) => [cell.date, toSharedDa6Cell(row.soldierLabel, cell)]))
			])
		)
	);
	const previewMatrixFooterRows = $derived<DA6MatrixFooterRow[]>([
		{
			label: 'Assigned Count',
			values: Object.fromEntries(
				(previewReview?.matrix.columns ?? []).map((column) => [
					column.date,
					previewReview?.rows.filter((row) => row.date === column.date && row.finalAssignee).length ?? 0
				])
			)
		},
		{
			label: 'Required Count',
			values: Object.fromEntries(
				(previewReview?.matrix.columns ?? []).map((column) => [column.date, column.chargeableCount])
			)
		}
	]);
	const previewMatrixMetadata = $derived<DA6MatrixMetadataItem[]>([
		{ label: 'Duty Position', value: selectedTemplate.name },
		{ label: 'Date Range', value: `${dayMonthLabel(generateStartDate)} to ${dayMonthLabel(generateEndDate)}` },
		{ label: 'Pool Size', value: String(countReadModel?.rows.length ?? 0) },
		{ label: 'Generated On', value: preview?.generatedAt ? dateParts(preview.generatedAt.slice(0, 10)).label : '-' },
		{ label: 'Roster Type', value: 'Daily' },
		{ label: 'Template', value: `${selectedTemplate.name} (${selectedTemplate.status})` }
	]);

	function handleGenerateEnhance() {
		generatingPreview = true;

		return async ({ update }: { update: () => Promise<void> }) => {
			await update();
			generatingPreview = false;
		};
	}

	function weekdayValuesFromNumbers(values: number[]): string[] {
		return values.map((value) => String(value));
	}

	function setSelectedWeekdayPreset(values: string[]): void {
		selectedWeekdayValues = [...values];
	}

	function toggleSelectedWeekday(value: string): void {
		selectedWeekdayValues = selectedWeekdaySet.has(value)
			? selectedWeekdayValues.filter((candidate) => candidate !== value)
			: [...selectedWeekdayValues, value].sort((left, right) => Number(left) - Number(right));
	}

	function resetGenerationSetup(): void {
		startDateOverride = '';
		endDateOverride = '';
		generationPattern = generate.generationPattern;
		selectedWeekdayValues = weekdayValuesFromNumbers(generate.selectedWeekdays);
		skipHolidaysAndDonsas = generate.skipHolidaysAndDonsas;
	}

	function enhancePostForm(formElement: HTMLFormElement, submit: SubmitFunction) {
		formElement.method = 'post';
		return enhance(formElement, submit);
	}

	type AcceptPreviewActionData = {
		acceptedRun?: DutyRosterTemplateAcceptedRun;
		printAcceptedRun?: boolean;
	};

	function handleOfficialRunEnhance({ submitter }: { submitter: HTMLElement | null }) {
		const intent = submitter instanceof HTMLButtonElement ? submitter.value : '';
		const formaction = submitter instanceof HTMLButtonElement ? submitter.getAttribute('formaction') : null;
		pendingOfficialAction = formaction ? 'apply' : intent === 'print' ? 'print' : 'accept';

		return async ({
			result,
			update
		}: {
			result: { type: string; data?: AcceptPreviewActionData };
			update: () => Promise<void>;
		}) => {
			await update();

			if (result.type === 'success' && result.data?.printAcceptedRun && result.data.acceptedRun) {
				printDutyRosterForBrowser({
					acceptedSnapshot: buildDutyRosterAcceptedRunReviewModel({
						run: result.data.acceptedRun,
						isLatestRun: true
					}).snapshot,
					statusLabel: 'Official'
				});
			}

			pendingOfficialAction = null;
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

	function toSharedDa6Cell(soldierLabel: string, cell: PreviewDa6MatrixCell): DA6MatrixCell {
		const kind =
			cell.tone === 'assigned'
				? 'assigned'
				: cell.tone === 'warning'
					? 'manual-override'
					: cell.tone === 'danger'
						? 'blocked'
						: cell.display === 'A' || cell.display === 'EX'
							? 'exempt'
							: 'not-assigned';

		return {
			display: cell.display ?? '-',
			kind,
			ariaLabel: `${soldierLabel} ${formatDutyDateLabel(cell.date)}: ${cell.display ?? 'not assigned'}`,
			chargeable: cell.chargeable,
			count: cell.sequenceNumber,
			reason: cell.reason
		};
	}

	function da6SequenceKind(
		sequenceKind: 'weekday' | 'weekend' | 'holiday' | 'weekend-holiday'
	): DA6MatrixColumn['sequenceKind'] {
		return sequenceKind === 'weekday' ? 'weekday' : 'weekend-holiday';
	}

	function formatDutyDateLabel(date: string): string {
		const parts = dateParts(date);
		return `${parts.weekday} ${parts.label}`;
	}
</script>

<h2 id="template-view-heading" class="sr-only">Generate Duty Roster preview</h2>

{#if actionForm?.generateError}
	<WarningSummary tone="destructive" title="Preview generation failed" description={actionForm.generateError} />
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
						method="post"
						action={generateAction}
						use:enhance={handleGenerateEnhance}
					>
						<input type="hidden" name="templateId" value={selectedTemplate.id} />
						<input type="hidden" name="startDate" value={startDateValue} />
						<input type="hidden" name="endDate" value={endDateValue} />
						<input type="hidden" name="pattern" value={generationPattern} />
						<input type="hidden" name="skipHolidaysAndDonsas" value={String(skipHolidaysAndDonsas)} />
						{#if generationPattern === 'selected-weekdays'}
							{#each selectedWeekdayValues as weekday (weekday)}
								<input type="hidden" name="selectedWeekdays" value={weekday} />
							{/each}
						{/if}
						<DateRangeControls
							startDate={startDateValue}
							endDate={endDateValue}
							rangeLabel={`${dateParts(startDateValue).label} to ${dateParts(endDateValue).label}`}
							onStartDateChange={(value) => (startDateOverride = value)}
							onEndDateChange={(value) => (endDateOverride = value)}
						/>
						<div class="grid gap-4 border-t border-border pt-4">
							<div class="grid gap-2 sm:max-w-xs">
								<Label
									id="generation-pattern-label"
									class="font-mono text-xs font-semibold uppercase tracking-[0.08em]"
								>
									Run pattern
								</Label>
								<Select.Root type="single" bind:value={generationPattern}>
									<Select.Trigger class="w-full" aria-labelledby="generation-pattern-label">
										{generationPatternLabel}
									</Select.Trigger>
									<Select.Content>
										{#each generationPatternOptions as option (option.value)}
											<Select.Item value={option.value} label={option.label} />
										{/each}
									</Select.Content>
								</Select.Root>
							</div>
							{#if generationPattern === 'selected-weekdays'}
								<div class="grid gap-2">
									<div class="flex flex-wrap items-center justify-between gap-2">
										<Label class="font-mono text-xs font-semibold uppercase tracking-[0.08em]">Selected weekdays</Label>
										<div class="flex items-center gap-2">
											<Button
												variant="outline"
												size="xs"
												type="button"
												onclick={() => setSelectedWeekdayPreset(weekdayPreset)}
											>
												Weekdays
											</Button>
											<Button
												variant="outline"
												size="xs"
												type="button"
												onclick={() => setSelectedWeekdayPreset(weekendPreset)}
											>
												Weekends
											</Button>
										</div>
									</div>
									<ButtonGroup.Root class="flex-wrap" aria-label="Selected weekdays">
										{#each weekdayOptions as day (day.value)}
											<Button
												variant={selectedWeekdaySet.has(day.value) ? 'secondary' : 'outline'}
												size="sm"
												type="button"
												aria-pressed={selectedWeekdaySet.has(day.value)}
												onclick={() => toggleSelectedWeekday(day.value)}
											>
												{day.label}
											</Button>
										{/each}
									</ButtonGroup.Root>
									{#if selectedWeekdayValues.length === 0}
										<p class="text-sm text-destructive" role="alert">Select at least one weekday.</p>
									{/if}
								</div>
							{/if}
							<label class="flex items-start gap-3 rounded-md border border-border px-3 py-2 text-sm">
								<Checkbox
									checked={skipHolidaysAndDonsas}
									onCheckedChange={(checked) => (skipHolidaysAndDonsas = Boolean(checked))}
								/>
								<span class="grid gap-0.5">
									<span class="font-medium text-foreground">Do not assign duty on holidays or DONSAs</span>
									<span class="text-muted-foreground">Skips matching dates in this generated run.</span>
								</span>
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
					<Button
						variant="outline"
						type="reset"
						form="generate-preview-form"
						disabled={generatingPreview}
						onclick={resetGenerationSetup}
					>
						Reset
					</Button>
					<Button type="submit" form="generate-preview-form" disabled={!canSubmitGenerate || generatingPreview}>
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
						<Button
							variant="outline"
							size="sm"
							href={resolve(historyPath as `/org/${string}/duty-rosters/${string}/${string}`)}
						>
							View All
						</Button>
					</div>
					{#if recentAcceptedRuns.length > 0}
						<div class="mt-3 grid gap-1">
							{#each recentAcceptedRuns as run (run.id)}
								<a
									href={resolve(
										`${historyPath}/${run.id}` as `/org/${string}/duty-rosters/${string}/history/${string}`
									)}
									class="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 rounded-md border border-transparent px-3 py-2 text-sm text-foreground no-underline hover:border-border hover:bg-muted/40"
								>
									<span class="min-w-0 truncate">{dayMonthLabel(run.startDate)} to {dayMonthLabel(run.endDate)}</span>
									<Badge variant="secondary">{run.status === 'invalidated' ? 'Invalidated' : 'Accepted'}</Badge>
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
					<div class="grid grid-cols-3 gap-2" aria-hidden="true">
						{#each Array(12) as _, index (index)}
							<Skeleton class="h-[38px] w-[100px]" />
						{/each}
					</div>
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
						<form
							class="flex items-center gap-2"
							method="POST"
							action={acceptPreviewAction}
							use:enhancePostForm={handleOfficialRunEnhance}
						>
							<input type="hidden" name="preview" value={previewReview?.previewPayload ?? ''} />
							<Button variant="outline" size="sm" type="submit" disabled={pendingOfficialAction !== null}>
								<CheckCircle2 size={16} aria-hidden="true" />
								{pendingOfficialAction === 'accept' ? 'Accepting...' : 'Accept Run'}
							</Button>
							<Button
								variant="outline"
								size="sm"
								type="submit"
								name="intent"
								value="print"
								disabled={pendingOfficialAction !== null}
							>
								<Printer size={16} aria-hidden="true" />
								{pendingOfficialAction === 'print' ? 'Printing...' : 'Accept Run + Print'}
							</Button>
							<Button size="sm" type="submit" formaction={applyPreviewAction} disabled={pendingOfficialAction !== null}>
								<Calendar size={16} aria-hidden="true" />
								{pendingOfficialAction === 'apply' ? 'Applying...' : 'Accept + Apply to Calendar'}
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
					<Info size={15} aria-hidden="true" /> Accept Run writes official DA6 history. Accept + Apply to Calendar also creates
					Calendar events.
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
											variant={row.liveWarnings.length > 0 || !row.finalAssignee ? 'default' : 'secondary'}
											size="sm"
											type="button"
											aria-label={`${row.liveWarnings.length > 0 ? 'Review warning and change assignment' : 'Change assignment'} for ${parts.weekday} ${parts.label}`}
											onclick={() => openManualChange(row)}
										>
											<Pencil size={14} aria-hidden="true" />
											Edit
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
									<Combobox.Root
										items={previewReview?.selectionOptions ?? []}
										value={selectedPreviewAssignees[activePreviewRow.date] ?? activePreviewRow.editAssigneeId}
										label={`Select Soldier for ${activeParts.weekday} ${activeParts.label}`}
										onValueChange={(value) => {
											selectedPreviewAssignees = {
												...selectedPreviewAssignees,
												[activePreviewRow.date]: Array.isArray(value) ? (value[0] ?? '') : value
											};
										}}
										autoHighlight
									>
										<Combobox.Trigger
											aria-label={`Select Soldier for ${activeParts.weekday} ${activeParts.label}`}
											placeholder="Search by name..."
										/>
										<Combobox.Content>
											<Combobox.Search placeholder="Search by name..." />
											<Combobox.Empty>No Soldiers found.</Combobox.Empty>
											<Combobox.List />
										</Combobox.Content>
									</Combobox.Root>
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
					<DA6Matrix
						title="DA6 preview matrix"
						description="Draft DA Form 6 view for this generated roster preview."
						mode="draft"
						rows={previewMatrixRows}
						columns={previewMatrixColumns}
						cells={previewMatrixCells}
						footerRows={previewMatrixFooterRows}
						metadata={previewMatrixMetadata}
						warning={previewWarningCount > 0
							? `${previewWarningCount} preview warning needs review before acceptance.`
							: undefined}
					/>
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
							<DutyRosterStatusBadge status={previewWarningCount > 0 ? 'review' : 'ok'} />
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
