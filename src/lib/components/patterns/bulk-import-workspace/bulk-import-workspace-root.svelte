<script lang="ts">
	import { tick, untrack, type Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils.js';

	type Props = HTMLAttributes<HTMLElement> & {
		children?: Snippet;
		ariaLabel?: string;
		/** The consumer's current step. When it changes and that removes the focused control, the next step heading takes focus. */
		step?: unknown;
	};

	let { children, ariaLabel, step, class: className, ...restProps }: Props = $props();
	let root = $state<HTMLElement | null>(null);
	let renderedStep = untrack(() => step);

	// A dialog's footer holds its step controls, so inside a dialog the whole dialog owns the step's focus.
	function focusOwner(): HTMLElement | null {
		return root?.closest<HTMLElement>('[role="dialog"]') ?? root;
	}

	// Runs before the step's markup is replaced. Focus inside waits on the owner, so neither the browser nor a
	// dialog's focus trap relocates it, then returns to a control that survived or goes to the new step heading.
	// Focus still waiting on the owner, as through a step without a heading, goes to the next heading.
	$effect.pre(() => {
		if (step === renderedStep) return;
		renderedStep = step;
		const owner = focusOwner();
		const focused = document.activeElement;
		if (!owner || !(focused instanceof HTMLElement) || !owner.contains(focused)) return;
		if (!owner.hasAttribute('tabindex')) owner.tabIndex = -1;
		owner.focus({ preventScroll: true });
		void tick().then(() => {
			if (document.activeElement !== owner) return;
			if (focused !== owner && focused.isConnected) {
				focused.focus();
				return;
			}
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
