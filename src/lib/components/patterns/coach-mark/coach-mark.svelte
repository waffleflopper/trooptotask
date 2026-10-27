<script lang="ts">
	import type { Snippet } from 'svelte';
	import XIcon from '@lucide/svelte/icons/x';
	import { cn } from '$lib/utils';

	let {
		open,
		id,
		title,
		body,
		onDismiss,
		children,
		class: className
	}: {
		open: boolean;
		/** Point the anchored control's aria-describedby here while the hint is open. */
		id: string;
		title: string;
		body?: string;
		onDismiss: () => void;
		/** The control the hint points at. The hint sits under it in flow, so it never covers what follows. */
		children: Snippet;
		class?: string;
	} = $props();

	function dismissOnEscape(node: HTMLElement) {
		function onkeydown(event: KeyboardEvent) {
			if (!open || event.key !== 'Escape') return;
			// Escape closes the hint before the dialog or sheet around it.
			event.preventDefault();
			event.stopPropagation();
			onDismiss();
		}
		node.addEventListener('keydown', onkeydown);
		return () => node.removeEventListener('keydown', onkeydown);
	}
</script>

<div class={cn('grid', className)} {@attach dismissOnEscape}>
	{@render children()}
	{#if open}
		<div {id} data-slot="coach-mark" class="mt-2.5 flex flex-col">
			<svg aria-hidden="true" width="14" height="7" viewBox="0 0 14 7" class="ml-7 shrink-0 fill-chrome">
				<path d="M0 7L7 0l7 7z" />
			</svg>
			<div
				class="flex items-start gap-2.5 rounded-md bg-chrome py-3.5 pr-3.5 pl-4 shadow-[0_10px_24px_rgb(0_0_0/0.24)]"
			>
				<div class="grid flex-1 gap-1.5">
					<p class="text-sm leading-[19px] font-semibold text-chrome-text">{title}</p>
					{#if body}<p class="text-[13px] leading-[18px] text-chrome-text-muted">{body}</p>{/if}
				</div>
				<button
					type="button"
					aria-label="Dismiss hint"
					class="flex size-5 shrink-0 items-center justify-center rounded-sm text-chrome-text-muted outline-none hover:text-chrome-text focus-visible:ring-2 focus-visible:ring-chrome-accent"
					onclick={onDismiss}
				>
					<XIcon aria-hidden="true" class="size-3" />
				</button>
			</div>
		</div>
	{/if}
</div>
