<script lang="ts">
	import SmartToolbar from './SmartToolbar.svelte';
	import type { SmartToolbarItem } from './SmartToolbar.types';

	interface Props {
		items: SmartToolbarItem[];
		narrow?: boolean;
		title?: string;
		helpTopic?: string;
		childContent?: string;
	}

	let { items, narrow, title, helpTopic, childContent }: Props = $props();
</script>

<SmartToolbar {items} {narrow} {title} {helpTopic}>
	{#if childContent}
		<span>{childContent}</span>
	{/if}
</SmartToolbar>
