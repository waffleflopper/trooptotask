<script lang="ts">
	import EllipsisIcon from '@lucide/svelte/icons/ellipsis';
	import type { AssignmentType } from '$features/calendar/contracts';
	import type { AssignmentWrite, QuickFillDays } from '$features/calendar/utils/assignmentPlanner';
	import type { AssigneeChoice } from '$features/calendar/utils/dutyPickerOptions';
	import { Button } from '$lib/components/ui/button';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import * as Field from '$lib/components/ui/field';
	import { NativeSelect } from '$lib/components/ui/native-select';
	import * as Popover from '$lib/components/ui/popover';
	import * as ToggleGroup from '$lib/components/ui/toggle-group';

	interface Props {
		type: AssignmentType;
		choices: readonly AssigneeChoice[];
		busy: boolean;
		buildBatch: (assigneeId: string, days: QuickFillDays, onlyOpenDays: boolean) => AssignmentWrite[];
		onApply: (batch: AssignmentWrite[]) => Promise<boolean>;
		onClearMonth: () => void;
	}

	let { type, choices, busy, buildBatch, onApply, onClearMonth }: Props = $props();

	let open = $state(false);
	let assigneeId = $state('');
	let days = $state<QuickFillDays>('weekdays');
	let onlyOpenDays = $state(true);
	let applying = $state(false);

	const batch = $derived(buildBatch(assigneeId, days, onlyOpenDays));
	const replaced = $derived(buildBatch(assigneeId, days, false).length - buildBatch(assigneeId, days, true).length);
	const fillLabel = $derived(`Fill ${batch.length} ${batch.length === 1 ? 'day' : 'days'}`);
	const subject = $derived(type.assignTo === 'group' ? 'group' : 'person');
	const locked = $derived(busy || applying);

	function changeOpen(next: boolean) {
		open = next;
		if (next) {
			assigneeId = '';
			days = 'weekdays';
			onlyOpenDays = true;
		}
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

	function clearMonth() {
		open = false;
		onClearMonth();
	}
</script>

<Popover.Root {open} onOpenChange={changeOpen}>
	<Popover.Trigger>
		{#snippet child({ props })}
			<Button {...props} variant="ghost" size="icon-xs" aria-label={`${type.name} column actions`} disabled={busy}>
				<EllipsisIcon aria-hidden="true" />
			</Button>
		{/snippet}
	</Popover.Trigger>
	<Popover.Content
		align="end"
		role="dialog"
		aria-label={`Quick fill, ${type.name}`}
		class="w-80 max-w-(--bits-popover-content-available-width) gap-3 p-3"
	>
		<Popover.Header>
			<p class="font-mono text-[10px] font-semibold tracking-widest text-muted-foreground uppercase">{type.name}</p>
			<Popover.Title>Quick fill</Popover.Title>
		</Popover.Header>

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
					</Field.Description>
				</Field.Content>
			</Field.Root>
		</Field.Group>

		<div class="flex items-center gap-2">
			<Button variant="ghost-destructive" size="sm" disabled={locked} onclick={clearMonth}>Clear month</Button>
			<Button variant="ghost" size="sm" class="ml-auto" onclick={() => changeOpen(false)}>Cancel</Button>
			<Button size="sm" disabled={locked || !assigneeId || batch.length === 0} onclick={apply}>
				{applying ? 'Filling…' : fillLabel}
			</Button>
		</div>
	</Popover.Content>
</Popover.Root>
