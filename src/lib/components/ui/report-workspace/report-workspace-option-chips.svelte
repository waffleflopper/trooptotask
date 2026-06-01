<script lang="ts" module>
	export interface OptionChip {
		id: string;
		label: string;
		/** Meaningful status/assignment color, rendered as a small identity dot. */
		color?: string;
	}
</script>

<script lang="ts">
	import { Toggle } from '$lib/components/ui/toggle/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { cn } from '$lib/utils.js';

	interface Props {
		options: readonly OptionChip[];
		selectedIds: ReadonlySet<string>;
		onToggle: (id: string) => void;
		label?: string;
		ariaLabel?: string;
		onToggleAll?: () => void;
		allSelected?: boolean;
	}

	let { options, selectedIds, onToggle, label, ariaLabel, onToggleAll, allSelected = false }: Props = $props();

	const groupLabel = $derived(ariaLabel ?? label);
</script>

<div class="min-w-0 space-y-2">
	{#if label || onToggleAll}
		<div class="flex flex-wrap items-center justify-between gap-2">
			{#if label}
				<span class="font-mono text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
					{label}
				</span>
			{/if}
			<div class="flex items-center gap-2">
				<span class="text-xs text-muted-foreground">{selectedIds.size} of {options.length} selected</span>
				{#if onToggleAll}
					<Button type="button" variant="ghost" size="xs" onclick={onToggleAll}>
						{allSelected ? 'Clear' : 'Select all'}
					</Button>
				{/if}
			</div>
		</div>
	{/if}

	<div class="flex flex-wrap gap-1.5" role="group" aria-label={groupLabel}>
		{#each options as option (option.id)}
			{@const selected = selectedIds.has(option.id)}
			<Toggle
				variant="outline"
				size="sm"
				aria-label={option.label}
				title={option.label}
				class="h-auto min-h-7 max-w-full whitespace-normal text-left"
				bind:pressed={() => selectedIds.has(option.id), () => onToggle(option.id)}
			>
				{#if option.color}
					<span
						class={cn('size-2 shrink-0 rounded-full transition-opacity', !selected && 'opacity-35')}
						style:background-color={option.color}
					></span>
				{/if}
				<span class="min-w-0 [overflow-wrap:anywhere]">{option.label}</span>
			</Toggle>
		{/each}
	</div>
</div>
