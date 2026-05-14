<script lang="ts">
	import CheckIcon from '@lucide/svelte/icons/check';
	import ChevronsUpDownIcon from '@lucide/svelte/icons/chevrons-up-down';
	import XIcon from '@lucide/svelte/icons/x';
	import { tick } from 'svelte';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import * as Command from '$lib/components/ui/command';
	import * as Popover from '$lib/components/ui/popover';
	import { cn } from '$lib/utils';

	export type SearchableRuleMultiSelectOption = {
		value: string;
		label: string;
		description?: string;
	};

	interface Props {
		options: SearchableRuleMultiSelectOption[];
		value: string[];
		label: string;
		placeholder?: string;
		emptyLabel?: string;
		disabled?: boolean;
		class?: string;
	}

	let {
		options,
		value = $bindable(),
		label,
		placeholder = 'Search options...',
		emptyLabel = 'No matches',
		disabled = false,
		class: className
	}: Props = $props();

	let open = $state(false);
	let triggerRef = $state<HTMLButtonElement | null>(null);

	const selectedOptions = $derived(options.filter((option) => value.includes(option.value)));
	const selectedValueSet = $derived(new Set(value));
	const summary = $derived.by(() => {
		if (selectedOptions.length === 0) return placeholder;
		if (selectedOptions.length <= 3) return selectedOptions.map((option) => option.label).join(', ');
		return `${selectedOptions.length} selected`;
	});

	function toggleValue(nextValue: string) {
		value = selectedValueSet.has(nextValue)
			? value.filter((currentValue) => currentValue !== nextValue)
			: [...value, nextValue];
	}

	function removeValue(nextValue: string) {
		value = value.filter((currentValue) => currentValue !== nextValue);
		tick().then(() => triggerRef?.focus());
	}
</script>

<div class={cn('grid gap-2', className)}>
	<Popover.Root bind:open>
		<Popover.Trigger>
			{#snippet child({ props })}
				<Button
					{...props}
					bind:ref={triggerRef}
					type="button"
					variant="outline"
					{disabled}
					aria-label={label}
					aria-expanded={open}
					class={cn(
						'w-full justify-between text-left font-normal',
						selectedOptions.length === 0 && 'text-muted-foreground'
					)}
				>
					<span class="truncate">{summary}</span>
					<ChevronsUpDownIcon class="opacity-50" aria-hidden="true" />
				</Button>
			{/snippet}
		</Popover.Trigger>
		<Popover.Content align="start" class="w-(--bits-popover-anchor-width) p-0">
			<Command.Root {label}>
				<Command.Input {placeholder} />
				<Command.List>
					<Command.Empty>{emptyLabel}</Command.Empty>
					<Command.Group>
						{#each options as option (option.value)}
							<Command.Item
								value={`${option.label} ${option.description ?? ''}`}
								data-checked={selectedValueSet.has(option.value)}
								onSelect={() => toggleValue(option.value)}
							>
								<CheckIcon
									class={cn('opacity-0', selectedValueSet.has(option.value) && 'opacity-100')}
									aria-hidden="true"
								/>
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
		</Popover.Content>
	</Popover.Root>

	{#if selectedOptions.length > 0}
		<div class="flex flex-wrap gap-1.5" aria-label={`${label} selected values`}>
			{#each selectedOptions as option (option.value)}
				<Badge variant="outline" class="gap-1 pr-1">
					{option.label}
					<button
						type="button"
						class="rounded-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
						aria-label={`Remove ${option.label}`}
						onclick={() => removeValue(option.value)}
					>
						<XIcon class="size-3" aria-hidden="true" />
					</button>
				</Badge>
			{/each}
		</div>
	{/if}
</div>
