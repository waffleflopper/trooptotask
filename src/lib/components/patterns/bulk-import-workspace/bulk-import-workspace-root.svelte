<script lang="ts" module>
	const WORKSPACE_SELECTOR = '[data-slot="bulk-import-workspace"]';
	let lastWorkspaceFocus: Element | null = null;
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils.js';

	type Props = HTMLAttributes<HTMLElement> & {
		children?: Snippet;
		ariaLabel?: string;
	};

	let { children, ariaLabel, class: className, ...restProps }: Props = $props();
	let root = $state<HTMLElement | null>(null);

	function focusIsLost() {
		return lastWorkspaceFocus !== null && !lastWorkspaceFocus.isConnected && document.activeElement === document.body;
	}

	function restoreLostFocus() {
		if (!root || !focusIsLost()) return;
		const heading = root.querySelector<HTMLElement>('h2, h3');
		const target =
			heading ?? root.querySelector<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled)');
		if (!target) return;
		lastWorkspaceFocus = null;
		if (target === heading) heading.tabIndex = -1;
		target.focus();
	}

	$effect(() => {
		if (!root) return;
		const trackFocus = (event: FocusEvent) => {
			lastWorkspaceFocus =
				event.target instanceof Element && event.target.closest(WORKSPACE_SELECTOR) ? event.target : null;
		};
		const observer = new MutationObserver(restoreLostFocus);
		observer.observe(root, { childList: true, subtree: true });
		document.addEventListener('focusin', trackFocus);
		restoreLostFocus();
		return () => {
			observer.disconnect();
			document.removeEventListener('focusin', trackFocus);
			setTimeout(() => (lastWorkspaceFocus = null));
		};
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
