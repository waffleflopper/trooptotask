<script lang="ts">
	import type { AssignmentType } from '$features/calendar/contracts';
	import { dutySearchScore, type DutyPickerOption } from '$features/calendar/utils/dutyPickerOptions';
	import { Button } from '$lib/components/ui/button';
	import * as Command from '$lib/components/ui/command';
	import * as Popover from '$lib/components/ui/popover';

	interface Props {
		typeName: string;
		assignTo: AssignmentType['assignTo'];
		date: Date;
		/** Where the popup is positioned. */
		anchor: HTMLElement;
		/** Where focus lands on close, for an anchor that may be gone by then; defaults to the anchor. */
		returnFocusTo?: () => HTMLElement | null;
		options: readonly DutyPickerOption[];
		/** True while the roster counts for this day are still loading. */
		countsLoading?: boolean;
		onAssign: (assigneeId: string) => Promise<boolean>;
		/** Offered only for a slot that already has someone. */
		onClear?: () => Promise<boolean>;
		onClose: () => void;
	}

	let {
		typeName,
		assignTo,
		date,
		anchor,
		returnFocusTo,
		options,
		countsLoading = false,
		onAssign,
		onClear,
		onClose
	}: Props = $props();

	let search = $state('');
	const searching = $derived(search.trim().length > 0);
	// People outside the pool appear only for a name search, so the list is the roster until someone looks further.
	const visibleOptions = $derived(
		searching ? options : options.filter((option) => option.kind === 'group' || !option.offRoster || option.current)
	);

	const emptyMessage = $derived(assignTo === 'group' ? 'No group matches.' : 'No one matches.');

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

	function accessibleName(option: DutyPickerOption): string {
		if (option.kind === 'group') return option.label + (option.current ? ', assigned' : '');
		return (
			[option.prefix, option.label].filter(Boolean).join(' ') +
			(option.count === undefined ? '' : `, count ${option.count}`) +
			(option.unavailable ? `, unavailable: ${option.unavailable}` : '') +
			(option.offRoster ? ', not on this roster' : '') +
			(option.current ? ', assigned' : '')
		);
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
		<Command.Root class="rounded-lg!" label={findLabel} filter={dutySearchScore}>
			<Command.Input placeholder={findLabel} bind:value={search} />
			{#if countsLoading}
				<p class="px-3 pt-1.5 font-mono text-[10px] tracking-wider text-muted-foreground uppercase" role="status">
					Loading roster counts…
				</p>
			{/if}
			<Command.List class={['max-h-80', pending && 'pointer-events-none opacity-60']} aria-busy={pending}>
				<Command.Empty>{emptyMessage}</Command.Empty>
				{#each visibleOptions as option (option.id)}
					{@const person = option.kind === 'personnel' ? option : null}
					<Command.Item
						value={option.id}
						keywords={[option.label, person?.prefix ?? '']}
						aria-label={accessibleName(option)}
						data-checked={option.current}
						onSelect={() => run(() => onAssign(option.id))}
					>
						{#if person?.prefix}
							<span class="w-9 shrink-0 font-mono text-[10px] font-semibold text-muted-foreground uppercase"
								>{person.prefix}</span
							>
						{/if}
						<span class="flex min-w-0 flex-1 flex-col">
							<span class={['truncate', person?.unavailable ? 'text-muted-foreground' : 'font-medium']}
								>{option.label}</span
							>
							{#if person?.unavailable}
								<span class="truncate font-mono text-[10px] text-destructive uppercase">{person.unavailable}</span>
							{/if}
							{#if person?.offRoster}
								<span class="truncate font-mono text-[10px] text-muted-foreground uppercase">Not on this roster</span>
							{/if}
						</span>
						{#if person?.count !== undefined}
							<span
								class={[
									'shrink-0 font-mono text-[11px] tabular-nums',
									person.unavailable ? 'text-muted-foreground' : 'font-semibold'
								]}
								aria-hidden="true">{person.count}</span
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
