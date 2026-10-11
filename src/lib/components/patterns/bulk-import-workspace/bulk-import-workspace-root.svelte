<script lang="ts">
	import { tick, untrack, type Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils.js';

	type Props = HTMLAttributes<HTMLElement> & {
		children?: Snippet;
		ariaLabel?: string;
		/** The consumer's current step. When it changes and that removes the focused control, the new step's heading takes focus. */
		step?: unknown;
	};

	let { children, ariaLabel, step, class: className, ...restProps }: Props = $props();
	let root = $state<HTMLElement | null>(null);
	let renderedStep = untrack(() => step);

	// Runs before the step's markup is replaced, so it can still see whether focus was inside.
	$effect.pre(() => {
		if (step === renderedStep) return;
		renderedStep = step;
		if (!root?.contains(document.activeElement)) return;
		void tick().then(() => {
			const active = document.activeElement;
			if (active && active !== document.body && active.isConnected) return;
			const heading = root?.querySelector<HTMLElement>('h2, h3');
			if (!heading) return;
			heading.tabIndex = -1;
			heading.focus();
		});
	});
</script>

<section
	bind:this={root}
	data-slot="bulk-import-workspace"
	aria-label={ariaLabel}
	class={cn('flex w-full min-w-0 flex-col gap-4 bg-background text-foreground', className)}
	{...restProps}
>
	{@render children?.()}
</section>
