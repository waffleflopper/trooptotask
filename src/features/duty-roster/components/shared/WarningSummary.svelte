<script lang="ts">
	import { AlertTriangle, CheckCircle2, CircleAlert, Info } from '@lucide/svelte';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import { Button } from '$lib/components/ui/button/index.js';

	type WarningSummaryTone = 'info' | 'warning' | 'destructive' | 'success';

	type Props = {
		tone?: WarningSummaryTone;
		title: string;
		description?: string;
		items?: string[];
		actionLabel?: string;
	};

	let { tone = 'info', title, description, items = [], actionLabel }: Props = $props();
</script>

<Alert.Root variant={tone}>
	{#if tone === 'warning'}
		<AlertTriangle />
	{:else if tone === 'destructive'}
		<CircleAlert />
	{:else if tone === 'success'}
		<CheckCircle2 />
	{:else}
		<Info />
	{/if}
	<Alert.Title>{title}</Alert.Title>
	<Alert.Description>
		{#if description}
			<span>{description}</span>
		{/if}
		{#if items.length > 0}
			<ul class="mt-1 list-disc space-y-1 pl-4">
				{#each items as item (item)}
					<li>{item}</li>
				{/each}
			</ul>
		{/if}
	</Alert.Description>
	{#if actionLabel}
		<div class="col-start-2 mt-2">
			<Button variant="outline" size="sm">{actionLabel}</Button>
		</div>
	{/if}
</Alert.Root>
