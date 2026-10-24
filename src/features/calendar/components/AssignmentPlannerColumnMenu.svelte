<script lang="ts">
	import type { ComponentProps } from 'svelte';
	import EllipsisIcon from '@lucide/svelte/icons/ellipsis';
	import WandSparklesIcon from '@lucide/svelte/icons/wand-sparkles';
	import type { AssignmentType } from '$features/calendar/contracts';
	import type { AssignmentWrite, QuickFillDays } from '$features/calendar/utils/assignmentPlanner';
	import type { AssigneeChoice } from '$features/calendar/utils/dutyPickerOptions';
	import { Button } from '$lib/components/ui/button';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import * as Field from '$lib/components/ui/field';
	import { NativeSelect } from '$lib/components/ui/native-select';
	import * as Popover from '$lib/components/ui/popover';
	import * as ToggleGroup from '$lib/components/ui/toggle-group';
	import RosterFillForm from './RosterFillForm.svelte';

	type RosterFill = Omit<ComponentProps<typeof RosterFillForm>, 'typeId' | 'busy' | 'onClose' | 'onClearMonth'>;

	interface Props {
		type: AssignmentType;
		choices: readonly AssigneeChoice[];
		busy: boolean;
		buildBatch: (assigneeId: string, days: QuickFillDays, onlyOpenDays: boolean) => AssignmentWrite[];
		onApply: (batch: AssignmentWrite[]) => Promise<boolean>;
		onClearMonth: () => void;
		/** How many duty swaps `batch` would end, for an operator who sees the type's swaps. */
		endsSwaps?: (batch: AssignmentWrite[]) => number;
		/** Present when this type fills from its roster. Its Fill button opens it; the column actions open Quick fill. */
		rosterFill?: RosterFill;
		/** The type's DA 6 for the shown month, for an operator who sees the whole Organization. */
		da6Href?: string;
	}

	let { type, choices, busy, buildBatch, onApply, onClearMonth, endsSwaps, rosterFill, da6Href }: Props = $props();

	let open = $state(false);
	let mode = $state<'roster' | 'person'>('person');
	let opener = $state<HTMLElement | null>(null);
	const fromRoster = $derived(rosterFill !== undefined && mode === 'roster');
	let assigneeId = $state('');
	let days = $state<QuickFillDays>('weekdays');
	let onlyOpenDays = $state(true);
	let applying = $state(false);

	const batch = $derived(buildBatch(assigneeId, days, onlyOpenDays));
	const replaced = $derived(buildBatch(assigneeId, days, false).length - buildBatch(assigneeId, days, true).length);
	const swapsEnded = $derived(endsSwaps?.(batch) ?? 0);
	const fillLabel = $derived(`Fill ${batch.length} ${batch.length === 1 ? 'day' : 'days'}`);
	const subject = $derived(type.assignTo === 'group' ? 'group' : 'person');
	const locked = $derived(busy || applying);

	function openAs(next: 'roster' | 'person', button: HTMLElement) {
		if (open && mode === next) {
			open = false;
			return;
		}
		if (!open) {
			assigneeId = '';
			days = 'weekdays';
			onlyOpenDays = true;
		}
		mode = next;
		opener = button;
		open = true;
	}

	function returnFocus(event: Event) {
		event.preventDefault();
		if (opener?.isConnected) opener.focus();
	}

	function chooseDays(value: string) {
		// A single toggle group emits '' when the pressed item is clicked again.
		if (value === 'weekdays' || value === 'weekends' || value === 'all') days = value;
	}

	async function apply() {
		if (locked || !assigneeId || batch.length === 0) return;
		applying = true;
		try {
			if (await onApply(batch)) open = false;
		} finally {
			applying = false;
		}
	}

	function close() {
		open = false;
	}

	function clearMonth() {
		open = false;
		onClearMonth();
	}
</script>

<Button
	variant="ghost"
	size="icon-xs"
	class="justify-self-end"
	aria-label={`${type.name} column actions`}
	aria-haspopup="dialog"
	aria-expanded={open && mode === 'person'}
	disabled={busy}
	onclick={(event) => openAs('person', event.currentTarget)}
>
	<EllipsisIcon aria-hidden="true" />
