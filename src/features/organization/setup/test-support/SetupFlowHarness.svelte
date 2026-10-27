<script lang="ts">
	import { createClientAccess } from '$lib/access/clientAccess';
	import { setSetupStepSupport, type SetupStepSupport } from '../featureStepSupport';
	import SetupRail from '../SetupRail.svelte';
	import SetupStepPage from '../SetupStepPage.svelte';
	import { SetupFlow, setSetupFlow, type SetupFlowSource } from '../setupFlow.svelte';

	let {
		source,
		support,
		navigate = async () => {}
	}: { source: SetupFlowSource; support?: SetupStepSupport; navigate?: (href: string) => Promise<void> } = $props();

	// svelte-ignore state_referenced_locally
	setSetupFlow(new SetupFlow(() => source, navigate));

	// svelte-ignore state_referenced_locally
	setSetupStepSupport(
		support ?? { access: createClientAccess({ membershipRole: 'owner' }), trainingSuggestions: () => [] }
	);
</script>

<SetupRail />
<SetupStepPage />
