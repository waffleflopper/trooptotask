<script lang="ts">
	import ChevronsUpDownIcon from '@lucide/svelte/icons/chevrons-up-down';
	import { tick } from 'svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Command from '$lib/components/ui/command';
	import * as Popover from '$lib/components/ui/popover';
	import { cn } from '$lib/utils';

	export interface SearchComboboxOption {
		value: string;
		label: string;
		description?: string;
	}

	interface Props {
		options: SearchComboboxOption[];
		value: string;
		placeholder?: string;
		disabled?: boolean;
		clearable?: boolean;
		onchange?: (value: string) => void;
		id?: string;
		ariaLabel?: string;
		class?: string;
	}

	let {
		options,
		value = $bindable(),
		placeholder = 'Search...',
		disabled = false,
		clearable = true,
		onchange,
		id = 'scb-' + Math.random().toString(36).slice(2, 8),
		ariaLabel,
		class: className
	}: Props = $props();

	let open = $state(false);
	let triggerRef = $state<HTMLButtonElement | null>(null);
	const selectedOption = $derived(options.find((option) => option.value === value));

	function selectValue(nextValue: string) {
		value = nextValue;
		onchange?.(nextValue);
		open = false;
		tick().then(() => triggerRef?.focus());
	}

	function clearValue() {
		if (!clearable || disabled) return;
		selectValue('');
	}
</script>

<Popover.Root bind:open>
	<Popover.Trigger>
		{#snippet child({ props })}
			<Button
				{...props}
				{id}
				bind:ref={triggerRef}
				type="button"
				variant="outline"
				{disabled}
				aria-label={ariaLabel}
				aria-expanded={open}
				class={cn(
					'w-full justify-between text-left font-normal',
					!selectedOption && 'text-muted-foreground',
					className
				)}
			>
				<span class="truncate">{selectedOption?.label ?? placeholder}</span>
				<ChevronsUpDownIcon class="opacity-50" />
			</Button>
		{/snippet}
	</Popover.Trigger>
	<Popover.Content align="start" class="w-(--bits-popover-anchor-width) p-0">
		<Command.Root label={ariaLabel ?? placeholder}>
			<Command.Input {placeholder} />
			<Command.List>
				<Command.Empty>No matches</Command.Empty>
				<Command.Group>
					{#each options as option (option.value)}
						<Command.Item
							value={`${option.label} ${option.description ?? ''}`}
							data-checked={option.value === value}
							onSelect={() => selectValue(option.value)}
						>
							<span class="grid min-w-0 gap-0.5">
								<span class="truncate">{option.label}</span>
								{#if option.description}
									<span class="truncate text-xs text-muted-foreground">{option.description}</span>
								{/if}
							</span>
						</Command.Item>
					{/each}
				</Command.Group>
			</Command.List>
		</Command.Root>
		{#if clearable && value}
			<div class="border-t p-1">
				<Button type="button" variant="ghost" size="sm" class="w-full justify-start" onclick={clearValue}>
					Clear selection
				</Button>
			</div>
		{/if}
	</Popover.Content>
</Popover.Root>