</Button>
{#if rosterFill}
	<Button
		variant="outline"
		size="xs"
		aria-label={`Fill ${type.name} from roster`}
		aria-haspopup="dialog"
		aria-expanded={open && mode === 'roster'}
		disabled={busy}
		onclick={(event) => openAs('roster', event.currentTarget)}
	>
		<WandSparklesIcon data-icon="inline-start" aria-hidden="true" />
		Fill
	</Button>
{/if}

<Popover.Root {open} onOpenChange={(next) => (open = next)}>
	<Popover.Content
		customAnchor={opener}
		align="end"
		collisionPadding={8}
		role="dialog"
		aria-label={`${fromRoster ? 'Fill from roster' : 'Quick fill'}, ${type.name}`}
		class={['max-w-(--bits-popover-content-available-width) gap-3 p-3', fromRoster ? 'w-[23rem]' : 'w-80']}
		onCloseAutoFocus={returnFocus}
	>
		<Popover.Header class="flex flex-row items-end justify-between gap-2">
			<div class="grid gap-1">
				<p class="font-mono text-[10px] font-semibold tracking-widest text-muted-foreground uppercase">{type.name}</p>
				<Popover.Title>{fromRoster ? 'Fill from roster' : 'Quick fill'}</Popover.Title>
			</div>
			{#if rosterFill}
				<Button
					variant="link"
					size="xs"
					class="h-auto p-0"
					onclick={() => (mode = mode === 'roster' ? 'person' : 'roster')}
				>
					{mode === 'roster' ? 'One person instead' : 'Fill from roster'}
				</Button>
			{/if}
		</Popover.Header>

		{#if rosterFill && fromRoster}
			<RosterFillForm {...rosterFill} typeId={type.id} {busy} onClose={close} onClearMonth={clearMonth} />
		{:else}
			<Field.Group>
				<Field.Root>
					<Field.Label for={`quick-fill-assignee-${type.id}`}>Assignee</Field.Label>
					<NativeSelect id={`quick-fill-assignee-${type.id}`} bind:value={assigneeId} disabled={locked} class="w-full">
						<option value="">Select {subject}…</option>
						{#each choices as choice (choice.id)}
							<option value={choice.id}>
								{choice.kind === 'personnel' ? `${choice.prefix} ${choice.label}` : choice.label}
							</option>
						{/each}
					</NativeSelect>
				</Field.Root>

				<Field.Root>
					<Field.Label>Days</Field.Label>
					<ToggleGroup.Root
						type="single"
						size="sm"
						aria-label="Days"
						class="w-full"
						disabled={locked}
						bind:value={() => days, chooseDays}
					>
						<ToggleGroup.Item value="weekdays" class="flex-1">Weekdays</ToggleGroup.Item>
						<ToggleGroup.Item value="weekends" class="flex-1">Weekends</ToggleGroup.Item>
						<ToggleGroup.Item value="all" class="flex-1">All</ToggleGroup.Item>
					</ToggleGroup.Root>
				</Field.Root>

				<Field.Root orientation="horizontal">
					<Checkbox id={`quick-fill-open-${type.id}`} bind:checked={onlyOpenDays} disabled={locked} />
					<Field.Content>
						<Field.Label for={`quick-fill-open-${type.id}`}>Only open days</Field.Label>
						<Field.Description>
							{#if replaced === 0}
								None of these days has anyone yet.
							{:else if onlyOpenDays}
								Keeps the {replaced} {replaced === 1 ? 'day' : 'days'} already assigned.
							{:else}
								Replaces the {replaced} {replaced === 1 ? 'day' : 'days'} already assigned.
							{/if}
							{#if swapsEnded > 0}
								<span class="block font-medium text-warning-foreground">
									Ends {swapsEnded} duty {swapsEnded === 1 ? 'swap' : 'swaps'}. Both days of each then count for whoever
									holds them.
								</span>
							{/if}
						</Field.Description>
					</Field.Content>
				</Field.Root>
			</Field.Group>

			<div class="flex items-center gap-2">
				<Button variant="ghost-destructive" size="sm" disabled={locked} onclick={clearMonth}>Clear month</Button>
				<Button variant="ghost" size="sm" class="ml-auto" onclick={close}>Cancel</Button>
				<Button size="sm" disabled={locked || !assigneeId || batch.length === 0} onclick={apply}>
					{applying ? 'Filling…' : fillLabel}
				</Button>
			</div>
		{/if}
		{#if da6Href}
			<div class="-mx-3 -mb-1 border-t px-3 pt-2">
				<Button variant="link" size="xs" class="h-auto p-0" href={da6Href}>Open the DA 6</Button>
			</div>
		{/if}
	</Popover.Content>
</Popover.Root>
