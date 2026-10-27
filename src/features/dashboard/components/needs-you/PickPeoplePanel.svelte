<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { SvelteMap } from 'svelte/reactivity';
	import { loadStaffingPickerRequest, saveStaffingRequest, type StaffingPicker } from '$features/calendar';
	import { FillSlot } from '$lib/components/patterns/readiness-items';
	import { Button } from '$lib/components/ui/button';
	import * as Combobox from '$lib/components/ui/combobox';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { rejectedRequestMessage, withinOrganizationLifetime } from '$lib/stores/core';
	import { formatWeekdayDay } from '$lib/utils/dates';
	import type { NeedsYouPanelProps } from '../../sections/needsYou';
	import {
		DRAWN_SLOTS,
		confirmLabel,
		fullName,
		personNote,
		slotNote,
		pickPeople,
		planPickSlots,
		shortName,
		slotOptions,
		suggestionLine,
		type PickPlan,
		type PickSlot,
		type PickSwap
	} from '../../sections/pickSlots';

	let {
		updates,
		save,
		saving,
		failure,
		close,
		orgId,
		taskingId,
		title,
		href,
		required,
		swap,
		groups
	}: NeedsYouPanelProps & {
		orgId: string;
		taskingId: string;
		title: string;
		/** The Tasking's page, where Assign people takes a requirement too big to draw here. */
		href: string;
		required: number | null;
		swap: PickSwap | null;
		groups: Readonly<Record<string, string>>;
	} = $props();

	const SAVED_FIRST =
		'Someone else saved people for this Tasking first. Their picks are shown; your choices are kept, so confirm again.';

	let picker = $state.raw<StaffingPicker | 'loading' | 'failed'>('loading');
	// A slot the viewer changed, by slot key; every other open slot takes a suggestion.
	const choices = new SvelteMap<string, string>();
	let gone = false;
	onDestroy(() => {
		gone = true;
	});

	async function load() {
		picker = 'loading';
		try {
			picker = await withinOrganizationLifetime(loadStaffingPickerRequest(orgId, taskingId), () => !gone);
		} catch {
			if (!gone) picker = 'failed';
		}
	}

	onMount(load);

	const loaded = $derived(typeof picker === 'object' ? picker : null);
	const plan = $derived(loaded ? planPickSlots(loaded, title, swap, choices) : null);
	const people = $derived(loaded ? pickPeople(loaded) : new Map());
	const placeholders = $derived(Array.from({ length: Math.min(Math.max(required ?? 1, 1), DRAWN_SLOTS) }, (_, i) => i));
	const canConfirm = $derived(plan !== null && plan.changed > 0 && !saving);

	function confirm() {
		if (!loaded || !plan || !canConfirm) return;
		const current = loaded;
		const request = {
			personnelIds: plan.selection,
			keep: [],
			removeOutsideScope: false,
			expectedRevision: current.staffing.revision
		};
		void save(async () => {
			let result;
			try {
				result = await withinOrganizationLifetime(saveStaffingRequest(orgId, taskingId, request), () => !gone);
			} catch (error) {
				throw new Error(
					rejectedRequestMessage(error, 'The picks were not saved. Your choices are kept, so try again.')
				);
			}
			if (result.outcome === 'conflict') {
				const picked = new Set(result.staffing.picks.map((pick) => pick.personnelId));
				for (const [key, personnelId] of choices) if (picked.has(personnelId)) choices.delete(key);
				picker = { ...current, staffing: result.staffing };
				await updates.refreshTaskings().catch(() => {});
				throw new Error(SAVED_FIRST);
			}
			await updates.refreshTaskings();
		}).catch(() => {});
	}

	function choose(slot: PickSlot, value: string | string[]) {
		if (typeof value === 'string' && value) choices.set(slot.key, value);
	}

	function slotView(picker: StaffingPicker, plan: PickPlan, slot: PickSlot) {
		const person = slot.personnelId ? people.get(slot.personnelId) : undefined;
		const note = person ? slotNote(picker, person, groups, slot.personnelId === slot.saved) : null;
		const swappedOut = slot.swap && swap && slot.personnelId !== slot.saved;
		return {
			name: person ? shortName(person) : slot.swap ? 'Choose a replacement' : 'Choose a person',
			note: note?.text ?? 'nobody free is left',
			warning: note?.warning ?? false,
			detail:
				!swap || !slot.swap
					? undefined
					: swappedOut && person
						? `Replaces ${swap.personLabel}`
						: `${swap.personLabel} is on ${swap.statusLabel.toLowerCase()} from ${formatWeekdayDay(swap.startsOn)}`,
			options: slotOptions(picker, plan, slot).map((option) => ({
				value: option.personnelId,
				label: fullName(option),
				description: personNote(picker, option, groups).text
			}))
		};
	}
