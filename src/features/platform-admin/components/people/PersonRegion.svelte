<script lang="ts" generics="T">
	import type { Snippet } from 'svelte';
	import type { PersonRegion } from '../../peopleTypes';
	import * as Alert from '$lib/components/ui/alert';
	import { Button } from '$lib/components/ui/button';

	interface Props {
		region: Promise<PersonRegion<T>>;
		/** Names the region in its error and its loading status. */
		label: string;
		skeleton: Snippet;
		children: Snippet<[T]>;
		onRetry: () => void;
	}

	let { region, label, skeleton, children, onRetry }: Props = $props();
</script>

{#snippet failed(message: string)}
	<Alert.Root variant="destructive">
		<Alert.Description>{message}</Alert.Description>
		<Button class="mt-1 w-fit" variant="outline" onclick={onRetry}>Retry {label.toLowerCase()}</Button>
	</Alert.Root>
{/snippet}

{#await region}
	<div role="status" aria-label={`Loading ${label.toLowerCase()}`}>{@render skeleton()}</div>
{:then loaded}
	{#if loaded.status === 'ok'}
		{@render children(loaded.data)}
	{:else}
		{@render failed(loaded.message)}
	{/if}
{:catch}
	{@render failed(`${label} could not be loaded.`)}
{/await}
