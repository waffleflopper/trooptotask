<script lang="ts">
	import { Skeleton } from '$lib/components/ui/skeleton';
	import OrganizationListFrame, { rowClass } from './OrganizationListFrame.svelte';

	const ROWS = 8;
</script>

<div aria-busy="true">
	<span class="sr-only" role="status">Loading organizations</span>
	<OrganizationListFrame>
		{#each { length: ROWS } as _, index (index)}
			<li class={rowClass} aria-hidden="true">
				<div class="grid gap-1.5">
					<Skeleton class="h-5 w-48 max-w-full" />
					<Skeleton class="h-5 w-56 max-w-full" />
				</div>
				<div class="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-5 lg:contents">
					{#each { length: 5 } as _cell, cell (cell)}
						<div class="grid gap-1.5">
							<Skeleton class="h-4 w-12 lg:hidden" />
							<Skeleton class="h-6 w-16" />
						</div>
					{/each}
				</div>
			</li>
		{/each}
	</OrganizationListFrame>
</div>
