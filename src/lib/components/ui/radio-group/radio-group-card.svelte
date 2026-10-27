<script lang="ts">
	import type { Snippet } from 'svelte';
	import { cn } from '$lib/utils.js';
	import RadioGroupItem from './radio-group-item.svelte';

	interface Props {
		id: string;
		value: string;
		title: string;
		description?: string;
		disabled?: boolean;
		class?: string;
		/** Controls that belong to this choice, such as the Select that completes it. */
		children?: Snippet;
	}

	let { id, value, title, description, disabled = false, class: className, children }: Props = $props();
</script>

<div
	data-slot="radio-group-card"
	class={cn(
		'flex min-w-0 flex-col gap-2 rounded-md border bg-card p-3 transition-[border-color,box-shadow]',
		'has-[>div>[data-slot=radio-group-item][data-state=checked]]:border-foreground has-[>div>[data-slot=radio-group-item][data-state=checked]]:shadow-[inset_0_0_0_0.5px_var(--color-foreground)]',
		disabled && 'opacity-60',
		className
	)}
>
	<div class="flex items-start gap-2.5">
		<RadioGroupItem {id} {value} {disabled} class="mt-0.5" />
		<label for={id} class={cn('grid min-w-0 flex-1 gap-0.5', disabled ? 'cursor-not-allowed' : 'cursor-pointer')}>
			<span class="text-sm leading-[18px] font-medium">{title}</span>
			{#if description}
				<span class="text-[13px] leading-[18px] text-muted-foreground">{description}</span>
			{/if}
		</label>
	</div>
	{@render children?.()}
</div>
