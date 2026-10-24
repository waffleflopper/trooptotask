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
		ref?: HTMLElement | null;
		children?: Snippet;
	}

	let { tone = 'info', title, message, centered = false, ref = $bindable(null), children }: Props = $props();

	const variant = $derived(tone === 'error' ? 'destructive' : tone);
	const role = $derived(tone === 'error' ? 'alert' : 'status');
	const Icon = $derived(
		{ error: AlertCircleIcon, success: CheckCircleIcon, warning: TriangleAlertIcon, info: InfoIcon }[tone]
	);
</script>

<Alert.Root
	bind:ref
	{variant}
	{role}
	tabindex={-1}
	class={centered ? 'justify-items-center text-center outline-none' : 'outline-none'}
>
	<!-- Alert sets the icon beside the text only when the svg is its direct child; a centered notice stacks it. -->
	{#if centered}
		<span class="mt-0.5 inline-flex size-4 items-center justify-center"><Icon aria-hidden="true" /></span>
	{:else}
		<Icon aria-hidden="true" />
	{/if}

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
