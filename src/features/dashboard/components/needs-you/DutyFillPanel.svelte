<script lang="ts">
	import { onMount } from 'svelte';
	import { SvelteMap } from 'svelte/reactivity';
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import {
		dailyAssignmentsStore,
		indexAssignmentsBySlot,
		indexDutyAvailability,
		indexDutyHistory,
		isFreeForDuty,
		loadDutyHistory,
		loadDutyPicker,
		openAssignmentDates,
		planDutyFill,
		type DutyFillSlot
	} from '$features/calendar';
	import { Button } from '$lib/components/ui/button';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { formatWeekdayDay, parseDate } from '$lib/utils/dates';
	import { openCalendarAt } from '../../calendarLink';
	import { DUTY_FILL_DAYS, type NeedsYouPanelProps } from '../../sections/needsYou';

	let { model, save, saving, failure, close, assignmentTypeId }: NeedsYouPanelProps & { assignmentTypeId: string } =
		$props();

	const inputs = $derived(model.inputs);
	const type = $derived(inputs.assignmentTypes.find((candidate) => candidate.id === assignmentTypeId) ?? null);
	const openDates = $derived(
		openAssignmentDates(indexAssignmentsBySlot(inputs.assignments), assignmentTypeId, inputs.forecastDays)
	);
	const dates = $derived(openDates.slice(0, DUTY_FILL_DAYS));
	const rest = $derived(openDates.slice(DUTY_FILL_DAYS));

	const picks = new SvelteMap<string, string>();
	let history = $state<'loading' | 'ready' | 'failed'>('loading');

	async function readHistory() {
		const orgId = inputs.page.orgId;
		const window = { firstDay: dates[0], lastDay: dates.at(-1)! };
		history = 'loading';
		try {
			await loadDutyHistory(orgId, window);
			if (inputs.page.orgId === orgId) history = 'ready';
		} catch {
			if (inputs.page.orgId === orgId) history = 'failed';
		}
	}

	onMount(() => {
		if (dates.length > 0) void readHistory();
	});

	const slots = $derived<DutyFillSlot[]>(
		type
			? planDutyFill({
					type,
					dates,
					personnel: inputs.personnel,
					groups: inputs.groups,
					availabilityByPerson: indexDutyAvailability(inputs.availability),
					statusTypes: inputs.statusTypes,
					history: indexDutyHistory(inputs.assignments),
					picks
				})
			: []
	);
	const filled = $derived(slots.filter((slot) => slot.choice !== null));
	const canAssign = $derived(history === 'ready' && filled.length > 0 && !saving);

	let swapping = $state<{ slot: DutyFillSlot; anchor: HTMLElement } | null>(null);

	function choiceName(slot: DutyFillSlot): string {
		const choice = slot.choice;
		if (!choice) return 'Open';
		return choice.kind === 'personnel' && choice.prefix ? `${choice.prefix} ${choice.label}` : choice.label;
	}

	function lastDutyLabel(slot: DutyFillSlot): string {
		const choice = slot.choice;
		if (!choice) return slot.options.some(isFreeForDuty) ? 'Everyone free has a day' : 'Nobody eligible is free';
		if (choice.kind === 'group') return 'Group';
		return choice.lastDuty.kind === 'previous' ? `last duty ${choice.lastDuty.daysSince}d` : 'no duty in 90d';
	}

	function assignAll() {
		if (!canAssign) return;
		const assignments = filled.map((slot) => ({ date: slot.date, assignmentTypeId, assigneeId: slot.choice!.id }));
		void save(() => dailyAssignmentsStore.setAssignmentBatchOrThrow(assignments)).catch(() => {});
	}
</script>

<div class="grid gap-3.5 pt-1 pr-4 pb-[18px] pl-4 @2xl/attention-row:pl-[116px]">
	<ul class="flex flex-wrap gap-1.5" aria-label="Days to fill" aria-busy={history === 'loading'}>
		{#each slots as slot (slot.date)}
			<li class="min-w-[120px] flex-1 basis-0">
				{#if history === 'loading'}
					<div class="grid gap-1 rounded-[4px] border border-border bg-background py-2.5 pr-2.5 pl-3">
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
							'grid w-full gap-1 rounded-[4px] border py-2.5 pr-2.5 pl-3 text-left focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-50',
							slot.picked ? 'border-foreground bg-muted' : 'border-border bg-background hover:bg-muted/60'
						]}
						disabled={saving || history !== 'ready'}
						aria-haspopup="dialog"
						aria-label="{formatWeekdayDay(slot.date)}: {history === 'ready' ? choiceName(slot) : 'not suggested'}, swap"
						onclick={(event) => (swapping = { slot, anchor: event.currentTarget })}
					>
						<span class="flex items-center justify-between">
							<span
								class="font-mono text-[11px] leading-[14px] font-semibold tracking-[0.08em] text-muted-foreground uppercase"
							>
								{slot.picked ? 'Selected' : formatWeekdayDay(slot.date)}
							</span>
							<ChevronDownIcon class="size-3 text-muted-foreground" aria-hidden="true" />
						</span>
						<span class="truncate text-[15px] leading-5 font-semibold text-foreground">
							{history === 'ready' ? choiceName(slot) : 'Not suggested'}
						</span>
						<span class="font-mono text-[11px] leading-[14px] text-muted-foreground">
							{history === 'ready' ? lastDutyLabel(slot) : 'History not loaded'}
						</span>
					</button>
				{/if}
			</li>
		{/each}
	</ul>

	{#if history === 'failed'}
		<p role="alert" class="flex flex-wrap items-center gap-2 text-sm text-destructive">
			Duty history did not load, so nobody is suggested yet.
			<Button variant="link" class="h-auto px-0" onclick={readHistory}>Try again</Button>
		</p>
	{/if}
	{#if failure}
		<p role="alert" class="text-sm text-destructive">{failure}</p>
	{/if}

	<div class="flex flex-wrap items-center gap-3">
		<p class="min-w-[200px] flex-1 text-[13px] leading-[18px] text-muted-foreground italic">
			Suggested: available that day, longest since their last duty. Choose a day to swap.
		</p>
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
		<Button variant="ghost" class="px-1.5 text-muted-foreground" onclick={close} disabled={saving}>Cancel</Button>
		<Button data-needs-you-submit onclick={assignAll} aria-disabled={!canAssign} aria-busy={saving}>
			{saving ? 'Assigning...' : `Assign all ${filled.length}`}
		</Button>
	</div>
</div>

{#if swapping && type}
	{@const target = swapping}
	{#await loadDutyPicker() then { default: DutyPicker }}
		<DutyPicker
			typeId={type.id}
			typeName={type.name}
			assignTo={type.assignTo}
			date={parseDate(target.slot.date)}
			anchor={target.anchor}
			options={target.slot.options}
			onAssign={async (assigneeId) => {
				picks.set(target.slot.date, assigneeId);
				return true;
			}}
			onClose={() => (swapping = null)}
		/>
	{:catch}
		<span class="sr-only">Duty picker failed to load.</span>
	{/await}
{/if}
