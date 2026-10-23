<script lang="ts">
	import { onDestroy } from 'svelte';
	import { SvelteMap, SvelteSet } from 'svelte/reactivity';
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import {
		CalendarRangeCoordinator,
		PlannerRosterRead,
		assignmentSlotKey,
		dailyAssignmentsStore,
		dutyPickerOptions,
		indexAssignmentsBySlot,
		indexDutyAvailability,
		isFreeForDuty,
		loadDutyPicker,
		planDutyFill,
		previewRosterFill,
		rosterSkipNote,
		type DutyPickerOption
	} from '$features/calendar';
	import type { RosterFillPreview } from '$features/calendar/contracts';
	import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
	import * as Alert from '$lib/components/ui/alert';
	import { Button } from '$lib/components/ui/button';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { Spinner } from '$lib/components/ui/spinner';
	import { toastStore } from '$lib/stores/toast.svelte';
	import { formatWeekdayDay, parseDate } from '$lib/utils/dates';
	import { openCalendarAt } from '../../calendarLink';
	import { DUTY_FILL_DAYS, openDutyDates, type NeedsYouPanelProps } from '../../sections/needsYou';

	let {
		model,
		access,
		save,
		saving,
		failure,
		close,
		assignmentTypeId
	}: NeedsYouPanelProps & { assignmentTypeId: string } = $props();

	const ROSTER_CHANGED = 'The roster changed since this preview. Review the new picks and fill again.';

	const inputs = $derived(model.inputs);
	const type = $derived(inputs.assignmentTypes.find((candidate) => candidate.id === assignmentTypeId) ?? null);
	const openDates = $derived(type ? openDutyDates(inputs, type) : []);

	// Like the duty planner, only an Organization-wide operator fills from the roster, since it counts the whole
	// Organization. Everyone else gets suggestions in name order.
	const byRoster = $derived(
		type?.assignTo === 'personnel' &&
			access.can(POLICY_ACTION_CATALOG.calendar.manageAssignments, { kind: 'organization' })
	);

	// A day swapped on the roster path is saved at once, and keeps its card so the list does not shift under the operator.
	const swapped = new SvelteSet<string>();
	const listed = $derived([...new Set([...openDates, ...swapped])].sort());
	const dates = $derived(listed.slice(0, DUTY_FILL_DAYS));
	const rest = $derived(listed.slice(DUTY_FILL_DAYS));
	const open = $derived(dates.filter((date) => !swapped.has(date)));
	const from = $derived(open[0]);
	const through = $derived(open.at(-1));
	const stored = $derived(indexAssignmentsBySlot(inputs.assignments));

	let plan = $state.raw<{ status: 'loading' } | { status: 'ready'; preview: RosterFillPreview } | { status: 'error' }>({
		status: 'loading'
	});
	let previews = $state(0);
	let swapsSaving = $state(0);
	let swapFailure = $state<string | null>(null);
	// The range whose assignments could not be re-read after a refused fill. Planning from the old rows would list
	// a day another operator filled as open, so no preview runs until a retry reads it.
	let staleRange = $state<{ from: string; through: string } | null>(null);
	let retrying = $state(false);
	let gone = false;
	onDestroy(() => {
		gone = true;
	});

	// A refused roster fill means another operator changed assignments, which this range must show before it plans again.
	const rangeCoordinator = new CalendarRangeCoordinator();

	// One preview covers every shown open day. It runs again after any confirmed assignment write, so a swap re-plans
	// the later days, and waits while a write is in flight so it never plans from a half-saved state.
	$effect(() => {
		if (!byRoster || !from || !through) return;
		const request = { typeId: assignmentTypeId, today: inputs.today, from, through };
		void [previews, dailyAssignmentsStore.writes];
		if (saving) return;
		if (staleRange) {
			plan = { status: 'error' };
			return;
		}
		plan = { status: 'loading' };
		if (swapsSaving > 0) return;
		let current = true;
		previewRosterFill(inputs.page.orgId, request).then(
			(preview) => {
				if (current) plan = { status: 'ready', preview };
			},
			() => {
				if (current) plan = { status: 'error' };
			}
		);
		return () => {
			current = false;
		};
	});

	const rosterPicks = $derived(
		new Map(plan.status === 'ready' ? plan.preview.picks.map((pick) => [pick.date, pick]) : [])
	);
	const personById = $derived(new Map(inputs.personnel.map((person) => [person.id, person])));
	const availabilityByPerson = $derived(indexDutyAvailability(inputs.availability));

	// The name-order path keeps the viewer's swaps local until Assign all, and never suggests anyone twice.
	const picks = new SvelteMap<string, string>();
	const nameOrder = $derived(
		type && !byRoster
			? planDutyFill({
					type,
					dates,
					personnel: inputs.personnel,
					groups: inputs.groups,
					availabilityByPerson,
					statusTypes: inputs.statusTypes,
					picks
				})
			: []
	);

	type Card =
		| { date: string; status: 'loading' | 'failed' }
		| {
				date: string;
				status: 'ready';
				heading: string;
				assigneeId: string | null;
				name: string;
				note: string;
				skipped: string;
				selected: boolean;
		  };

	function personName(id: string): string {
		const person = personById.get(id);
		return person ? `${person.rank} ${person.lastName}, ${person.firstName}` : 'Outside your roster';
	}

	function choiceName(choice: DutyPickerOption): string {
		return choice.kind === 'personnel' && choice.prefix ? `${choice.prefix} ${choice.label}` : choice.label;
	}

	function rosterCard(date: string): Card {
		const day = formatWeekdayDay(date);
		const held = stored.get(assignmentSlotKey(date, assignmentTypeId));
		if (swapped.has(date) && held) {
			return {
				date,
				status: 'ready',
				heading: 'Assigned',
				assigneeId: held.assigneeId,
				name: personName(held.assigneeId),
				note: 'Saved',
				skipped: '',
				selected: true
			};
		}
		if (plan.status !== 'ready') return { date, status: plan.status === 'error' ? 'failed' : 'loading' };
		const pick = rosterPicks.get(date);
		if (!pick) {
			const note = plan.preview.unfilled.includes(date) ? 'Nobody eligible is free' : 'Not a detail day';
			return {
				date,
				status: 'ready',
				heading: day,
				assigneeId: null,
				name: 'Open',
				note,
				skipped: '',
				selected: false
			};
		}
		return {
			date,
			status: 'ready',
			heading: day,
			assigneeId: pick.personId,
			name: personName(pick.personId),
			note: pick.returningFrom ? `count ${pick.count} · back from ${pick.returningFrom}` : `count ${pick.count}`,
			skipped: rosterSkipNote(pick, (id) => {
				const person = personById.get(id);
				return person ? `${person.rank} ${person.lastName}` : 'Outside your roster';
			}),
			selected: false
		};
	}

	const cards = $derived<Card[]>(
		byRoster
			? dates.map(rosterCard)
			: nameOrder.map((slot) => ({
					date: slot.date,
					status: 'ready',
					heading: slot.picked ? 'Selected' : formatWeekdayDay(slot.date),
					assigneeId: slot.choice?.id ?? null,
					name: slot.choice ? choiceName(slot.choice) : 'Open',
					note: !slot.choice
						? slot.options.some(isFreeForDuty)
							? 'Everyone free has a day'
							: 'Nobody eligible is free'
						: slot.choice.kind === 'group'
							? 'Group'
							: 'Available',
					skipped: '',
					selected: slot.picked
				}))
	);

	// What Assign all writes: the preview's picks for the shown open days, or the name-order choices.
	const rosterFill = $derived(
		byRoster && plan.status === 'ready' && from && through
			? {
					typeId: assignmentTypeId,
					today: inputs.today,
					from,
					through,
					picks: plan.preview.picks.flatMap(({ date, personId }) => (open.includes(date) ? [{ date, personId }] : []))
				}
			: null
	);
	const nameOrderFill = $derived(
		nameOrder.flatMap((slot) =>
			slot.choice ? [{ date: slot.date, assignmentTypeId, assigneeId: slot.choice.id }] : []
		)
	);
	const fillCount = $derived(byRoster ? (rosterFill?.picks.length ?? 0) : nameOrderFill.length);
	const loading = $derived(byRoster && (plan.status === 'loading' || swapsSaving > 0));
	const ready = $derived(!byRoster || (plan.status === 'ready' && swapsSaving === 0));
	const canAssign = $derived(ready && fillCount > 0 && !saving);

	// The swap picker reads its day's roster standing on open, as the Calendar lane picker does.
	const rosterRead = new PlannerRosterRead();
	const dayRequest = (date: string) => ({
		orgId: inputs.page.orgId,
		typeId: assignmentTypeId,
		date,
		today: inputs.today
	});

	let swapping = $state<{ date: string; anchor: HTMLElement } | null>(null);
	$effect(() => {
		if (byRoster && swapping) rosterRead.loadDay(dayRequest(swapping.date));
	});
	const swapRead = $derived(
		byRoster && swapping ? (rosterRead.day(dayRequest(swapping.date)) ?? { status: 'loading' as const }) : null
	);
	const swapOptions = $derived.by(() => {
		if (!swapping || !type) return [];
		const date = swapping.date;
		if (!byRoster) return nameOrder.find((slot) => slot.date === date)?.options ?? [];
		const card = cards.find((candidate) => candidate.date === date);
		return dutyPickerOptions({
			type,
			dateKey: date,
			personnel: inputs.personnel,
			groups: inputs.groups,
			availabilityByPerson,
			statusTypes: inputs.statusTypes,
			roster: swapRead?.status === 'ready' ? (swapRead.day ?? undefined) : undefined,
			unreadRoster: swapRead && swapRead.status !== 'ready' ? swapRead.status : undefined,
			currentAssigneeId: card?.status === 'ready' ? (card.assigneeId ?? undefined) : undefined
		});
	});

	type DutyPickerComponent = Awaited<ReturnType<typeof loadDutyPicker>>['default'];
	let picker = $state.raw<
		{ status: 'loading' } | { status: 'failed' } | { status: 'ready'; DutyPicker: DutyPickerComponent } | null
	>(null);

	async function loadPicker() {
		if (picker?.status === 'loading' || picker?.status === 'ready') return;
		picker = { status: 'loading' };
		try {
			const { default: DutyPicker } = await loadDutyPicker();
			picker = { status: 'ready', DutyPicker };
		} catch {
			picker = { status: 'failed' };
		}
	}

	function swap(date: string, anchor: HTMLElement) {
		swapping = { date, anchor };
		void loadPicker();
	}

	async function assignSwap(date: string, assigneeId: string): Promise<boolean> {
		if (!byRoster) {
			picks.set(date, assigneeId);
			return true;
		}
		const orgId = inputs.page.orgId;
		swapFailure = null;
		swapsSaving += 1;
		swapped.add(date);
		try {
			await dailyAssignmentsStore.setAssignmentBatchOrThrow([{ date, assignmentTypeId, assigneeId }]);
			return true;
		} catch (error) {
			const message = error instanceof Error && error.message ? error.message : 'The swap was not saved.';
			if (gone) {
				toastStore.error(message);
				return false;
			}
			if (inputs.page.orgId !== orgId) return false;
			if (!stored.has(assignmentSlotKey(date, assignmentTypeId))) swapped.delete(date);
			swapFailure = message;
			return false;
		} finally {
			swapsSaving -= 1;
		}
	}

	function readAssignments(orgId: string, range: { from: string; through: string }) {
		return rangeCoordinator.rereadAssignments(orgId, {
			assignments: { rangeStart: range.from, rangeEnd: range.through }
		});
	}

	function assignAll() {
		if (!canAssign) return;
		if (!byRoster) {
			const assignments = nameOrderFill;
			void save(() => dailyAssignmentsStore.setAssignmentBatchOrThrow(assignments)).catch(() => {});
			return;
		}
		const fill = rosterFill;
		if (!fill) return;
		const orgId = inputs.page.orgId;
		void save(async () => {
			if ((await dailyAssignmentsStore.fillFromRosterOrThrow(fill)) === 'changed') {
				const range = { from: fill.from, through: fill.through };
				const read = await readAssignments(orgId, range);
				if (!gone && inputs.page.orgId === orgId) {
					if (read === 'failed') staleRange = range;
					else previews += 1;
				}
				throw new Error(ROSTER_CHANGED);
			}
		}).catch(() => {});
	}

	async function tryAgain() {
		const range = staleRange;
		if (!range) {
			previews += 1;
			return;
		}
		const orgId = inputs.page.orgId;
		retrying = true;
		try {
			const read = await readAssignments(orgId, range);
			if (gone || inputs.page.orgId !== orgId || staleRange !== range) return;
			if (read === 'read') staleRange = null;
		} finally {
			retrying = false;
		}
	}
