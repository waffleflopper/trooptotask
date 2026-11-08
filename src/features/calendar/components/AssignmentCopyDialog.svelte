<script lang="ts">
	import type { AssignmentType, DailyAssignment, SpecialDay, StatusType } from '$features/calendar/contracts';
	import {
		buildCopyPlan,
		MAX_COPY_WRITES,
		monthWeekStarts,
		type AssignmentWrite,
		type CopySkip
	} from '$features/calendar/utils/assignmentPlanner';
	import type { DutyAvailabilityIndex } from '$features/calendar/utils/dutyReadModel';
	import { getMonthName, parseDate } from '$lib/utils/dates';
	import { fromDayNumber, toDayNumber } from '$lib/utils/dayNumber';
	import { PendingSave } from '$lib/utils/pendingSave.svelte';
	import * as AppDialog from '$lib/components/ui/app-dialog';
	import * as Alert from '$lib/components/ui/alert';
	import { Button } from '$lib/components/ui/button';
	import * as Field from '$lib/components/ui/field';
	import { NativeSelect } from '$lib/components/ui/native-select';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { Spinner } from '$lib/components/ui/spinner';

	interface Props {
		kind: 'week' | 'month';
		/** The first day of the shown month. */
		anchor: Date;
		todayKey: string;
		columns: readonly AssignmentType[];
		/** Source and target slots alike. */
		assignmentsBySlot: ReadonlyMap<string, DailyAssignment>;
		availabilityByPerson: DutyAvailabilityIndex;
		personnelIds: ReadonlySet<string>;
		statusTypes: readonly StatusType[];
		specialDays: readonly SpecialDay[];
		assigneeName: (type: AssignmentType, assigneeId: string) => string;
		/** The read of the days copied from, which the shown month's own read does not cover. */
		source: { status: 'ready' | 'loading' | 'error'; onRetry: () => void };
		/** Something else is saving, or the month may show a filled day as open. */
		locked: boolean;
		/** Saves the writes; resolves false when nothing was saved. The caller closes the dialog on success. */
		onCopy: (writes: AssignmentWrite[]) => Promise<boolean>;
		onClose: () => void;
	}

	let {
		kind,
		anchor,
		todayKey,
		columns,
		assignmentsBySlot,
		availabilityByPerson,
		personnelIds,
		statusTypes,
		specialDays,
		assigneeName,
		source,
		locked,
		onCopy,
		onClose
	}: Props = $props();

	const DATE = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
	const dateLabel = (dateKey: string) => DATE.format(parseDate(dateKey));
	const weekEnd = (weekStart: string) => fromDayNumber(toDayNumber(weekStart) + 6);
	const weekLabel = (weekStart: string) => `${dateLabel(weekStart)} to ${dateLabel(weekEnd(weekStart))}`;

	const monthName = $derived(`${getMonthName(anchor.getMonth())} ${anchor.getFullYear()}`);
	const previousMonthName = $derived.by(() => {
		const previous = new Date(anchor.getFullYear(), anchor.getMonth() - 1, 1);
		return `${getMonthName(previous.getMonth())} ${previous.getFullYear()}`;
	});

	const weekStarts = $derived(monthWeekStarts(anchor));
	const monthPrefix = $derived(`${anchor.getFullYear()}-${String(anchor.getMonth() + 1).padStart(2, '0')}`);
	// Today's week when today is in the shown month, otherwise the first week.
	const defaultWeek = $derived(
		todayKey.startsWith(monthPrefix)
			? (weekStarts.findLast((start) => start <= todayKey) ?? weekStarts[0])
			: weekStarts[0]
	);
	let chosenWeek = $state<string | null>(null);
	const weekStart = $derived(chosenWeek && weekStarts.includes(chosenWeek) ? chosenWeek : defaultWeek);
	const sourceWeekStart = $derived(fromDayNumber(toDayNumber(weekStart) - 7));

	const plan = $derived(
		source.status === 'ready'
			? buildCopyPlan({
					anchor,
					span: kind === 'week' ? { kind: 'week', weekStart } : { kind: 'month' },
					columns,
					assignmentsBySlot,
					availabilityByPerson,
					personnelIds,
					statusTypes,
					specialDays
				})
			: null
	);
	const typeById = $derived(new Map(columns.map((type) => [type.id, type])));
	const count = $derived(plan?.writes.length ?? 0);
	const tooMany = $derived(count > MAX_COPY_WRITES);
	const slots = (n: number) => `${n} ${n === 1 ? 'slot' : 'slots'}`;

	function skipReason(skip: CopySkip): string {
		if (skip.reason === 'missing-day') return `${monthName} has no day ${Number(skip.sourceDate.slice(8))}`;
		if (skip.reason === 'no-duty') return 'Takes no duty that day';
		if (skip.reason === 'off-roster') return 'No longer on your roster';
		if (skip.reason === 'excused') return `Excused from this duty${skip.detail ? `: ${skip.detail}` : ''}`;
		return `Unavailable: ${skip.detail}`;
	}

	const saving = new PendingSave();
	const save = () =>
		saving.run(async () => {
			if (!plan || locked || tooMany || count === 0) return;
			await onCopy(plan.writes);
		});
