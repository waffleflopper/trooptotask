<script lang="ts">
	import type { ComponentProps, Snippet } from 'svelte';
	import * as Command from '$lib/components/ui/command/index.js';
	import { cn } from '$lib/utils.js';

	type Props = ComponentProps<typeof Command.Empty> & {
		children?: Snippet;
	};

	let { class: className, children, ...restProps }: Props = $props();
</script>

<Command.Empty class={cn('py-6 text-center text-sm text-muted-foreground', className)} {...restProps}>
	{@render children?.()}
</Command.Empty>
