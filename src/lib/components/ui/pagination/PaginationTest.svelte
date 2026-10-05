<script lang="ts">
	import { untrack } from 'svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Pagination from './index.js';

	let {
		initialPage = 1,
		usePageWrappers = false,
		customDestination = false,
		disableWrapperDestinations = false
	}: {
		initialPage?: number;
		usePageWrappers?: boolean;
		customDestination?: boolean;
		disableWrapperDestinations?: boolean;
	} = $props();
	let page = $state(untrack(() => initialPage));
	let callerInteraction = $state('');
</script>

<Pagination.Root count={25} perPage={10} bind:page>
	{#snippet children({ pages, range })}
		<Pagination.Content>
			<Pagination.Item>
				{#if customDestination}
					<Pagination.Link
						page={{ type: 'page', value: 1 }}
						isActive={page === 1}
						disabled={disableWrapperDestinations}
						onclick={() => (callerInteraction = 'click')}
						onkeydown={(event) => (callerInteraction = event.key)}
					>
						{#snippet child({ props })}
							<Button {...props} href="#first-page" role="button">First page</Button>
						{/snippet}
					</Pagination.Link>
				{:else if usePageWrappers}
					<Pagination.Previous
						page={{ type: 'page', value: 1 }}
						isActive={page === 1}
						disabled={disableWrapperDestinations || page === 1}
					/>
				{:else}
					<Pagination.PrevButton />
				{/if}
			</Pagination.Item>
			{#if !usePageWrappers}
				{#each pages as item (item.key)}
					<Pagination.Item>
						{#if item.type === 'page'}
							<Pagination.Link page={item} isActive={page === item.value} />
						{:else}
							<Pagination.Ellipsis />
						{/if}
					</Pagination.Item>
				{/each}
			{/if}
			<Pagination.Item>
				{#if usePageWrappers}
					<Pagination.Next
						page={{ type: 'page', value: 3 }}
						isActive={page === 3}
						disabled={disableWrapperDestinations || page === 3}
					/>
				{:else}
					<Pagination.NextButton />
				{/if}
			</Pagination.Item>
		</Pagination.Content>
		<output aria-label="Visible records">{range.start}-{range.end}</output>
	{/snippet}
</Pagination.Root>

<output aria-label="Current page">{page}</output>
<output aria-label="Caller interaction">{callerInteraction}</output>
