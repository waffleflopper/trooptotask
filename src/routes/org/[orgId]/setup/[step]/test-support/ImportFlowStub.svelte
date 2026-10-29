<script lang="ts">
	import { personnelStubs } from './personnelStubs';

	let { lane }: { lane: unknown } = $props();

	// Each mounted flow owns its session, so a new identity means the receipt was lost.
	const flow = {};
	personnelStubs.flow = flow;
	$effect(() => () => {
		if (personnelStubs.flow === flow) personnelStubs.flow = null;
	});

	$effect.pre(() => {
		personnelStubs.lane = lane;
	});
</script>
