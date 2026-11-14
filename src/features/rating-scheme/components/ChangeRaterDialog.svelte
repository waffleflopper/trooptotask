<script lang="ts">
	import { onDestroy } from 'svelte';
	import type { PersonnelLookup } from '$features/personnel/contracts';
	import type { RatingSchemeRaterChange } from '../contracts';
	import type { EvaluatorDraft } from '../utils/evaluatorDraft';
	import type { Evaluation } from '../rating-scheme.types';
	import { previewChangeOfRater, MIN_CHANGE_OF_RATER_DAYS } from '../utils/changeRaterPreview';
	import { chainNames, joinNames, spokenPersonLabel } from '../utils/personLabel';
	import { getReportTypeLabel } from '../utils/ratingScheme';
	import type { RatingSchemeLine } from '../utils/ratingSchemeLines';
	import EvaluatorField from './EvaluatorField.svelte';
	import * as Alert from '$lib/components/ui/alert';
	import * as AppDialog from '$lib/components/ui/app-dialog';
	import { Button } from '$lib/components/ui/button';
	import { DatePicker } from '$lib/components/ui/date-picker';
	import * as Field from '$lib/components/ui/field';
	import { Spinner } from '$lib/components/ui/spinner';
	import { formatDayMonthShortYear, formatToday } from '$lib/utils/dates';

	interface Props {
		line: RatingSchemeLine & { open: Evaluation };
		personnel: PersonnelLookup[];
		isCurrentWorkspace: () => boolean;
		/** Resolves once the Evaluation is closed and the next one opened; throws with the reason when it was refused. */
		onChange: (evaluationId: string, change: RatingSchemeRaterChange, isCurrent: () => boolean) => Promise<void>;
		onClose: () => void;
	}

	let { line, personnel, isCurrentWorkspace, onChange, onClose }: Props = $props();
	let disposed = false;
	onDestroy(() => {
		disposed = true;
	});
	const isCurrent = () => !disposed && isCurrentWorkspace();

	const open = $derived(line.open);
	const personnelOptions = $derived(
		[...personnel]
			.sort((a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName))
			.map((person) => ({ value: person.id, label: `${person.rank} ${person.lastName}, ${person.firstName}` }))
	);
	const rated = $derived(personnel.find((person) => person.id === line.ratedPersonId));
	const currentRater = $derived.by(() => {
		const person = personnel.find((candidate) => candidate.id === line.raterPersonId);
		return person ? spokenPersonLabel(person) : (line.raterName ?? 'the current rater');
	});
	const reportLabel = $derived(getReportTypeLabel(open.reportType, open.evalType) || 'evaluation');

	function initialChangeDate(): string {
		const today = formatToday();
		const { ratingPeriodStart: start, ratingPeriodEnd: end } = line.open;
		return today < start ? start : today > end ? end : today;
	}

	let newRater = $state<EvaluatorDraft>({ kind: 'empty' });
	let changeDate = $state(initialChangeDate());
	let error = $state('');
	let saving = $state(false);

	const preview = $derived(previewChangeOfRater(open, changeDate));
	const chain = $derived(joinNames(chainNames(line, personnel)));
	const newRaterName = $derived.by(() => {
		const picked = newRater;
		if (picked.kind === 'external') return picked.name;
		if (picked.kind !== 'person') return 'the new rater';
		const person = personnel.find((candidate) => candidate.id === picked.personId);
		return person ? spokenPersonLabel(person) : 'the new rater';
	});

	async function submit() {
		if (saving || !isCurrent()) return;
		if (newRater.kind === 'empty') {
			error = 'Choose the new rater.';
			return;
		}
		if (!preview) {
			error = 'The last day with the current rater must fall within the rating period.';
			return;
		}
		error = '';
		saving = true;
		try {
			await onChange(
				open.id,
				{
					changeDate,
					raterPersonId: newRater.kind === 'person' ? newRater.personId : null,
					raterName: newRater.kind === 'external' ? newRater.name : null
				},
				isCurrent
			);
		} catch (failure) {
			if (isCurrent())
				error = failure instanceof Error && failure.message ? failure.message : 'The rater was not changed. Try again.';
		} finally {
			if (isCurrent()) saving = false;
		}
	}
