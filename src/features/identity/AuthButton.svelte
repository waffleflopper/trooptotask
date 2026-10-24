<script lang="ts">
	import type { Snippet } from 'svelte';
	import ArrowRightIcon from '@lucide/svelte/icons/arrow-right';
	import { Button } from '$lib/components/ui/button';
	import { Spinner } from '$lib/components/ui/spinner';

	interface Props {
		id?: string;
		href?: string;
		type?: 'submit' | 'button';
		disabled?: boolean;
		loading?: boolean;
		loadingLabel?: string;
		onclick?: () => void;
		children: Snippet;
		'data-testid'?: string;
	}

	let {
		id,
		href,
		type = 'submit',
		disabled = false,
		loading = false,
		loadingLabel,
		onclick,
		children,
		'data-testid': dataTestId
	}: Props = $props();
</script>

<Button
	{id}
	{href}
	type={href ? undefined : type}
	disabled={disabled || loading}
	{onclick}
	data-testid={dataTestId}
	class="h-12 w-full justify-between px-5 font-mono text-[13px] tracking-[0.12em] uppercase"
>
	<span class="inline-flex items-center gap-2">
		{#if loading}
			<Spinner />
			{loadingLabel}
		{:else}
			{@render children()}
		{/if}
	</span>
	<ArrowRightIcon class="size-[18px] text-accent dark:text-current" strokeWidth={2} aria-hidden="true" />
</Button>
