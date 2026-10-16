<script lang="ts">
	import { onMount } from 'svelte';
	import ArrowRight from '@lucide/svelte/icons/arrow-right';
	import X from '@lucide/svelte/icons/x';
	import type { SpecialDay } from '$features/calendar/contracts';
	import { specialDaysStore, type ClosureDaysResult } from '$features/calendar/stores/specialDays.svelte';
	import { closureDates, MAX_CLOSURE_DAYS, partitionClosureDates } from '$features/calendar/utils/closureDays';
	import { Button } from '$lib/components/ui/button';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { DatePicker } from '$lib/components/ui/date-picker';
	import * as Field from '$lib/components/ui/field';
	import { Input } from '$lib/components/ui/input';
	import { Spinner } from '$lib/components/ui/spinner';
	import { toastStore } from '$lib/stores/toast.svelte';
	import { formatToday } from '$lib/utils/dates';
	import { PendingSave } from '$lib/utils/pendingSave.svelte';
	import ClosureCalendarPreview from './ClosureCalendarPreview.svelte';

	interface Props {
		/** Cancel and a successful save close at once. */
		onClose: () => void;
		/** Escape and the close button ask to close, so the owner can confirm before unsaved changes go. */
		onDismiss: () => void;
	}

	let { onClose, onDismiss }: Props = $props();

	const today = formatToday();
	let name = $state('');
	let startDate = $state(today);
	let endDate = $state(today);
	let skipWeekends = $state(true);
	let nameInput = $state<HTMLInputElement | null>(null);
	let fields = $state<HTMLFieldSetElement | null>(null);
	const saving = new PendingSave();

	const RANGE_ERRORS = {
		'missing-date': 'Pick a first and last day.',
		'end-before-start': 'End date must be on or after the start date.',
		'too-many-days': `A closure can cover at most ${MAX_CLOSURE_DAYS} days.`
	} as const;

	const dates = $derived(closureDates({ startDate, endDate, skipWeekends }));
	const plan = $derived(
		dates.ok ? partitionClosureDates(dates.dates, specialDaysStore.items) : { create: [], skip: [] }
	);
	const count = $derived(plan.create.length);
	const dayWord = (n: number) => (n === 1 ? 'day' : 'days');
	const trimmedName = $derived(name.trim());
	const dirty = $derived(trimmedName !== '' || startDate !== today || endDate !== today || !skipWeekends);
	const previewDays = $derived<SpecialDay[]>([
		...specialDaysStore.items,
		...plan.create.map((date) => ({
			id: `draft-${date}`,
			date,
			name: trimmedName || 'New closure',
			type: 'org-closure' as const
		}))
	]);

	const UNSETTLED: Record<Exclude<ClosureDaysResult['status'], 'saved' | 'not-saved'>, string | null> = {
		stale: null,
		unconfirmed: "We couldn't confirm the closure. The list shows the saved days. Add again if days are missing.",
		'unconfirmed-unrefreshed': "We couldn't confirm the closure. Reload to see the saved days."
	};

	export function isDirty() {
		return dirty;
	}

	onMount(() => nameInput?.focus());

	function changeStart(value: string) {
		startDate = value;
		if (endDate < value) endDate = value;
	}

	async function save() {
		if (!dates.ok || count === 0 || !trimmedName) return;
		const previewSkipped = plan.skip.length;
		const result = await specialDaysStore.addClosureDays({ name: trimmedName, dates: dates.dates });
		if (result.status === 'saved') {
			const added = `Added ${result.created.length} ${dayWord(result.created.length)}`;
			toastStore.success(result.skipped > previewSkipped ? `${added}. ${result.skipped} already existed.` : added);
			onClose();
			return;
		}
		// The draft stays open: a refused save can be corrected, and repeating an unconfirmed one adds only missing days.
		const message = result.status === 'not-saved' ? result.message : UNSETTLED[result.status];
		if (message) toastStore.error(message);
	}
</script>

<svelte:document
	onkeydown={(event) => {
		if (event.key !== 'Escape' || saving.pending || !fields?.contains(event.target as Node)) return;
		event.preventDefault();
		onDismiss();
	}}
/>

<form
	class="flex w-full flex-col rounded-lg border-2 border-foreground bg-card"
	aria-label="New closure"
	onsubmit={(event) => {
		event.preventDefault();
		void saving.run(save);
	}}
>
	<fieldset bind:this={fields} class="contents" disabled={saving.pending}>
		<div class="flex items-start justify-between gap-3 border-b px-5 py-4">
			<div class="flex flex-col gap-0.5">
				<span class="font-mono text-[10px] font-semibold tracking-widest text-muted-foreground uppercase">
					New closure
				</span>
				<h4 class="font-display text-lg leading-tight font-bold uppercase">Add closure days</h4>
			</div>
			<Button type="button" variant="ghost" size="icon-sm" aria-label="Close" onclick={onDismiss}>
				<X />
			</Button>
		</div>
		<div class="flex flex-col gap-5 px-5 py-4">
			<Field.Root>
				<Field.Label for="closure-name">Name</Field.Label>
				<Input id="closure-name" type="text" maxlength={120} bind:ref={nameInput} bind:value={name} />
				<Field.Description>For example DONSA, training holiday or block leave.</Field.Description>
			</Field.Root>
			<Field.Set>
				<Field.Legend variant="label">Dates</Field.Legend>
				<div class="flex flex-wrap items-center gap-2">
					<DatePicker class="min-w-36 flex-1" aria-label="First day" value={startDate} onValueChange={changeStart} />
					<ArrowRight class="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
					<DatePicker class="min-w-36 flex-1" aria-label="Last day" bind:value={endDate} />
				</div>
				{#if dates.ok && dates.dates.length === 0}
					<Field.Description>These are all weekend days. Turn off Skip weekends to add them.</Field.Description>
				{:else if dates.ok}
					<Field.Description>Pick one day or a range.</Field.Description>
				{:else}
					<Field.Error>{RANGE_ERRORS[dates.reason]}</Field.Error>
				{/if}
			</Field.Set>
			<Field.Root orientation="horizontal">
				<Checkbox id="closure-skip-weekends" bind:checked={skipWeekends} />
				<Field.Content>
					<Field.Label for="closure-skip-weekends">Skip weekends</Field.Label>
					<Field.Description>Saturday and Sunday are already off.</Field.Description>
				</Field.Content>
			</Field.Root>
			<div class="flex flex-col gap-2">
				<span class="font-mono text-[10px] font-semibold tracking-widest text-muted-foreground uppercase">
					On the calendar
				</span>
				<ClosureCalendarPreview {startDate} {endDate} specialDays={previewDays} />
			</div>
			<p class="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
				Saved as {count} closure {dayWord(count)} you can edit or remove one at a time. Days that already have a holiday or
				closure are skipped.
			</p>
		</div>
		<div class="flex flex-wrap justify-end gap-2 border-t px-5 py-4">
			<Button type="button" variant="ghost" onclick={onClose} disabled={saving.pending}>Cancel</Button>
			<Button type="submit" disabled={saving.pending || count === 0 || !trimmedName}>
				{#if saving.pending}<Spinner />{/if}
				Add {count}
				{dayWord(count)}
			</Button>
		</div>
	</fieldset>
</form>
