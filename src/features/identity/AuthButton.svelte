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
		/** Keeps focus on the pressed button while loading: it reads as disabled, and the form ignores a second press. */
		holdFocus?: boolean;
		ref?: HTMLElement | null;
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
		holdFocus = false,
		ref = $bindable(null),
		onclick,
		children,
		'data-testid': dataTestId
	}: Props = $props();
</script>

<Button
	bind:ref
	{id}
	{href}
	type={href ? undefined : type}
	disabled={disabled || (loading && !holdFocus)}
	aria-disabled={loading && holdFocus ? 'true' : undefined}
	aria-busy={loading || undefined}
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
	<ArrowRightIcon class="size-[18px] text-chrome-accent dark:text-current" strokeWidth={2} aria-hidden="true" />
</Button>
