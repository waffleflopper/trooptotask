<script lang="ts">
	import SetupRail from '../SetupRail.svelte';
	import SetupStepPage from '../SetupStepPage.svelte';
	import { SetupFlow, setSetupFlow, type SetupFlowSource } from '../setupFlow.svelte';

	let { source }: { source: SetupFlowSource } = $props();

	setSetupFlow(
		new SetupFlow(
			() => source,
			async () => {}
		)
	);
</script>

<SetupRail />
<SetupStepPage />
