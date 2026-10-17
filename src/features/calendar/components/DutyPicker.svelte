<script lang="ts">
	import type { AssignmentType } from '$features/calendar/contracts';
	import { DUTY_LOOKBACK_DAYS } from '$features/calendar/utils/calendarRange';
	import { dutySearchScore, type DutyPickerOption } from '$features/calendar/utils/dutyPickerOptions';
	import { Button } from '$lib/components/ui/button';
	import * as Command from '$lib/components/ui/command';
	import * as Popover from '$lib/components/ui/popover';

	interface Props {
		typeName: string;
		assignTo: AssignmentType['assignTo'];
		date: Date;
		anchor: HTMLElement;
		options: readonly DutyPickerOption[];
		onAssign: (assigneeId: string) => Promise<boolean>;
		/** Offered only for a slot that already has someone. */
		onClear?: () => Promise<boolean>;
		onClose: () => void;
	}

	let { typeName, assignTo, date, anchor, options, onAssign, onClear, onClose }: Props = $props();

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

	function returnFocus(event: Event) {
		event.preventDefault();
		if (anchor.isConnected) anchor.focus();
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
		customAnchor={anchor}
		align="start"
		collisionPadding={8}
		class="w-80 max-w-(--bits-popover-content-available-width) gap-0 p-0"
		role="dialog"
		aria-label={`${typeName}, ${dateTitle}`}
		onCloseAutoFocus={returnFocus}
	>
		<Popover.Header class="px-3 pt-3 pb-1">
			<p class="font-mono text-[10px] font-semibold tracking-widest text-muted-foreground uppercase">{typeName}</p>
			<Popover.Title>{dateTitle}</Popover.Title>
		</Popover.Header>
		<Command.Root class="rounded-lg!" label={findLabel} filter={dutySearchScore}>
			<Command.Input placeholder={findLabel} />
			<Command.List class={['max-h-80', pending && 'pointer-events-none opacity-60']} aria-busy={pending}>
				<Command.Empty>{assignTo === 'group' ? 'No group matches.' : 'No one matches.'}</Command.Empty>
				{#each options as option (option.id)}
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
