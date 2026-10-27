<script lang="ts">
	import { personnelStubs } from './personnelStubs';

	let { lane }: { lane: unknown } = $props();

	$effect.pre(() => {
		personnelStubs.lane = lane;
	});
</script>
