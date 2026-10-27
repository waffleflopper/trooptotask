<script lang="ts">
	import SetupStepPage from '../SetupStepPage.svelte';
	import { SetupFlow, setSetupFlow, type SetupFlowSource } from '../setupFlow.svelte';

	let { source, onflow }: { source: SetupFlowSource; onflow: (flow: SetupFlow) => void } = $props();

	const flow = new SetupFlow(
		() => source,
		async () => {}
	);
	setSetupFlow(flow);
	// svelte-ignore state_referenced_locally
	onflow(flow);
</script>

<SetupStepPage />
