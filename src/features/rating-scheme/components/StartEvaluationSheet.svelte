<script lang="ts">
	import { onDestroy, untrack } from 'svelte';
	import type { PersonnelLookup } from '$features/personnel/contracts';
	import type { EvaluationStart } from '../contracts';
	import type { ReadyToStart } from '../utils/evalTracker';
	import { spokenPersonLabel } from '../utils/personLabel';
	import { getReportTypeLabel } from '../utils/ratingScheme';
	import { reportPeriodProblem, type ReportPeriodDraft } from '../utils/reportPeriodDraft';
	import EvaluatorChainRows from './EvaluatorChainRows.svelte';
	import ReportPeriodFields from './ReportPeriodFields.svelte';
	import * as Alert from '$lib/components/ui/alert';
	import * as AppDialog from '$lib/components/ui/app-dialog';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import * as Combobox from '$lib/components/ui/combobox';
	import * as Field from '$lib/components/ui/field';
	import * as RadioGroup from '$lib/components/ui/radio-group';
	import { Spinner } from '$lib/components/ui/spinner';
	import { Textarea } from '$lib/components/ui/textarea';
	import { toastStore } from '$lib/stores/toast.svelte';
	import { formatDayMonthShortYear } from '$lib/utils/dates';

	interface Props {
		orgId: string;
		/** Listed schemes with nothing in work on them. */
		ready: readonly ReadyToStart[];
		/** The scheme the sheet opens on, from its line or its Ready to start row. */
		ratingSchemeId: string | null;
		personnel: PersonnelLookup[];
		isCurrentWorkspace: () => boolean;
		onStart: (ratingSchemeId: string, start: EvaluationStart, isCurrent: () => boolean) => Promise<void>;
		onClose: () => void;
	}

	let { orgId, ready, ratingSchemeId, personnel, isCurrentWorkspace, onStart, onClose }: Props = $props();
	let disposed = false;
	onDestroy(() => {
		disposed = true;
	});
	const isCurrent = () => !disposed && isCurrentWorkspace();

	const people = $derived(new Map(personnel.map((person) => [person.id, person])));
	const nameOf = (personId: string) => {
		const person = people.get(personId);
		return person ? spokenPersonLabel(person) : 'Unknown';
	};
	const options = $derived(
		ready
			.map(({ scheme }) => {
				const person = people.get(scheme.ratedPersonId);
				return {
					value: scheme.id,
					label: person ? `${person.rank} ${person.lastName}, ${person.firstName}` : 'Unknown'
				};
			})
			.sort((a, b) => a.label.localeCompare(b.label))
	);

	function periodFor(candidate: ReadyToStart | undefined): ReportPeriodDraft {
		const next = candidate?.next;
		return next ? { ...next } : { reportType: 'AN', ratingPeriodStart: '', ratingPeriodEnd: '' };
	}

	/** A link can name a scheme that already has work in progress; the sheet then opens with nobody picked. */
	const openedRow = untrack(() => ready.find((row) => row.scheme.id === ratingSchemeId));
	const openedOn = openedRow?.scheme.id ?? null;
	let chosenId = $state(openedOn ?? '');
	let period = $state(periodFor(openedRow));
	let opensAs = $state<'open' | 'completed'>('open');
	let notes = $state('');
	let attempted = $state(false);
	let saving = $state(false);
	let error = $state('');
	const dirty = $derived(!!notes.trim() || opensAs !== 'open' || (!openedOn && !!chosenId));

	const chosen = $derived(ready.find((row) => row.scheme.id === chosenId));
	const problem = $derived(attempted ? reportPeriodProblem(period) : null);
	const lastLine = $derived.by(() => {
		const last = chosen?.last;
		if (!chosen) return 'Choose who this evaluation is for.';
		if (!last) return 'No evaluation on record.';
		const label = getReportTypeLabel(last.reportType, last.evalType) || 'evaluation';
		const signed = last.signedChain?.signedAt;
		return [
			`Last ${label}${signed ? ` completed ${formatDayMonthShortYear(signed.slice(0, 10))}` : ''}`,
			`thru ${formatDayMonthShortYear(last.ratingPeriodEnd)}`
		].join(' · ');
	});

	function choose(value: string | string[]) {
		if (Array.isArray(value)) return;
		chosenId = value;
		period = periodFor(ready.find((row) => row.scheme.id === value));
		error = '';
	}

	async function submit() {
		attempted = true;
		if (saving || !isCurrent()) return;
		if (!chosen || reportPeriodProblem(period)) return;
		error = '';
		saving = true;
		try {
			await onStart(
				chosen.scheme.id,
				{
					reportType: period.reportType || null,
					ratingPeriodStart: period.ratingPeriodStart,
					ratingPeriodEnd: period.ratingPeriodEnd,
					completed: opensAs === 'completed',
					notes: notes.trim() || null
				},
				isCurrent
			);
			if (!isCurrent()) return;
			toastStore.success(opensAs === 'completed' ? 'Completed evaluation recorded' : 'Evaluation started at Drafting');
			onClose();
		} catch (failure) {
			if (isCurrent()) {
				error =
					failure instanceof Error && failure.message.trim()
						? failure.message
						: 'The evaluation was not started. Try again.';
			}
		} finally {
			if (isCurrent()) saving = false;
		}
	}
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