</script>

{#snippet outcome(heading: string, title: string, detail: string)}
	<div class="flex gap-3 px-3.5 py-3 not-last:border-b">
		<span
			class="w-[52px] shrink-0 font-mono text-[11px] leading-[18px] font-medium tracking-[0.08em] text-muted-foreground uppercase"
		>
			{heading}
		</span>
		<div class="grid min-w-0 gap-[3px]">
			<p class="text-sm leading-[18px] font-semibold">{title}</p>
			<p class="text-[13px] leading-[18px] text-muted-foreground">{detail}</p>
		</div>
	</div>
{/snippet}

<AppDialog.Root open busy={saving} voice="editorial" {onClose}>
	<AppDialog.Content>
		<AppDialog.Header>
			<AppDialog.Title class="uppercase">Change rater</AppDialog.Title>
			<AppDialog.Description>
				{rated ? `${rated.rank} ${rated.lastName}` : 'This Soldier'}'s open {reportLabel} closes as a Change of Rater report
				through the last day below. A new Annual opens for the new rater the next day.
			</AppDialog.Description>
		</AppDialog.Header>
		<AppDialog.Body class="grid gap-4.5">
			<div class="grid gap-3.5">
				<Field.Root>
					<Field.Label for="new-rater">New rater</Field.Label>
					<EvaluatorField
						id="new-rater"
						label="New rater"
						value={newRater}
						people={personnelOptions}
						onChange={(next) => {
							newRater = next;
							error = '';
						}}
						class="h-9"
					/>
				</Field.Root>
				<Field.Root>
					<Field.Label for="rater-change-date">Last day with {currentRater}</Field.Label>
					<DatePicker
						id="rater-change-date"
						class="h-9 w-55"
						value={changeDate}
						placeholder="Select date"
						onValueChange={(value) => {
							changeDate = value;
							error = '';
						}}
					/>
					{#if preview}
						<Field.Description>
							<span class="tabular-nums">{preview.ratedDays}</span> rated {preview.ratedDays === 1 ? 'day' : 'days'}.
							{#if !preview.meetsMinimum}
								A Change of Rater report needs at least {MIN_CHANGE_OF_RATER_DAYS}.
							{/if}
						</Field.Description>
					{/if}
				</Field.Root>
			</div>

			{#if preview}
				<div class="overflow-clip rounded-md border bg-card" aria-label="What changes">
					{@render outcome(
						'Closes',
						`CR ${open.evalType} · ${formatDayMonthShortYear(preview.closes.start)} → ${formatDayMonthShortYear(preview.closes.end)}`,
						chain ? `Keeps ${chain} as its chain.` : 'Keeps its chain as it is.'
					)}
					{#if preview.opens}
						{@render outcome(
							'Opens',
							`AN ${line.evalType} · ${formatDayMonthShortYear(preview.opens.start)} → ${formatDayMonthShortYear(preview.opens.end)} · Drafting`,
							`The scheme line's rater becomes ${newRaterName}.`
						)}
					{/if}
				</div>
			{/if}

			{#if error}
				<Alert.Root variant="destructive" role="alert">
					<Alert.Title>The rater was not changed</Alert.Title>
					<Alert.Description>{error}</Alert.Description>
				</Alert.Root>
			{/if}
		</AppDialog.Body>
		<AppDialog.Footer>
			<Button variant="outline" onclick={onClose} disabled={saving}>Cancel</Button>
			<Button onclick={submit} disabled={saving}>
				{#if saving}<Spinner />{/if}
				Change rater
			</Button>
		</AppDialog.Footer>
	</AppDialog.Content>
</AppDialog.Root>