</script>

<AppDialog.Root open busy={saving.pending} {onClose}>
	<AppDialog.Content>
		<AppDialog.Header>
			<AppDialog.Title>{kind === 'week' ? 'Copy previous week' : 'Copy previous month'}</AppDialog.Title>
			<AppDialog.Description>
				{#if kind === 'week'}
					Fills empty slots of the chosen week in {monthName} with the assignments of the week before it.
				{:else}
					Fills empty slots in {monthName} with the assignments of {previousMonthName}, day for day.
				{/if}
			</AppDialog.Description>
		</AppDialog.Header>
		<AppDialog.Body class="grid content-start gap-4">
			{#if kind === 'week'}
				<fieldset class="contents" disabled={saving.pending}>
					<Field.Root>
						<Field.Label for="copy-week">Week to fill</Field.Label>
						<NativeSelect id="copy-week" bind:value={() => weekStart, (value) => (chosenWeek = value)} class="w-full">
							{#each weekStarts as start (start)}
								<option value={start}>{weekLabel(start)}</option>
							{/each}
						</NativeSelect>
						<Field.Description>
							Copies {weekLabel(sourceWeekStart)}. Only the days of that week in {monthName} are filled.
						</Field.Description>
					</Field.Root>
				</fieldset>
			{/if}

			{#if source.status === 'loading'}
				<div class="grid gap-2" role="status" aria-label="Loading the assignments to copy">
					<Skeleton class="h-5 w-2/3" />
					<Skeleton class="h-24 w-full" />
				</div>
			{:else if source.status === 'error'}
				<Alert.Root variant="destructive">
					<Alert.Description>The assignments to copy could not be loaded.</Alert.Description>
					<Alert.Action>
						<Button variant="destructive" size="xs" onclick={source.onRetry}>Retry</Button>
					</Alert.Action>
				</Alert.Root>
			{:else if plan}
				<p class="text-sm" role="status">
					Fills <strong class="font-semibold">{slots(plan.writes.length)}</strong>.
					{#if plan.filled > 0}
						Leaves {plan.filled === 1 ? '1 filled slot' : `${plan.filled} filled slots`} alone.
					{/if}
				</p>
				{#if tooMany}
					<Alert.Root variant="warning">
						<Alert.Description>
							That is more than {MAX_COPY_WRITES.toLocaleString('en-US')} slots, more than one save takes. Copy one week at
							a time instead.
						</Alert.Description>
					</Alert.Root>
				{/if}
				{#if plan.skips.length > 0}
					<section aria-labelledby="copy-skips" class="grid gap-1.5">
						<h3
							id="copy-skips"
							class="font-mono text-[10px] font-semibold tracking-widest text-muted-foreground uppercase"
						>
							Not copied ({plan.skips.length})
						</h3>
						<ul class="max-h-56 divide-y overflow-y-auto rounded-md border text-sm">
							{#each plan.skips as skip (`${skip.typeId}|${skip.sourceDate}`)}
								{@const type = typeById.get(skip.typeId)}
								<li class="grid gap-0.5 px-3 py-2">
									<span class="font-medium">
										{skip.targetDate ? dateLabel(skip.targetDate) : `From ${dateLabel(skip.sourceDate)}`} · {type?.name}
									</span>
									<span class="text-muted-foreground">
										{type ? assigneeName(type, skip.assigneeId) : skip.assigneeId}: {skipReason(skip)}
									</span>
								</li>
							{/each}
						</ul>
					</section>
				{/if}
			{/if}
		</AppDialog.Body>
		<AppDialog.Footer>
			<Button variant="outline" onclick={onClose} disabled={saving.pending}>Cancel</Button>
			<Button onclick={save} disabled={!plan || count === 0 || tooMany || locked || saving.pending}>
				{#if saving.pending}<Spinner />{/if}
				Copy {slots(count)}
			</Button>
		</AppDialog.Footer>
	</AppDialog.Content>
</AppDialog.Root>
