<script lang="ts" module>
	/** Caches a dynamic import once it succeeds, so a failed chunk download can be retried. */
	export function lazyModule<M>(importer: () => Promise<M>): () => Promise<M> {
		let pending: Promise<M> | undefined;
		return () =>
			(pending ??= importer().catch((error: unknown) => {
				pending = undefined;
				throw error;
			}));
	}
</script>

<script lang="ts" generics="M">
	import type { Snippet } from 'svelte';
	import * as Alert from '$lib/components/ui/alert';
	import * as AppDialog from '$lib/components/ui/app-dialog';
	import { Button } from '$lib/components/ui/button';
	import { Skeleton } from '$lib/components/ui/skeleton';

	let {
		load,
		title,
		size = 'default',
		onClose,
		children
	}: {
		load: () => Promise<M>;
		title: string;
		size?: 'default' | 'wide';
		onClose: () => void;
		children: Snippet<[M]>;
	} = $props();

	let attempt = $state(0);
	const loading = $derived.by(() => {
		void attempt;
		return load();
	});
</script>

{#snippet frame(body: Snippet)}
	<AppDialog.Root open {onClose}>
		<AppDialog.Content presentation="sheet" {size}>
			<AppDialog.Header class="border-b px-5 pt-5 pb-4 sm:px-7">
				<AppDialog.Title>{title}</AppDialog.Title>
			</AppDialog.Header>
			<AppDialog.Body class="flex flex-col gap-3 px-5 py-6 sm:px-7">
				{@render body()}
			</AppDialog.Body>
		</AppDialog.Content>
	</AppDialog.Root>
{/snippet}

{#snippet pendingBody()}
	<div role="status" aria-label="Loading {title}" class="flex flex-col gap-3">
		{#each Array.from({ length: 4 }) as _, index (index)}
			<Skeleton class="h-12 w-full" />
		{/each}
	</div>
{/snippet}

{#snippet failedBody()}
	<Alert.Root variant="destructive">
		<Alert.Title>Unable to open {title}</Alert.Title>
		<Alert.Description>
			Check your connection and try again.
			<Button type="button" variant="destructive" size="xs" onclick={() => (attempt += 1)}>Retry</Button>
		</Alert.Description>
	</Alert.Root>
{/snippet}

{#await loading}
	{@render frame(pendingBody)}
{:then module}
	{@render children(module)}
{:catch}
	{@render frame(failedBody)}
{/await}
