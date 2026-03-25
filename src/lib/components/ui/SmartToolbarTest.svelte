<script lang="ts">
	import SmartToolbar, { type SmartToolbarItem } from './SmartToolbar.svelte';

	interface Props {
		items: SmartToolbarItem[];
		narrow?: boolean;
	}

	let { items, narrow }: Props = $props();
</script>

<SmartToolbar {items} {narrow} />
