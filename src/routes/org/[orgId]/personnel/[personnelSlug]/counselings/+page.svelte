<script lang="ts">
	import type { PersonnelDetailSubpageData } from '$features/personnel/personnel-detail.types';

	let { data }: { data: PersonnelDetailSubpageData } = $props();
</script>

<main class="p-6">
	<section class="rounded-md border bg-card">
		<div class="border-b p-4">
			<h2 class="text-lg font-semibold">{data.title}</h2>
		</div>
		<div class="p-6">
			<p class="text-sm text-muted-foreground">{data.emptyState}</p>
		</div>
	</section>
</main>
