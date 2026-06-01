<script lang="ts" module>
	export interface OptionListItem {
		id: string;
		label: string;
	}
</script>

<script lang="ts">
	import { Checkbox } from '$lib/components/ui/checkbox/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { cn } from '$lib/utils.js';

	interface Props {
		options: readonly OptionListItem[];
		selectedIds: ReadonlySet<string>;
		onToggle: (id: string) => void;
		ariaLabel?: string;
		emptyMessage?: string;
		class?: string;
	}

	let {
		options,
		selectedIds,
		onToggle,
		ariaLabel,
		emptyMessage = 'No options available.',
		class: className
	}: Props = $props();
</script>

<div
	role="group"
	aria-label={ariaLabel}
	class={cn('flex max-h-56 flex-col gap-0.5 overflow-y-auto rounded-md border border-border p-1', className)}
>
	{#each options as option (option.id)}
		<Label class="cursor-pointer rounded-md px-2 py-1.5 text-sm font-normal transition-colors hover:bg-muted">
			<Checkbox bind:checked={() => selectedIds.has(option.id), () => onToggle(option.id)} />
			<span class="min-w-0 flex-1 [overflow-wrap:anywhere]" title={option.label}>{option.label}</span>
		</Label>
	{:else}
		<p class="px-2 py-1.5 text-xs text-muted-foreground [overflow-wrap:anywhere]">{emptyMessage}</p>
	{/each}
</div>
