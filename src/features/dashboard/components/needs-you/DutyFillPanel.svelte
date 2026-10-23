<script lang="ts">
	import { SvelteMap } from 'svelte/reactivity';
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import {
		PlannerRosterRead,
		dailyAssignmentsStore,
		indexAssignmentsBySlot,
		indexDutyAvailability,
		isFreeForDuty,
		loadDutyPicker,
		openAssignmentDates,
		planDutyFill,
		type DutyFillSlot
	} from '$features/calendar';
	import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
	import * as Alert from '$lib/components/ui/alert';
	import { Button } from '$lib/components/ui/button';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { Spinner } from '$lib/components/ui/spinner';
	import { formatWeekdayDay, parseDate } from '$lib/utils/dates';
	import { openCalendarAt } from '../../calendarLink';
	import { DUTY_FILL_DAYS, type NeedsYouPanelProps } from '../../sections/needsYou';

	let {
		model,
		access,
		save,
		saving,
		failure,
		close,
		assignmentTypeId
	}: NeedsYouPanelProps & { assignmentTypeId: string } = $props();

	const inputs = $derived(model.inputs);
	const type = $derived(inputs.assignmentTypes.find((candidate) => candidate.id === assignmentTypeId) ?? null);
	const openDates = $derived(
		openAssignmentDates(indexAssignmentsBySlot(inputs.assignments), assignmentTypeId, inputs.forecastDays)
	);
	const dates = $derived(openDates.slice(0, DUTY_FILL_DAYS));
	const rest = $derived(openDates.slice(DUTY_FILL_DAYS));

	// Roster counts span the whole Organization, so like the duty planner only an Organization-wide operator reads them.
	const counted = $derived(
		type?.assignTo === 'personnel' &&
			access.can(POLICY_ACTION_CATALOG.calendar.manageAssignments, { kind: 'organization' })
	);
	const rosterRead = new PlannerRosterRead();
	const dayRequest = (date: string) => ({
		orgId: inputs.page.orgId,
		typeId: assignmentTypeId,
		date,
		today: inputs.today
	});

	$effect(() => {
		if (!counted) return;
		for (const date of dates) rosterRead.loadDay(dayRequest(date));
	});

	const reads = $derived(
		dates.map((date) => ({
			date,
			read: counted ? (rosterRead.day(dayRequest(date)) ?? { status: 'loading' as const }) : null
		}))
	);
	const counts = $derived(
		reads.some(({ read }) => read?.status === 'loading')
			? 'loading'
			: reads.some(({ read }) => read?.status === 'error')
				? 'failed'
				: 'ready'
	);
	const byRoster = $derived(counted && !reads.every(({ read }) => read?.status === 'ready' && read.day === null));

	function retryCounts() {
		for (const { date, read } of reads) if (read?.status === 'error') rosterRead.retryDay(dayRequest(date));
	}

	const picks = new SvelteMap<string, string>();
	const slots = $derived<DutyFillSlot[]>(
		type
			? planDutyFill({
					type,
					days: reads.map(({ date, read }) => ({
						date,
						roster: read?.status === 'ready' ? (read.day ?? undefined) : undefined,
						unreadRoster: read && read.status !== 'ready' ? read.status : undefined
					})),
					personnel: inputs.personnel,
					groups: inputs.groups,
					availabilityByPerson: indexDutyAvailability(inputs.availability),
					statusTypes: inputs.statusTypes,
					picks
				})
			: []
	);
	const filled = $derived(slots.filter((slot) => slot.choice !== null));
	const canAssign = $derived(counts === 'ready' && filled.length > 0 && !saving);

	let swapping = $state<{ date: string; anchor: HTMLElement } | null>(null);
	const swapSlot = $derived(swapping && slots.find((slot) => slot.date === swapping?.date));
	const swapRead = $derived(swapping && reads.find(({ date }) => date === swapping?.date)?.read);
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

	function swap(slot: DutyFillSlot, anchor: HTMLElement) {
		swapping = { date: slot.date, anchor };
		void loadPicker();
	}

	function choiceName(slot: DutyFillSlot): string {
		const choice = slot.choice;
		if (!choice) return 'Open';
		return choice.kind === 'personnel' && choice.prefix ? `${choice.prefix} ${choice.label}` : choice.label;
	}

	function choiceNote(slot: DutyFillSlot, onRoster: boolean): string {
		const choice = slot.choice;
		if (!choice) return slot.options.some(isFreeForDuty) ? 'Everyone free has a day' : 'Nobody eligible is free';
		if (choice.kind === 'group') return 'Group';
		if (choice.offRoster) return 'Not on this roster';
		if (choice.count !== undefined) return `count ${choice.count}`;
		return onRoster ? 'Not a detail day' : 'Available';
	}

	function assignAll() {
		if (!canAssign) return;
		const assignments = filled.map((slot) => ({ date: slot.date, assignmentTypeId, assigneeId: slot.choice!.id }));
		void save(() => dailyAssignmentsStore.setAssignmentBatchOrThrow(assignments)).catch(() => {});
	}
