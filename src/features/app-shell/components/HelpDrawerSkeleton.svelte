<script lang="ts">
	import { Skeleton } from '$lib/components/ui/skeleton/index.js';
</script>

<aside
	aria-label="Help"
	aria-busy="true"
	data-print-chrome
	class="fixed right-0 bottom-0 top-[calc(var(--banner-height,0px)+3.5rem)] md:top-[calc(var(--banner-height,0px)+4rem)] md:right-2 md:bottom-2 md:overflow-hidden md:rounded-br-md z-sheet flex w-full flex-col border-l border-border bg-background shadow-xl sm:w-[440px]"
>
	<div class="shrink-0 border-b border-chrome-border bg-chrome px-6 pt-4 pb-5">
		<Skeleton class="h-3 w-10 bg-chrome-surface-muted" />
		<Skeleton class="mt-2 h-8 w-40 bg-chrome-surface-muted" />
		<Skeleton class="mt-4 h-10 w-full bg-chrome-surface-muted" />
	</div>
	<div class="grid content-start gap-4 px-6 pt-5">
		<Skeleton class="h-4 w-24" />
		<Skeleton class="h-20 w-full" />
		<Skeleton class="h-16 w-full" />
		<Skeleton class="h-16 w-full" />
	</div>
</aside>
