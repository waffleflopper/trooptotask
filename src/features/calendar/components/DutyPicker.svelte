<script lang="ts">
	import { untrack } from 'svelte';
	import type { AssignmentType } from '$features/calendar/contracts';
	import { DUTY_LOOKBACK_DAYS } from '$features/calendar/utils/calendarRange';
	import { readDutyFilter, writeDutyFilter } from '$features/calendar/stores/dutyPickerFilters';
	import {
		applyDutyFilter,
		DUTY_FILTER_FACETS,
		dutyFilterValues,
		EMPTY_DUTY_FILTER,
		type DutyFilterFacet,
		type DutyPickerFilter
	} from '$features/calendar/utils/dutyPickerFilter';
	import { dutySearchScore, type DutyPickerOption } from '$features/calendar/utils/dutyPickerOptions';
	import { Button } from '$lib/components/ui/button';
	import * as Command from '$lib/components/ui/command';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import * as Popover from '$lib/components/ui/popover';

	interface Props {
		/** Whose remembered filter this picker uses. */
		typeId: string;
		typeName: string;
		assignTo: AssignmentType['assignTo'];
		date: Date;
		/** Where the popup is positioned. */
		anchor: HTMLElement;
		/** Where focus lands on close, for an anchor that may be gone by then; defaults to the anchor. */
		returnFocusTo?: () => HTMLElement | null;
		options: readonly DutyPickerOption[];
		onAssign: (assigneeId: string) => Promise<boolean>;
		/** Offered only for a slot that already has someone. */
		onClear?: () => Promise<boolean>;
		onClose: () => void;
	}

	let { typeId, typeName, assignTo, date, anchor, returnFocusTo, options, onAssign, onClear, onClose }: Props =
		$props();

	let filter = $state<DutyPickerFilter>(readDutyFilter(untrack(() => typeId)));

	const facets = $derived(
		assignTo === 'personnel'
			? DUTY_FILTER_FACETS.map(({ key, label }) => {
					const values = dutyFilterValues(options, key);
					const selected = filter[key].filter((value) => values.includes(value));
					return { key, label, values, selected };
				}).filter(({ values }) => values.length > 0)
			: []
	);
	const filterActive = $derived(facets.some(({ selected }) => selected.length > 0));
	const visibleOptions = $derived(applyDutyFilter(options, filter));

	function setFilter(next: DutyPickerFilter) {
		filter = next;
		writeDutyFilter(typeId, next);
	}

	function toggleValue(facet: DutyFilterFacet, value: string, on: boolean) {
		const rest = filter[facet].filter((v) => v !== value);
		setFilter({ ...filter, [facet]: on ? [...rest, value] : rest });
	}

	const emptyMessage = $derived(
		assignTo === 'group'
			? 'No group matches.'
			: filterActive && !visibleOptions.length
				? 'No one matches these filters.'
				: 'No one matches.'
	);

	const findLabel = $derived(assignTo === 'group' ? 'Find group' : 'Find person');

	const dateTitle = $derived(date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }));

	let pending = $state(false);
	let dismissed = false;

	async function run(action: () => Promise<boolean>) {
		if (pending) return;
		pending = true;
		try {
			if ((await action()) && !dismissed) onClose();
		} finally {
			pending = false;
		}
	}

	function dismiss() {
		dismissed = true;
		onClose();
	}

	let content = $state<HTMLElement | null>(null);

	function focusSearch(event: Event) {
		event.preventDefault();
		content?.querySelector<HTMLElement>('[data-command-input]')?.focus();
	}

	function returnFocus(event: Event) {
		event.preventDefault();
		const target = returnFocusTo?.() ?? anchor;
		if (target.isConnected) target.focus();
	}

	function lastDutyAccessibleText(option: DutyPickerOption): string {
		if (option.kind === 'group') return '';
		return option.lastDuty.kind === 'none'
			? `, no duty in the last ${DUTY_LOOKBACK_DAYS} days`
			: `, last on duty ${option.lastDuty.daysSince} ${option.lastDuty.daysSince === 1 ? 'day' : 'days'} ago`;
	}
</script>