</script>

<div class="grid gap-3.5 pt-1 pr-4 pb-[18px] pl-4 @2xl/attention-row:pl-[116px]">
	<ul
		class="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-1.5"
		aria-label="Days to fill"
		aria-busy={counts === 'loading'}
	>
		{#each slots as slot, index (slot.date)}
			{@const read = reads[index]?.read}
			{@const status = read?.status ?? 'ready'}
			{@const opening = picker?.status === 'loading' && swapping?.date === slot.date}
			<li>
				{#if status === 'loading'}
					<div
						class="grid h-full content-start gap-1 rounded-[4px] border border-border bg-background py-2.5 pr-2.5 pl-3"
					>
						<span class="font-mono text-[11px] leading-[14px] tracking-[0.08em] text-muted-foreground uppercase">
							{formatWeekdayDay(slot.date)}
						</span>
						<Skeleton class="h-5 w-24" />
						<Skeleton class="h-3.5 w-16" />
					</div>
				{:else}
					<button
						type="button"
						class={[
							'grid h-full w-full content-start gap-1 rounded-[4px] border py-2.5 pr-2.5 pl-3 text-left focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-50',
							slot.picked ? 'border-foreground bg-muted' : 'border-border bg-background hover:bg-muted/60'
						]}
						disabled={saving || counts !== 'ready'}
						aria-haspopup="dialog"
						aria-busy={opening}
						aria-label="{formatWeekdayDay(slot.date)}: {status === 'ready' ? choiceName(slot) : 'not suggested'}, swap"
						onclick={(event) => swap(slot, event.currentTarget)}
					>
						<span class="flex items-center justify-between">
							<span
								class="font-mono text-[11px] leading-[14px] font-semibold tracking-[0.08em] text-muted-foreground uppercase"
							>
								{slot.picked ? 'Selected' : formatWeekdayDay(slot.date)}
							</span>
							{#if opening}
								<Spinner class="size-3 text-muted-foreground" aria-label="Opening the duty picker" />
							{:else}
								<ChevronDownIcon class="size-3 text-muted-foreground" aria-hidden="true" />
							{/if}
						</span>
						<span class="text-[15px] leading-5 font-semibold wrap-anywhere text-foreground">
							{status === 'ready' ? choiceName(slot) : 'Not suggested'}
						</span>
						<span class="font-mono text-[11px] leading-[14px] text-muted-foreground">
							{status === 'ready'
								? choiceNote(slot, read?.status === 'ready' && read.day !== null)
								: 'Count unavailable'}
						</span>
					</button>
				{/if}
			</li>
		{/each}
	</ul>

	{#if counts === 'failed'}
		<p role="alert" class="flex flex-wrap items-center gap-2 text-sm text-danger-foreground">
			Roster counts could not be loaded.
			<Button variant="link" class="h-auto px-0" onclick={retryCounts}>Try again</Button>
		</p>
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
					onclick={() => openCalendarAt(rest[0])}
				>
					Open duty planner for {rest.length} more
				</Button>
			{/if}
			<span class="flex items-center gap-3">
				<Button variant="ghost" class="px-1.5 text-muted-foreground" onclick={close} disabled={saving}>Cancel</Button>
				<Button data-needs-you-submit onclick={assignAll} aria-disabled={!canAssign} aria-busy={saving}>
					{saving ? 'Assigning...' : `Assign all ${filled.length}`}
				</Button>
			</span>
		</div>
	</div>
</div>

{#if swapping && swapSlot && type && picker?.status === 'ready'}
	{@const date = swapSlot.date}
	<picker.DutyPicker
		typeName={type.name}
		assignTo={type.assignTo}
		date={parseDate(date)}
		anchor={swapping.anchor}
		options={swapSlot.options}
		counts={swapRead
			? {
					status: swapRead.status,
					stale: swapRead.status === 'ready' && swapRead.stale === true,
					onRetry: () => rosterRead.retryDay(dayRequest(date))
				}
			: undefined}
		onAssign={async (assigneeId) => {
			picks.set(date, assigneeId);
			return true;
		}}
		onClose={() => (swapping = null)}
	/>
{/if}
