<script lang="ts" module>
	export type ProjectionLaneStatus =
		| { readonly kind: 'loading'; readonly what: string }
		| { readonly kind: 'error'; readonly what: string; readonly retry?: () => void };
</script>

<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Skeleton } from '$lib/components/ui/skeleton';

	let { value }: { value: ProjectionLaneStatus } = $props();
</script>

{#if value.kind === 'loading'}
	<div class="flex w-full min-w-48 items-center gap-2 px-2">
		<Skeleton class="h-3.5 w-32" aria-hidden="true" />
		<Skeleton class="hidden h-3.5 w-20 sm:block" aria-hidden="true" />
		<span class="sr-only">Loading {value.what}</span>
	</div>
{:else}
	<div class="flex items-center gap-2 px-2 text-[11px] text-destructive-text">
		<span>{value.what} could not be loaded.</span>
		{#if value.retry}
			<Button
				type="button"
				variant="outline"
				size="xs"
				class="h-5 px-1.5 text-[11px]"
				aria-label={`Retry loading ${value.what}`}
				onclick={value.retry}
			>
				Retry
			</Button>
		{/if}
	</div>
{/if}