</script>

<div class="grid gap-3.5 pt-1 pr-4 pb-[18px] pl-4 @2xl/attention-row:pl-[116px]">
	<ul
		class="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-1.5"
		aria-label="Days to fill"
		aria-busy={loading}
	>
		{#each cards as card (card.date)}
			{@const opening = picker?.status === 'loading' && swapping?.date === card.date}
			<li>
				{#if card.status === 'loading'}
					<div
						class="grid h-full content-start gap-1 rounded-[4px] border border-border bg-background py-2.5 pr-2.5 pl-3"
					>
						<span class="font-mono text-[11px] leading-[14px] tracking-[0.08em] text-muted-foreground uppercase">
							{formatWeekdayDay(card.date)}
						</span>
						<Skeleton class="h-5 w-24" />
						<Skeleton class="h-3.5 w-16" />
					</div>
				{:else}
					<button
						type="button"
						class={[
							'grid h-full w-full content-start gap-1 rounded-[4px] border py-2.5 pr-2.5 pl-3 text-left focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-50',
							card.status === 'ready' && card.selected
								? 'border-foreground bg-muted'
								: 'border-border bg-background hover:bg-muted/60'
						]}
						disabled={saving || !ready}
						aria-haspopup="dialog"
						aria-busy={opening}
						aria-label="{formatWeekdayDay(card.date)}: {card.status === 'ready' ? card.name : 'not suggested'}, swap"
						onclick={(event) => swap(card.date, event.currentTarget)}
					>
						<span class="flex items-center justify-between">
							<span
								class="font-mono text-[11px] leading-[14px] font-semibold tracking-[0.08em] text-muted-foreground uppercase"
							>
								{card.status === 'ready' ? card.heading : formatWeekdayDay(card.date)}
							</span>
							{#if opening}
								<Spinner class="size-3 text-muted-foreground" aria-label="Opening the duty picker" />
							{:else}
								<ChevronDownIcon class="size-3 text-muted-foreground" aria-hidden="true" />
							{/if}
						</span>
						<span class="text-[15px] leading-5 font-semibold wrap-anywhere text-foreground">
							{card.status === 'ready' ? card.name : 'Not suggested'}
						</span>
						<span class="font-mono text-[11px] leading-[14px] text-muted-foreground">
							{card.status === 'ready' ? card.note : 'Count unavailable'}
						</span>
						{#if card.status === 'ready' && card.skipped}
							<span class="text-[11px] leading-[14px] text-muted-foreground italic">{card.skipped}</span>
						{/if}
					</button>
				{/if}
			</li>
		{/each}
	</ul>

	{#if byRoster && plan.status === 'error'}
		<p role="alert" class="flex flex-wrap items-center gap-2 text-sm text-danger-foreground">
			Roster counts could not be loaded.
			<Button variant="link" class="h-auto px-0" disabled={retrying} onclick={tryAgain}>Try again</Button>
		</p>
	{/if}
	{#if swapFailure}
		<p role="alert" class="text-sm text-danger-foreground">{swapFailure}</p>
	{/if}
	{#if failure}
		<p role="alert" class="text-sm text-danger-foreground">{failure}</p>
	{/if}
	{#if swapping && picker?.status === 'failed'}
		<Alert.Root variant="destructive">
			<Alert.Description>The duty picker did not load, so this day cannot be swapped yet.</Alert.Description>
			<Alert.Action>
				<Button type="button" variant="destructive" size="xs" onclick={loadPicker}>Try again</Button>
			</Alert.Action>
		</Alert.Root>
	{/if}

	<div class="flex flex-wrap items-center gap-x-3 gap-y-2">
		<p class="min-w-[200px] flex-1 text-[13px] leading-[18px] text-muted-foreground italic">
			{byRoster
				? 'Suggested: available that day, next up on the roster. Choose a day to swap.'
				: 'Suggested: available that day, in name order. Choose a day to swap.'}
		</p>
		<div class="ml-auto flex flex-wrap items-center justify-end gap-x-3 gap-y-1">
			{#if rest.length > 0}
				<Button
					variant="link"
					class="px-1.5"
					href="/org/{inputs.page.orgId}/calendar/assignments"
					disabled={swapsSaving > 0}
					onclick={() => openCalendarAt(rest[0])}
				>
					Open duty planner for {rest.length} more
				</Button>
			{/if}
			<span class="flex items-center gap-3">
				<Button
					variant="ghost"
					class="px-1.5 text-muted-foreground"
					onclick={close}
					disabled={saving || swapsSaving > 0}>Cancel</Button
				>
				<Button data-needs-you-submit onclick={assignAll} aria-disabled={!canAssign} aria-busy={saving}>
					{saving ? 'Assigning...' : `Assign all ${fillCount}`}
				</Button>
			</span>
		</div>
	</div>
</div>

{#if swapping && type && picker?.status === 'ready'}
	{@const date = swapping.date}
	<picker.DutyPicker
		typeName={type.name}
		assignTo={type.assignTo}
		date={parseDate(date)}
		anchor={swapping.anchor}
		options={swapOptions}
		counts={swapRead
			? {
					status: swapRead.status,
					stale: swapRead.status === 'ready' && swapRead.stale === true,
					onRetry: () => rosterRead.retryDay(dayRequest(date))
				}
			: undefined}
		onAssign={(assigneeId) => assignSwap(date, assigneeId)}
		onClose={() => (swapping = null)}
	/>
{/if}