<Popover.Root open onOpenChange={(open) => !open && dismiss()}>
	<Popover.Content
		bind:ref={content}
		customAnchor={anchor}
		align="start"
		collisionPadding={8}
		class="w-80 max-w-(--bits-popover-content-available-width) gap-0 p-0"
		role="dialog"
		aria-label={`${typeName}, ${dateTitle}`}
		onOpenAutoFocus={focusSearch}
		onCloseAutoFocus={returnFocus}
	>
		<Popover.Header class="px-3 pt-3 pb-1">
			<p class="font-mono text-[10px] font-semibold tracking-widest text-muted-foreground uppercase">{typeName}</p>
			<Popover.Title>{dateTitle}</Popover.Title>
		</Popover.Header>
		{#if facets.length}
			<div class="flex items-center gap-1 px-3 pb-2">
				{#each facets as facet (facet.key)}
					<DropdownMenu.Root>
						<DropdownMenu.Trigger>
							{#snippet child({ props })}
								<Button
									{...props}
									variant="outline"
									size="xs"
									class="font-mono text-[10px] tracking-widest uppercase"
									aria-label={`Filter by ${facet.label}${facet.selected.length ? `, ${facet.selected.length} selected` : ''}`}
								>
									{facet.label}{facet.selected.length ? ` · ${facet.selected.length}` : ''}
								</Button>
							{/snippet}
						</DropdownMenu.Trigger>
						<DropdownMenu.Content class="max-h-64 w-auto min-w-36" align="start">
							{#each facet.values as value (value)}
								<DropdownMenu.CheckboxItem
									closeOnSelect={false}
									checked={facet.selected.includes(value)}
									onCheckedChange={(on) => toggleValue(facet.key, value, on)}
								>
									{value}
								</DropdownMenu.CheckboxItem>
							{/each}
						</DropdownMenu.Content>
					</DropdownMenu.Root>
				{/each}
				{#if filterActive}
					<Button
						variant="ghost"
						size="xs"
						class="ml-auto font-mono text-[10px] tracking-widest uppercase"
						aria-label="Clear filters"
						onclick={() => setFilter(EMPTY_DUTY_FILTER)}
					>
						Clear
					</Button>
				{/if}
			</div>
		{/if}
		<Command.Root class="rounded-lg!" label={findLabel} filter={dutySearchScore}>
			<Command.Input placeholder={findLabel} />
			<Command.List class={['max-h-80', pending && 'pointer-events-none opacity-60']} aria-busy={pending}>
				<Command.Empty>{emptyMessage}</Command.Empty>
				{#each visibleOptions as option (option.id)}
					{@const prefix = option.kind === 'personnel' ? option.prefix : undefined}
					{@const unavailable = option.kind === 'personnel' ? option.unavailable : undefined}
					<Command.Item
						value={option.id}
						keywords={[option.label, prefix ?? '']}
						aria-label={[prefix, option.label].filter(Boolean).join(' ') +
							(unavailable ? `, unavailable: ${unavailable}` : '') +
							lastDutyAccessibleText(option) +
							(option.current ? ', assigned' : '')}
						data-checked={option.current}
						onSelect={() => run(() => onAssign(option.id))}
					>
						{#if prefix}
							<span class="w-9 shrink-0 font-mono text-[10px] font-semibold text-muted-foreground uppercase"
								>{prefix}</span
							>
						{/if}
						<span class="flex min-w-0 flex-1 flex-col">
							<span class={['truncate', unavailable ? 'text-muted-foreground' : 'font-medium']}>{option.label}</span>
							{#if unavailable}
								<span class="truncate font-mono text-[10px] text-destructive uppercase">{unavailable}</span>
							{/if}
						</span>
						{#if option.kind === 'personnel'}
							<span class="shrink-0 font-mono text-[10px] text-muted-foreground" aria-hidden="true"
								>{option.lastDuty.kind === 'none'
									? `none in ${DUTY_LOOKBACK_DAYS}d`
									: `${option.lastDuty.daysSince}d`}</span
							>
						{/if}
					</Command.Item>
				{/each}
			</Command.List>
		</Command.Root>
		{#if onClear}
			<div class="border-t p-1">
				<Button
					variant="ghost"
					size="sm"
					class="w-full justify-start text-destructive-text"
					disabled={pending}
					onclick={() => run(onClear)}
				>
					Clear assignment
				</Button>
			</div>
		{/if}
	</Popover.Content>
</Popover.Root>
