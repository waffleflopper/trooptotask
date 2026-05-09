<script lang="ts">
	import CircleHelpIcon from '@lucide/svelte/icons/circle-help';
	import { helpContent } from '$lib/help-content';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Popover from '$lib/components/ui/popover/index.js';

	let { topic }: { topic: string } = $props();

	const content = $derived(helpContent[topic]);
</script>

{#if content}
	<Popover.Root>
		<Popover.Trigger>
			{#snippet child({ props })}
				<Button
					variant="outline"
					size="sm"
					class="ml-2 font-mono text-xs font-semibold tracking-wide uppercase"
					title="Open help for this page"
					{...props}
				>
					<CircleHelpIcon />
					<span>Help</span>
				</Button>
			{/snippet}
		</Popover.Trigger>
		<Popover.Content side="bottom" align="end" class="w-[min(24rem,calc(100vw-2rem))] p-0">
			<Popover.Header>
				<Popover.Title>{content.title}</Popover.Title>
			</Popover.Header>
			<div class="text-muted-foreground max-h-[min(28rem,70vh)] overflow-y-auto px-3 pb-3 text-sm leading-6">
				<!-- eslint-disable-next-line svelte/no-at-html-tags -- developer-controlled static help content, not user input -->
				{@html content.content}
			</div>
		</Popover.Content>
	</Popover.Root>
{/if}
