<script lang="ts">
	import { Progress } from '$lib/components/ui/progress/index.js';
	import { Spinner } from '$lib/components/ui/spinner/index.js';

	type Props = {
		title: string;
		description?: string;
		value?: number;
	};

	let { title, description, value }: Props = $props();
</script>

<div
	role="status"
	aria-live="polite"
	aria-busy="true"
	data-slot="bulk-import-progress-state"
	class="flex min-h-36 flex-col items-center justify-center gap-3 rounded-lg border border-border bg-card p-6 text-center text-card-foreground"
>
	<Spinner class="size-5" />
	<div class="space-y-1">
		<p class="font-medium">{title}</p>
		{#if description}
			<p class="text-sm text-muted-foreground">{description}</p>
		{/if}
	</div>
	{#if value !== undefined}
		<Progress {value} class="max-w-sm" />
	{/if}
</div>
