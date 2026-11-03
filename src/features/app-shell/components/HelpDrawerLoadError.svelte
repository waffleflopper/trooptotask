<script lang="ts">
	import X from '@lucide/svelte/icons/x';
	import { Button } from '$lib/components/ui/button/index.js';

	let { onClose }: { onClose: () => void } = $props();
</script>

<aside
	aria-label="Help"
	data-print-chrome
	class="fixed right-0 bottom-0 top-[calc(var(--banner-height,0px)+3.5rem)] z-sheet flex w-full flex-col border-l border-border bg-background shadow-xl sm:w-[440px]"
>
	<header class="shrink-0 border-b border-chrome-border bg-chrome px-6 pt-4 pb-5 text-chrome-text">
		<div class="flex items-start justify-between gap-3">
			<div class="min-w-0">
				<p class="font-heading text-xs font-semibold tracking-[0.14em] text-chrome-accent uppercase">Help</p>
				<h2 class="mt-1 font-heading text-[32px] leading-[1.05] font-extrabold tracking-[-0.01em] uppercase">
					How do I…
				</h2>
			</div>
			<Button
				variant="ghost"
				size="icon-sm"
				aria-label="Close help"
				onclick={onClose}
				class="shrink-0 text-chrome-text hover:bg-chrome-hover hover:text-chrome-text"
			>
				<X />
			</Button>
		</div>
	</header>
	<div role="alert" class="grid content-start justify-items-start gap-3 px-6 pt-5">
		<p class="text-base leading-relaxed">Help could not load. Check your connection and reload the page.</p>
		<Button variant="outline" size="sm" onclick={() => location.reload()}>Reload page</Button>
	</div>
</aside>