</script>

<div class="grid gap-3.5 pt-1 pr-4 pb-[18px] pl-4 @2xl/attention-row:pl-[116px]">
	{#if loaded && plan}
		<ul class="flex flex-col gap-1.5 @lg/attention-row:flex-row" aria-label="People to pick">
			{#each plan.slots as slot (slot.key)}
				{@const view = slotView(loaded, plan, slot)}
				<li class="min-w-0 @lg/attention-row:flex-1 @lg/attention-row:basis-0">
					<Combobox.Root
						items={view.options}
						value={slot.personnelId ?? ''}
						label={slot.label}
						autoHighlight
						disabled={saving}
						onValueChange={(value) => choose(slot, value)}
					>
						<Combobox.Trigger>
							{#snippet child({ props })}
								<FillSlot
									{...props}
									label={slot.label}
									name={view.name}
									note={view.note}
									noteTone={view.warning ? 'warning' : 'muted'}
									detail={view.detail}
									tone={slot.swap || view.warning ? 'warning' : slot.saved && !slot.swap ? 'selected' : 'default'}
									aria-label="{slot.label}: {view.name}, {view.note}. Change"
								/>
							{/snippet}
						</Combobox.Trigger>
						<Combobox.Content class="min-w-72">
							<Combobox.Search placeholder="Search people..." />
							<Combobox.Empty>Nobody else on this roster matches.</Combobox.Empty>
							<Combobox.List aria-label={slot.label}>
								{#snippet children(value, option)}
									{@const person = people.get(value)}
									{@const note = person ? personNote(loaded, person, groups) : null}
									<Combobox.Item {value} label={option.label} description={option.description}>
										<span class="grid min-w-0 gap-0.5">
											<span class="truncate">{option.label}</span>
											{#if note}
												<span class={['truncate text-xs', note.warning ? 'text-accent-text' : 'text-muted-foreground']}>
													{note.text}
												</span>
											{/if}
										</span>
									</Combobox.Item>
								{/snippet}
							</Combobox.List>
						</Combobox.Content>
					</Combobox.Root>
				</li>
			{/each}
		</ul>
	{:else if picker === 'failed'}
		<p role="alert" class="flex flex-wrap items-center gap-2 text-sm text-danger-foreground">
			The roster could not be loaded.
			<Button variant="link" class="h-auto px-0" onclick={load}>Try again</Button>
		</p>
	{:else}
		<ul class="flex flex-col gap-1.5 @lg/attention-row:flex-row" aria-label="People to pick" aria-busy="true">
			{#each placeholders as index (index)}
				<li class="min-w-0 @lg/attention-row:flex-1 @lg/attention-row:basis-0">
					<div class="grid content-start gap-1 rounded-[4px] border border-border bg-background py-2.5 pr-2.5 pl-3">
						<Skeleton class="h-3.5 w-16" />
						<Skeleton class="h-5 w-24" />
						<Skeleton class="h-3.5 w-28" />
					</div>
				</li>
			{/each}
		</ul>
	{/if}

	{#if failure}
		<p role="alert" class="text-sm text-danger-foreground">{failure}</p>
	{/if}

	<div class="flex flex-wrap items-center gap-x-3 gap-y-2">
		{#if loaded}
			<p class="min-w-[200px] flex-1 text-[13px] leading-[18px] text-muted-foreground italic">
				{suggestionLine(loaded, title)}
			</p>
		{:else}
			<div class="min-w-[200px] flex-1"><Skeleton class="h-4 w-64 max-w-full" /></div>
		{/if}
		<div class="ml-auto flex flex-wrap items-center justify-end gap-x-3 gap-y-1">
			{#if (required ?? 0) > DRAWN_SLOTS}
				<Button variant="link" class="px-1.5" {href}>Open the full picker</Button>
			{/if}
			<span class="flex items-center gap-3">
				<Button variant="ghost" class="px-1.5 text-muted-foreground" onclick={close} disabled={saving}>Cancel</Button>
				<Button data-needs-you-submit onclick={confirm} aria-disabled={!canConfirm} aria-busy={saving}>
					{saving ? 'Confirming...' : confirmLabel(title, required, plan?.changed ?? 0)}
				</Button>
			</span>
		</div>
	</div>
</div>
