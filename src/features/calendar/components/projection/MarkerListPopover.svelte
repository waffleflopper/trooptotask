<script lang="ts" module>
	export interface MarkerListItem {
		readonly key: string;
		readonly title: string;
		readonly detail: string;
		readonly href: string;
	}
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import * as Popover from '$lib/components/ui/popover';

	interface Props {
		/** Names the trigger, including how many it opens. */
		label: string;
		heading: string;
		items: readonly MarkerListItem[];
		class?: string;
		children: Snippet;
	}

	let { label, heading, items, class: className, children }: Props = $props();
</script>

<Popover.Root>
	<Popover.Trigger class={className} aria-label={label}>{@render children()}</Popover.Trigger>
	<Popover.Content class="w-72 gap-1.5 p-2" align="start">
		<Popover.Header>
			<Popover.Title class="text-xs">{heading}</Popover.Title>
		</Popover.Header>
		<ul class="m-0 flex list-none flex-col gap-0.5 p-0">
			{#each items as item (item.key)}
				<li>
					<a
						href={item.href}
						class="flex flex-col rounded-md px-2 py-1.5 text-sm text-foreground no-underline hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
					>
						<span class="font-medium">{item.title}</span>
						<span class="text-xs text-muted-foreground">{item.detail}</span>
					</a>
				</li>
			{/each}
		</ul>
	</Popover.Content>
</Popover.Root>
