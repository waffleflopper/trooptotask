<script lang="ts">
	import type { DutyPickerOption } from '$features/calendar/utils/dutyPickerOptions';
	import * as Command from '$lib/components/ui/command';
	import * as Popover from '$lib/components/ui/popover';

	interface Props {
		typeName: string;
		date: Date;
		anchor: HTMLElement;
		options: readonly DutyPickerOption[];
		onAssign: (assigneeId: string) => void;
		onClose: () => void;
	}

	let { typeName, date, anchor, options, onAssign, onClose }: Props = $props();

	const dateTitle = $derived(date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }));

	function assign(id: string) {
		onAssign(id);
		onClose();
	}

	function returnFocus(event: Event) {
		event.preventDefault();
		if (anchor.isConnected) anchor.focus();
	}
</script>

<Popover.Root open onOpenChange={(open) => !open && onClose()}>
	<Popover.Content
		customAnchor={anchor}
		align="start"
		collisionPadding={8}
		class="w-72 max-w-(--bits-popover-content-available-width) gap-0 p-0"
		role="dialog"
		aria-label={`${typeName}, ${dateTitle}`}
		onCloseAutoFocus={returnFocus}
	>
		<Popover.Header class="px-3 pt-3 pb-1">
			<p class="font-mono text-[10px] font-semibold tracking-widest text-muted-foreground uppercase">{typeName}</p>
			<Popover.Title>{dateTitle}</Popover.Title>
		</Popover.Header>
		<Command.Root class="rounded-lg!" label="Find person">
			<Command.Input placeholder="Find person" />
			<Command.List class="max-h-80">
				<Command.Empty>No one matches.</Command.Empty>
				{#each options as option (option.id)}
					<Command.Item
						value={option.id}
						keywords={[option.label, option.prefix ?? '']}
						aria-label={[option.prefix, option.label].filter(Boolean).join(' ') +
							(option.unavailable ? `, unavailable: ${option.unavailable}` : '') +
							(option.current ? ', assigned' : '')}
						data-checked={option.current}
						onSelect={() => assign(option.id)}
					>
						{#if option.prefix}
							<span class="w-9 shrink-0 font-mono text-[10px] font-semibold text-muted-foreground uppercase"
								>{option.prefix}</span
							>
						{/if}
						<span class="flex min-w-0 flex-col">
							<span class={['truncate', option.unavailable ? 'text-muted-foreground' : 'font-medium']}
								>{option.label}</span
							>
							{#if option.unavailable}
								<span class="truncate font-mono text-[10px] text-destructive uppercase">{option.unavailable}</span>
							{/if}
						</span>
					</Command.Item>
				{/each}
			</Command.List>
		</Command.Root>
	</Popover.Content>
</Popover.Root>
