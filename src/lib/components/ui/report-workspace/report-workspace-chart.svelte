<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils.js';
	import Section from './report-workspace-section.svelte';

	type Props = HTMLAttributes<HTMLElement> & {
		title: string;
		description?: string;
		meta?: string;
		ariaLabel?: string;
		children?: Snippet;
		actions?: Snippet;
	};

	let { title, description, meta, ariaLabel, children, actions, class: className, ...restProps }: Props = $props();
</script>

<Section {title} {description} {meta} {actions} class={cn(className)} {...restProps}>
	<div
		role="img"
		aria-label={ariaLabel ?? title}
		data-slot="report-workspace-chart"
		class="min-h-56 min-w-0 rounded-md border border-dashed border-border bg-muted/20 p-3"
	>
		{@render children?.()}
	</div>
</Section>
