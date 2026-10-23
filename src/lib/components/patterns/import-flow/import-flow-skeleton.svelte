<script lang="ts">
	import { Skeleton } from '$lib/components/ui/skeleton';
</script>

<div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]" aria-busy="true" aria-label="Loading import">
	<Skeleton class="h-64 rounded-md" />
	<div class="grid content-start gap-3">
		<Skeleton class="h-4 w-40" />
		{#each { length: 6 }, index (index)}
			<Skeleton class="h-10" />
		{/each}
	</div>
</div>
