<script lang="ts">
	import type { ComponentProps } from 'svelte';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import RatingSchemeLinesView from './RatingSchemeLinesView.svelte';

	let props: ComponentProps<typeof RatingSchemeLinesView> = $props();
</script>

<Tooltip.Provider>
	<RatingSchemeLinesView {...props} />
</Tooltip.Provider>
