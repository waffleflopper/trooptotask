<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import * as Empty from '$lib/components/ui/empty';
	import type { RosterEmpty } from '$features/calendar/contexts/CalendarPageContext.svelte';

	interface Props {
		reason: RosterEmpty;
		class?: string;
		personnelHref?: string;
		onClearFilters: () => void;
	}

	let { reason, class: className, personnelHref, onClearFilters }: Props = $props();

	const CONTENT: Record<RosterEmpty, { title: string; description: string }> = {
		'no-personnel': {
			title: 'No personnel added yet',
			description: 'Go to Personnel to add people to your roster.'
		},
		'no-matches': {
			title: 'No one matches',
			description: 'Clear the search or choose another Group.'
		}
	};

	const content = $derived(CONTENT[reason]);
</script>

<Empty.Root class={className}>
	<Empty.Header>
		<Empty.Title level={3}>{content.title}</Empty.Title>
		<Empty.Description>{content.description}</Empty.Description>
	</Empty.Header>
	{#if reason === 'no-matches'}
		<Empty.Content>
			<Button type="button" variant="outline" size="sm" onclick={onClearFilters}>Clear filters</Button>
		</Empty.Content>
	{:else if personnelHref}
		<Empty.Content>
			<Button href={personnelHref} size="sm">Go to Personnel</Button>
		</Empty.Content>
	{/if}
</Empty.Root>
