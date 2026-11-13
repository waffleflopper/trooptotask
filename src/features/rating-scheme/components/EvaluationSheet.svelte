<script lang="ts">
	import { onDestroy, untrack } from 'svelte';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import type { PersonnelLookup } from '$features/personnel/contracts';
	import type { EvaluationPatchValues, RatingSchemeMove, RatingSchemeRaterChange } from '../contracts';
	import type { Evaluation, EvaluatorChain, RatingScheme, ReportType } from '../rating-scheme.types';
	import { personEvaluations, waitingOnName } from '../utils/evalTracker';
	import {
		EVALUATION_PHASE_COUNT,
		evaluationPhase,
		isEvaluationCompleted,
		isWorkflowMoveAllowed,
		waitingOn,
		workflowMoves,
		workflowRoles,
		workflowStatusLabel,
		workflowStepList,
		type WorkflowMove
	} from '../utils/evaluationWorkflow';
	import { spokenPersonLabel } from '../utils/personLabel';
	import { getDaysUntilDue, getRatingDueStatus, getReportTypeLabel } from '../utils/ratingScheme';
	import { ratingDueTone } from '../utils/ratingDueTone';
	import { isEvaluationOpen, toRatingSchemeEntry } from '../utils/ratingSchemeEntries';
	import { reportPeriodProblem, type ReportPeriodDraft } from '../utils/reportPeriodDraft';
	import ChangeRaterDialog from './ChangeRaterDialog.svelte';
	import EvaluatorChainRows from './EvaluatorChainRows.svelte';
	import ReportPeriodFields from './ReportPeriodFields.svelte';
	import * as Alert from '$lib/components/ui/alert';
	import * as AppDialog from '$lib/components/ui/app-dialog';
	import { Button } from '$lib/components/ui/button';
	import { ConfirmDialog } from '$lib/components/ui/confirm-dialog';
	import * as Field from '$lib/components/ui/field';
	import { SegmentedProgress } from '$lib/components/ui/progress';
	import { Spinner } from '$lib/components/ui/spinner';
	import { Textarea } from '$lib/components/ui/textarea';
	import { toastStore } from '$lib/stores/toast.svelte';
	import { formatDayMonthShortYear } from '$lib/utils/dates';
	import { cn } from '$lib/utils';

	interface Props {
		orgId: string;
		/** The Evaluation as its host holds it now; a move replaces it. */
		evaluation: Evaluation;
		scheme: RatingScheme;
		personnel: PersonnelLookup[];
		/** Every Evaluation the host has loaded; the sheet lists the rated Person's own. */
		evaluations?: readonly Evaluation[];
		isCurrentWorkspace: () => boolean;
		onSave: (id: string, patch: EvaluationPatchValues, isCurrent: () => boolean) => Promise<void>;
		/** Resolves once the step moved; throws with the reason when it was refused. */
		onMove: (id: string, move: RatingSchemeMove, isCurrent: () => boolean) => Promise<void>;
		onChangeRater: (id: string, change: RatingSchemeRaterChange, isCurrent: () => boolean) => Promise<void>;
		/** Resolves true once deleted, or once a deletion request went in. */
		onDelete?: (id: string, isCurrent: () => boolean) => Promise<boolean>;
		onOpenEvaluation?: (id: string) => void;
		onClose: () => void;
	}

	let {
		orgId,
		evaluation,
		scheme,
		personnel,
		evaluations = [],
		isCurrentWorkspace,
		onSave,
		onMove,
		onChangeRater,
		onDelete,
		onOpenEvaluation,
		onClose
	}: Props = $props();
	let disposed = false;
	onDestroy(() => {
		disposed = true;
	});
	const isCurrent = () => !disposed && isCurrentWorkspace();

	const entry = $derived(toRatingSchemeEntry(scheme, evaluation));
	const roles = $derived(workflowRoles(entry));
	const status = $derived(evaluation.workflowStatus);
	const completed = $derived(isEvaluationCompleted(status));
	const phase = $derived(evaluationPhase(status));
	const moves = $derived(workflowMoves(status, roles));
	const steps = $derived(workflowStepList(roles));
	const at = $derived(steps.findIndex((step) => step.value === status));

	const rated = $derived(personnel.find((person) => person.id === evaluation.ratedPersonId));
	const ratedName = $derived(rated ? spokenPersonLabel(rated) : 'Unknown');
	const ratedShort = $derived(rated ? `${rated.rank} ${rated.lastName}` : 'This Soldier');
	const reportLabel = $derived(getReportTypeLabel(evaluation.reportType, entry.evalType));
	const waiting = $derived.by(() => {
		const role = waitingOn(status, roles);
		return role ? waitingOnName(role, entry, personnel) : null;
	});
	const history = $derived(personEvaluations(evaluations, evaluation.ratedPersonId));

	function initialDraft(from: Evaluation) {
		return {
			period: {
				reportType: from.reportType ?? '',
				ratingPeriodStart: from.ratingPeriodStart,
				ratingPeriodEnd: from.ratingPeriodEnd
			} satisfies ReportPeriodDraft as ReportPeriodDraft,
			notes: from.notes ?? ''
		};
	}
	// The draft starts from the Evaluation the sheet opened on; a move changes only the step.
	let draft = $state(initialDraft(untrack(() => evaluation)));

	const periodChanged = $derived(
		draft.period.reportType !== (evaluation.reportType ?? '') ||
			draft.period.ratingPeriodStart !== evaluation.ratingPeriodStart ||
			draft.period.ratingPeriodEnd !== evaluation.ratingPeriodEnd
	);
	const notesChanged = $derived(draft.notes.trim() !== (evaluation.notes ?? '').trim());
	const dirty = $derived((!completed && periodChanged) || notesChanged);

	let saving = $state(false);
	let moving = $state<string | null>(null);
	let deleting = $state(false);
	let saveAttempted = $state(false);
	let saveError = $state('');
	let moveError = $state('');
	let confirmingDelete = $state(false);
	let changingRater = $state(false);
	const busy = $derived(saving || moving !== null || deleting);
	const problem = $derived(saveAttempted && !completed ? reportPeriodProblem(draft.period) : null);

	const due = $derived.by(() => {
		if (completed) {
			const at = evaluation.signedChain?.signedAt;
			return {
				text: at ? `Completed ${formatDayMonthShortYear(at.slice(0, 10))}` : 'Completed',
				tone: ratingDueTone.current
			};
		}
		const dueStatus = getRatingDueStatus(evaluation.ratingPeriodEnd, status);
		const days = getDaysUntilDue(evaluation.ratingPeriodEnd);
		const count = (n: number) => `${n} ${n === 1 ? 'day' : 'days'}`;
		const text = days < 0 ? `${count(-days)} past thru` : days === 0 ? 'Thru today' : `Thru in ${count(days)}`;
		return { text, tone: ratingDueTone[dueStatus] };
	});

	const changeRaterLine = $derived(
		isEvaluationOpen(status) && scheme.archivedAt === null ? { ...scheme, open: evaluation } : null
	);

	function moveLabel(move: WorkflowMove): string {
		switch (move.kind) {
			case 'start':
				return 'Start tracking';
			case 'complete':
				return 'Mark completed';
			case 'stop':
				return 'Stop tracking';
			case 'reopen':
				return 'Reopen';
			case 'review':
				return 'Send to Command Review';
			case 'back':
				return `Back to ${workflowStatusLabel(move.to)}`;
			case 'next':
				return move.to === 'completed' ? 'Mark completed' : `Move to ${workflowStatusLabel(move.to)}`;
		}
	}

	function failure(error: unknown, fallback: string): string {
		return error instanceof Error && error.message.trim() ? error.message : fallback;
	}

	async function move(to: WorkflowMove['to'], key: string) {
		if (busy || dirty || !isCurrent()) return;
		moveError = '';
		moving = key;
		try {
			await onMove(evaluation.id, { from: status, to }, isCurrent);
		} catch (error) {
			if (isCurrent()) moveError = failure(error, 'The workflow did not move. Try again.');
		} finally {
			if (isCurrent()) moving = null;
		}
	}

	function patch(): EvaluationPatchValues {
		const values: EvaluationPatchValues = {};
		if (notesChanged) values.notes = draft.notes.trim() || null;
		if (completed) return values;
		if (draft.period.reportType !== (evaluation.reportType ?? '')) {
			values.reportType = (draft.period.reportType || null) as ReportType | null;
		}
		if (draft.period.ratingPeriodStart !== evaluation.ratingPeriodStart) {
			values.ratingPeriodStart = draft.period.ratingPeriodStart;
		}
		if (draft.period.ratingPeriodEnd !== evaluation.ratingPeriodEnd)
			values.ratingPeriodEnd = draft.period.ratingPeriodEnd;
		return values;
	}

	async function save() {
		saveAttempted = true;
		if (busy || !isCurrent()) return;
		if (!dirty) {
			onClose();
			return;
		}
		if (!completed && reportPeriodProblem(draft.period)) return;
		saveError = '';
		saving = true;
		try {
			await onSave(evaluation.id, patch(), isCurrent);
			if (!isCurrent()) return;
			toastStore.success('Evaluation saved');
			onClose();
		} catch (error) {
			if (isCurrent()) saveError = failure(error, 'The evaluation was not saved. Try again.');
		} finally {
			if (isCurrent()) saving = false;
		}
	}

	async function remove() {
		if (!onDelete || busy || !isCurrent()) return;
		deleting = true;
		try {
			const removed = await onDelete(evaluation.id, isCurrent);
			if (!isCurrent()) return;
			confirmingDelete = false;
			if (removed) onClose();
		} catch (error) {
			if (isCurrent()) toastStore.error(failure(error, 'The evaluation was not deleted. Try again.'));
		} finally {
			if (isCurrent()) deleting = false;
		}
	}

	async function changeRater(id: string, change: RatingSchemeRaterChange, isDialogCurrent: () => boolean) {
		await onChangeRater(id, change, isDialogCurrent);
		if (!isDialogCurrent()) return;
		toastStore.success('Rater changed. A new Annual opened at Drafting.');
		changingRater = false;
		onClose();
	}

	const ROLE_NAMES = [
		['rater', 'raterPersonId', 'raterName'],
		['intermediate rater', 'intermediateRaterPersonId', 'intermediateRaterName'],
		['senior rater', 'seniorRaterPersonId', 'seniorRaterName'],
		['reviewer', 'reviewerPersonId', 'reviewerName']
	] as const satisfies readonly (readonly [string, keyof EvaluatorChain, keyof EvaluatorChain])[];

	/** Where the scheme's chain has moved on from the one that signed: "The scheme's senior rater is now …". */
	const chainChanges = $derived.by(() => {
		const signed = evaluation.signedChain;
		if (!signed) return [];
		const name = (chain: EvaluatorChain, idKey: keyof EvaluatorChain, nameKey: keyof EvaluatorChain) => {
			const personId = chain[idKey];
			if (personId) {
				const person = personnel.find((candidate) => candidate.id === personId);
				return person ? spokenPersonLabel(person) : 'someone no longer in Personnel';
			}
			return chain[nameKey]?.trim() || null;
		};
		return ROLE_NAMES.flatMap(([role, idKey, nameKey]) => {
			if (signed[idKey] === scheme[idKey] && (signed[nameKey] ?? null) === (scheme[nameKey] ?? null)) return [];
			const now = name(scheme, idKey, nameKey);
			const then = name(signed, idKey, nameKey);
			if (!then) return [`The scheme now has a ${role}, ${now ?? 'Not set'}. This record was signed without one.`];
			return [
				now
					? `The scheme's ${role} is now ${now}. This record keeps ${then}, who signed it.`
					: `The scheme has no ${role} now. This record keeps ${then}, who signed it.`
			];
		});
	});

	const schemeHref = $derived(`/org/${orgId}/evals/rating-scheme?line=${scheme.id}`);
