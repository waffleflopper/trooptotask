<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Empty from '$lib/components/ui/empty/index.js';
	import { Spinner } from '$lib/components/ui/spinner/index.js';
	import { cn } from '$lib/utils.js';

	type Props = HTMLAttributes<HTMLDivElement> & {
		state: 'loading' | 'no-data' | 'error';
		title: string;
		description?: string;
		onRetry?: () => void | Promise<void>;
		retryLabel?: string;
		children?: Snippet;
	};

	let {
		state,
		title,
		description,
		onRetry,
		retryLabel = 'Retry',
		children,
		class: className,
		...restProps
	}: Props = $props();
</script>

{#if state === 'error'}
	<Alert.Root variant="destructive" class={cn(className)} {...restProps}>
		<Alert.Title>{title}</Alert.Title>
		{#if description}
			<Alert.Description>{description}</Alert.Description>
		{/if}
		{#if onRetry}
			<Alert.Action>
				<Button type="button" variant="destructive" size="xs" onclick={onRetry}>{retryLabel}</Button>
			</Alert.Action>
		{/if}
		{@render children?.()}
	</Alert.Root>
{:else if state === 'loading'}
	<div
		role="status"
		aria-live="polite"
		aria-busy="true"
		data-slot="report-workspace-state"
		class={cn(
			'flex min-h-32 items-center justify-center gap-2 rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground',
			className
		)}
		{...restProps}
	>
		<Spinner />
		<span>{title}</span>
		{@render children?.()}
	</div>
{:else}
	<Empty.Root class={cn('border border-dashed border-border bg-card', className)} {...restProps}>
		<Empty.Header>
			<Empty.Title>{title}</Empty.Title>
			{#if description}
				<Empty.Description>{description}</Empty.Description>
			{/if}
		</Empty.Header>
		{@render children?.()}
	</Empty.Root>
{/if}
