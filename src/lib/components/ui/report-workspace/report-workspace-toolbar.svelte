<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import * as WorkspaceToolbar from '$lib/components/ui/workspace-toolbar/index.js';
	import { cn } from '$lib/utils.js';

	type Props = HTMLAttributes<HTMLDivElement> & {
		ariaLabel: string;
		children?: Snippet;
	};

	let { ariaLabel, children, class: className, ...restProps }: Props = $props();
</script>

<WorkspaceToolbar.Root {ariaLabel} class={cn(className)} {...restProps}>
	{@render children?.()}
</WorkspaceToolbar.Root>
