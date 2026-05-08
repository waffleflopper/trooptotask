<script lang="ts">
	import DownloadIcon from '@lucide/svelte/icons/download';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Spinner } from '$lib/components/ui/spinner/index.js';
	import type { ComponentProps } from 'svelte';

	type Props = ComponentProps<typeof Button> & {
		label: string;
		state?: 'ready' | 'loading' | 'disabled' | 'error';
		disabledReason?: string;
		errorReason?: string;
		loading?: boolean;
		loadingLabel?: string;
	};

	let {
		label,
		state = 'ready',
		disabledReason,
		errorReason,
		loading = false,
		loadingLabel = 'Exporting',
		disabled,
		href,
		variant,
		...restProps
	}: Props = $props();
	const isLoading = $derived(loading || state === 'loading');
	const reason = $derived(state === 'error' ? errorReason : disabledReason);
	const isDisabled = $derived(disabled || state === 'disabled' || state === 'error' || !!disabledReason || isLoading);
	const title = $derived(reason || undefined);
	const ariaLabel = $derived(reason ? `${label}: ${reason}` : label);
	const buttonVariant = $derived(variant ?? (state === 'error' ? 'outline' : undefined));
</script>

<Button {href} disabled={isDisabled} {title} aria-label={ariaLabel} variant={buttonVariant} {...restProps}>
	{#if isLoading}
		<Spinner aria-label={`${label} loading`} />
	{:else}
		<DownloadIcon />
	{/if}
	<span>{isLoading ? loadingLabel : label}</span>
</Button>