</script>

{#snippet sectionTitle(title: string, link?: { href: string; label: string })}
	<div class="flex items-baseline justify-between gap-3">
		<h3 class="font-mono text-[0.6875rem] leading-3.5 font-medium tracking-[0.08em] text-muted-foreground uppercase">
			{title}
		</h3>
		{#if link}
			<a
				href={link.href}
				class="rounded-sm text-[13px] underline underline-offset-4 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
			>
				{link.label}
			</a>
		{/if}
	</div>
{/snippet}

{#snippet historyRow(row: Evaluation, sr: string | null, viewing: boolean)}
	<span class="w-[30px] shrink-0 font-mono text-xs font-semibold">{row.reportType ?? '—'}</span>
	<span class="shrink-0 font-mono text-xs sm:w-[170px]">
		{formatDayMonthShortYear(row.ratingPeriodStart)} → {formatDayMonthShortYear(row.ratingPeriodEnd)}
	</span>
	<span class="min-w-0 flex-1 truncate text-[13px] text-muted-foreground max-sm:hidden">
		{isEvaluationCompleted(row.workflowStatus) ? (sr ? `SR ${sr}` : '') : workflowStatusLabel(row.workflowStatus)}
	</span>
	{#if viewing}
		<span class="ml-auto text-[13px] font-semibold">Viewing</span>
	{:else}
		<ChevronRightIcon class="ml-auto size-4 text-muted-foreground" aria-hidden="true" />
	{/if}
{/snippet}

<AppDialog.Root open {busy} closeBlocked={dirty} {onClose}>
	<AppDialog.Content presentation="sheet" size="wide">
		<AppDialog.Header
			class="gap-2 border-b px-7 pt-7 pb-5"
			eyebrow={['Evaluation', [reportLabel, entry.evalType].filter(Boolean).join(' '), completed ? 'Completed' : '']
				.filter(Boolean)
				.join(' · ')}
		>
			<AppDialog.Title class="font-heading text-[34px] leading-[34px] font-extrabold uppercase">
				{ratedName}
			</AppDialog.Title>
			<AppDialog.Description class="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
				<span class={cn('size-[7px] shrink-0 rounded-full', due.tone.rail)} aria-hidden="true"></span>
				<span class={cn('text-[15px] font-semibold', due.tone.text)}>{due.text}</span>
				<span class="text-muted-foreground">
					· {formatDayMonthShortYear(evaluation.ratingPeriodStart)} → {formatDayMonthShortYear(
						evaluation.ratingPeriodEnd
					)}
				</span>
			</AppDialog.Description>
		</AppDialog.Header>

		<AppDialog.Body class="p-0">
			<section class="grid gap-3 border-b px-7 py-5.5" aria-labelledby="evaluation-step">
				<div class="grid gap-2">
					<p class="text-sm text-muted-foreground">
						<span id="evaluation-step" class="text-[17px] font-semibold text-foreground">{phase.label}</span>
						{#if phase.step}
							· step {phase.step} of {EVALUATION_PHASE_COUNT}
						{/if}
						{#if waiting}
							· waiting on {waiting}
						{/if}
					</p>
					<SegmentedProgress
						value={phase.step}
						max={EVALUATION_PHASE_COUNT}
						aria-label="Evaluation step {phase.step} of {EVALUATION_PHASE_COUNT}"
					/>
				</div>
				<div class="flex flex-wrap justify-end gap-2">
					{#each moves as option (option.kind)}
						<Button
							variant={option.kind === 'next' || option.kind === 'start' ? 'default' : 'outline'}
							size="sm"
							class={option.kind === 'next' || option.kind === 'start' ? 'order-last' : ''}
							disabled={busy || dirty}
							onclick={() => move(option.to, option.kind)}
						>
							{#if moving === option.kind}<Spinner />{/if}
							{moveLabel(option)}
						</Button>
					{/each}
				</div>
				{#if dirty}
					<p class="text-right text-[13px] text-muted-foreground">Save or cancel your edits to move the workflow.</p>
				{/if}
				{#if moveError}
					<Alert.Root variant="destructive" role="alert">
						<Alert.Title>The workflow did not move</Alert.Title>
						<Alert.Description>{moveError}</Alert.Description>
					</Alert.Root>
				{/if}
				<ol class="grid overflow-clip rounded-md border bg-card py-1" aria-label="Workflow steps">
					{#each steps as step, index (step.value)}
						{@const current = index === at}
						{@const done = at >= 0 && index < at}
						<li>
							{#if current}
								<div
									class="flex h-[30px] items-center gap-2.5 border-l-2 border-accent bg-accent/9 pr-3 pl-[10px] text-sm font-semibold"
									aria-current="step"
								>
									<span class="size-2 shrink-0 rounded-full bg-accent" aria-hidden="true"></span>
									<span class="min-w-0 flex-1 truncate">{step.label}</span>
									<span class="font-mono text-[11px] tracking-[0.08em] text-accent-text">NOW</span>
								</div>
							{:else}
								<button
									type="button"
									class="group flex h-7 w-full items-center gap-2.5 px-3 text-left text-sm outline-none hover:bg-muted focus-visible:bg-muted disabled:pointer-events-none"
									disabled={busy || dirty || !isWorkflowMoveAllowed(status, step.value, roles)}
									aria-label="Jump to {step.label}"
									onclick={() => move(step.value, step.value)}
								>
									<span
										class={cn(
											'size-2 shrink-0 rounded-full',
											done ? 'bg-accent' : 'border border-muted-foreground/50 bg-transparent'
										)}
										aria-hidden="true"
									></span>
									<span class={cn('min-w-0 flex-1 truncate', !done && 'text-muted-foreground')}>{step.label}</span>
									{#if moving === step.value}
										<Spinner />
									{:else}
										<span
											class="text-[13px] underline underline-offset-4 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100"
											aria-hidden="true"
										>
											Jump to this step
										</span>
									{/if}
								</button>
							{/if}
						</li>
					{/each}
				</ol>
			</section>

			<fieldset class="contents" disabled={busy}>
				<section class="grid gap-3 border-b px-7 py-5.5">
					{@render sectionTitle('Report and period')}
					<ReportPeriodFields
						idPrefix="evaluation"
						draft={draft.period}
						evalType={entry.evalType}
						disabled={completed}
						{problem}
						hint={completed
							? 'Locked while completed. Reopen to change the report or period.'
							: `${entry.evalType}, from the scheme line. Change the type on the Rating Scheme.`}
						onChange={(next) => (draft.period = next)}
					/>
				</section>

				<section class="grid gap-3 border-b px-7 py-5.5">
					{#if entry.chainSigned && evaluation.signedChain}
						{@render sectionTitle(
							`Signed by · kept ${formatDayMonthShortYear(evaluation.signedChain.signedAt.slice(0, 10))}`,
							{
								href: schemeHref,
								label: 'Current chain on Rating Scheme ›'
							}
						)}
						<EvaluatorChainRows chain={entry} {personnel} label="Signed by" />
						{#each chainChanges as change (change)}
							<p class="rounded-md bg-muted px-3 py-2.5 text-[13px] leading-[18px] text-muted-foreground" role="note">
								{change}
							</p>
						{/each}
					{:else}
						{@render sectionTitle('Rating chain', { href: schemeHref, label: 'Edit on Rating Scheme ›' })}
						<EvaluatorChainRows chain={entry} {personnel} label="Rating chain" />
						<div class="flex flex-wrap items-center gap-3">
							{#if changeRaterLine}
								<Button variant="outline" size="sm" disabled={busy || dirty} onclick={() => (changingRater = true)}>
									Change rater
								</Button>
							{/if}
							<p class="min-w-0 flex-1 text-[13px] leading-[18px] text-muted-foreground">
								Read from the scheme line. A copy is kept on the evaluation when it completes.
							</p>
						</div>
					{/if}
				</section>

				{#if history.length > 1}
					<section class="grid gap-3 border-b px-7 py-5.5">
						{@render sectionTitle(`${ratedShort}'s evaluations`)}
						<ul class="overflow-clip rounded-md border bg-card" aria-label="{ratedShort}'s evaluations">
							{#each history as row (row.id)}
								{@const viewing = row.id === evaluation.id}
								{@const signer = row.signedChain ?? scheme}
								{@const sr = waitingOnName('seniorRater', { ...signer, ratedPersonId: row.ratedPersonId }, personnel)}
								<li class="not-last:border-b">
									{#if viewing || !onOpenEvaluation}
										<div
											class={cn('flex min-h-11 items-center gap-3 px-3.5 text-sm', viewing && 'bg-accent/7')}
											aria-current={viewing ? 'true' : undefined}
										>
											{@render historyRow(row, sr, viewing)}
										</div>
									{:else}
										<button
											type="button"
											class="flex min-h-11 w-full items-center gap-3 px-3.5 text-left text-sm outline-none hover:bg-muted focus-visible:bg-muted"
											onclick={() => onOpenEvaluation(row.id)}
										>
											{@render historyRow(row, sr, viewing)}
										</button>
									{/if}
								</li>
							{/each}
						</ul>
					</section>
				{/if}

				<section class="grid gap-2 border-b px-7 py-5.5">
					<Field.Root>
						<div class="flex justify-between">
							<Field.Label for="evaluation-notes">Notes</Field.Label>
							<span class="text-[13px] text-muted-foreground">Optional</span>
						</div>
						<Textarea
							id="evaluation-notes"
							rows={3}
							bind:value={draft.notes}
							placeholder="Anything the next reader should know"
						/>
					</Field.Root>
				</section>

				{#if onDelete}
					<section class="flex flex-wrap items-center justify-between gap-3 px-7 py-5.5">
						<p class="text-[13px] leading-[18px] text-muted-foreground">
							Delete removes this record. Use it for an evaluation added by mistake.
						</p>
						<Button variant="outline" size="sm" class="text-destructive-text" onclick={() => (confirmingDelete = true)}>
							Delete evaluation
						</Button>
					</section>
				{/if}
			</fieldset>
		</AppDialog.Body>

		{#if saveError}
			<Alert.Root variant="destructive" class="mx-7 mb-3 w-auto" role="alert">
				<Alert.Title>The evaluation was not saved</Alert.Title>
				<Alert.Description>{saveError}</Alert.Description>
			</Alert.Root>
		{/if}

		<AppDialog.Footer class="items-center gap-2 border-t px-7 py-4">
			<p class="mr-auto text-[13px] text-muted-foreground max-sm:hidden">Workflow moves save on click.</p>
			{#if completed && !dirty}
				<Button variant="outline" onclick={onClose} disabled={busy}>Close</Button>
			{:else}
				<Button variant="outline" onclick={onClose} disabled={busy}>Cancel</Button>
				<Button disabled={busy} onclick={save}>
					{#if saving}<Spinner />{/if}
					Save changes
				</Button>
			{/if}
		</AppDialog.Footer>
	</AppDialog.Content>
</AppDialog.Root>

{#if changingRater && changeRaterLine}
	<ChangeRaterDialog
		line={changeRaterLine}
		{personnel}
		isCurrentWorkspace={isCurrent}
		onChange={changeRater}
		onClose={() => (changingRater = false)}
	/>
{/if}

{#if confirmingDelete}
	<ConfirmDialog
		title="Delete this evaluation?"
		message="This removes {ratedShort}'s {reportLabel || 'evaluation'} record for {formatDayMonthShortYear(
			evaluation.ratingPeriodStart
		)} → {formatDayMonthShortYear(evaluation.ratingPeriodEnd)}. The rating scheme line stays."
		confirmLabel="Delete evaluation"
		variant="destructive"
		loading={deleting}
		onConfirm={remove}
		onCancel={() => (confirmingDelete = false)}
	/>
{/if}
