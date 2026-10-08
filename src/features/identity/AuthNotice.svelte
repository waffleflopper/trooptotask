<script lang="ts">
	import type { Snippet } from 'svelte';
	import AlertCircleIcon from '@lucide/svelte/icons/circle-alert';
	import CheckCircleIcon from '@lucide/svelte/icons/circle-check';
	import InfoIcon from '@lucide/svelte/icons/info';
	import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';
	import * as Alert from '$lib/components/ui/alert';

	type NoticeTone = 'error' | 'success' | 'warning' | 'info';

	interface Props {
		tone?: NoticeTone;
		title?: string;
		message?: string;
		centered?: boolean;
		children?: Snippet;
	}

	let { tone = 'info', title, message, centered = false, children }: Props = $props();

	const variant = $derived(tone === 'error' ? 'destructive' : tone);
	const role = $derived(tone === 'error' ? 'alert' : 'status');
</script>

<Alert.Root {variant} {role} class={centered ? 'justify-items-center text-center' : undefined}>
	<span class="mt-0.5 inline-flex size-4 items-center justify-center" aria-hidden="true">
		{#if tone === 'error'}
			<AlertCircleIcon />
		{:else if tone === 'success'}
			<CheckCircleIcon />
		{:else if tone === 'warning'}
			<TriangleAlertIcon />
		{:else}
			<InfoIcon />
		{/if}
	</span>

	{#if title}
		<Alert.Title>{title}</Alert.Title>
	{/if}

	<Alert.Description>
		{#if children}
			{@render children()}
		{:else if message}
			<p>{message}</p>
		{/if}
	</Alert.Description>
</Alert.Root>
