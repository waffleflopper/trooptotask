<script lang="ts">
	import SmartToolbar, { type SmartToolbarItem } from './SmartToolbar.svelte';

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
