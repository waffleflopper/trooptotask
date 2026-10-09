<script lang="ts">
	import type { HTMLInputAttributes } from 'svelte/elements';
	import { Input } from '$lib/components/ui/input/index.js';
	import { cn } from '$lib/utils.js';

	interface Props extends Omit<HTMLInputAttributes, 'type' | 'value' | 'files'> {
		value?: string;
	}

	let { class: className, value = $bindable('#6b7280'), ...restProps }: Props = $props();
</script>

<div data-slot="type-management-workspace-color-input" class="flex items-center gap-3">
	<Input type="color" bind:value class={cn('h-10 w-16 p-1', className)} {...restProps} />
	<span data-slot="type-management-workspace-color-value" class="font-mono text-sm uppercase text-muted-foreground">
		{value}
	</span>
</div>