<AppDialog.Root open busy={saving} closeBlocked={dirty} {onClose}>
	<AppDialog.Content presentation="sheet" size="wide">
		<AppDialog.Header class="gap-2 border-b px-7 pt-7 pb-5" eyebrow="Start evaluation · from the rating scheme">
			<AppDialog.Title class="font-heading text-[34px] leading-[34px] font-extrabold uppercase">
				{chosen ? nameOf(chosen.scheme.ratedPersonId) : 'Start evaluation'}
			</AppDialog.Title>
			<AppDialog.Description class="text-sm text-muted-foreground">{lastLine}</AppDialog.Description>
		</AppDialog.Header>

		<AppDialog.Body class="p-0">
			<fieldset class="contents" disabled={saving}>
				<section class="grid gap-3 border-b px-7 py-5.5">
					{@render sectionTitle('Rated Soldier')}
					<Field.Root>
						<Field.Label for="start-rated-soldier" class="sr-only">Rated Soldier</Field.Label>
						<div class="flex items-center gap-2">
							<div class="min-w-0 flex-1">
								<Combobox.Root items={options} bind:value={() => chosenId, choose} label="Rated Soldier" autoHighlight>
									<Combobox.Trigger id="start-rated-soldier" class="h-9" placeholder="Search the rating scheme..." />
									<Combobox.Content>
										<Combobox.Search placeholder="Search the rating scheme..." />
										<Combobox.Empty>Everyone on the rating scheme has an evaluation in work.</Combobox.Empty>
										<Combobox.List />
									</Combobox.Content>
								</Combobox.Root>
							</div>
							{#if chosen}<Badge variant="outline" class="font-mono">{chosen.scheme.evalType}</Badge>{/if}
						</div>
						{#if attempted && !chosen}
							<Field.Error>Rated Soldier is required.</Field.Error>
						{:else}
							<Field.Description>Lists people on the rating scheme with no open evaluation.</Field.Description>
						{/if}
					</Field.Root>
				</section>

				<section class="grid gap-3 border-b px-7 py-5.5">
					{@render sectionTitle('Report and period')}
					<ReportPeriodFields
						idPrefix="start"
						draft={period}
						evalType={chosen?.scheme.evalType ?? 'NCOER'}
						{problem}
						hint={chosen?.next
							? 'Starts the day after the last thru. Annual reports fill Thru in as 12 months after Start.'
							: 'Annual reports fill Thru in as 12 months after Start.'}
						onChange={(next) => (period = next)}
					/>
				</section>

				{#if chosen}
					<section class="grid gap-3 border-b px-7 py-5.5">
						{@render sectionTitle('Rating chain · copied from the scheme', {
							href: `/org/${orgId}/evals/rating-scheme?line=${chosen.scheme.id}`,
							label: 'Edit on Rating Scheme ›'
						})}
						<EvaluatorChainRows chain={chosen.scheme} {personnel} label="Rating chain" />
					</section>
				{/if}

				<section class="grid gap-3 border-b px-7 py-5.5">
					{@render sectionTitle('Opens as')}
					<RadioGroup.Root
						class="grid gap-2 sm:grid-cols-2"
						aria-label="Opens as"
						bind:value={() => opensAs, (value) => (opensAs = value === 'completed' ? 'completed' : 'open')}
					>
						<RadioGroup.Card
							id="start-opens-open"
							value="open"
							title="Open, at Drafting"
							description="Tracked on Eval Tracker until it completes."
						/>
						<RadioGroup.Card
							id="start-opens-completed"
							value="completed"
							title="Already completed"
							description="Records past history. Keeps today's chain as its signers."
						/>
					</RadioGroup.Root>
				</section>

				<section class="grid gap-2 px-7 py-5.5">
					<Field.Root>
						<div class="flex justify-between">
							<Field.Label for="start-notes">Notes</Field.Label>
							<span class="text-[13px] text-muted-foreground">Optional</span>
						</div>
						<Textarea id="start-notes" rows={3} bind:value={notes} placeholder="Optional" />
					</Field.Root>
				</section>
			</fieldset>
		</AppDialog.Body>

		{#if error}
			<Alert.Root variant="destructive" class="mx-7 mb-3 w-auto" role="alert">
				<Alert.Title>The evaluation was not started</Alert.Title>
				<Alert.Description>{error}</Alert.Description>
			</Alert.Root>
		{/if}

		<AppDialog.Footer class="items-center justify-end gap-2 border-t px-7 py-4">
			<Button variant="outline" onclick={onClose} disabled={saving}>Cancel</Button>
			<Button disabled={saving} onclick={submit}>
				{#if saving}<Spinner />{/if}
				{opensAs === 'completed' ? 'Record evaluation' : 'Start evaluation'}
			</Button>
		</AppDialog.Footer>
	</AppDialog.Content>
</AppDialog.Root>
