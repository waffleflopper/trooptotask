<script lang="ts">
	import type { ComponentProps } from 'svelte';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import EvalTrackerView from './EvalTrackerView.svelte';

	let props: ComponentProps<typeof EvalTrackerView> = $props();
</script>

<Tooltip.Provider>
	<EvalTrackerView {...props} />
</Tooltip.Provider>
