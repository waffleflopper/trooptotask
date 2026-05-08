<script lang="ts">
	import DownloadIcon from '@lucide/svelte/icons/download';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Spinner } from '$lib/components/ui/spinner/index.js';
	import type { ComponentProps } from 'svelte';

	type Props = ComponentProps<typeof Button> & {
		label: string;
		disabledReason?: string;
		loading?: boolean;
	};

	let { label, disabledReason, loading = false, disabled, href, ...restProps }: Props = $props();
	const isDisabled = $derived(disabled || !!disabledReason || loading);
	const title = $derived(disabledReason || undefined);
</script>

<Button
	{href}
	disabled={isDisabled}
	{title}
	aria-label={disabledReason ? `${label}: ${disabledReason}` : label}
	{...restProps}
>
	{#if loading}
		<Spinner aria-label={`${label} loading`} />
	{:else}
		<DownloadIcon />
	{/if}
	<span>{loading ? 'Exporting' : label}</span>
</Button>
