<script lang="ts">
	import { createClientAccess } from '$lib/access/clientAccess';
	import { setSetupStepSupport, type SetupStepSupport } from '../featureStepSupport';
	import SetupRail from '../SetupRail.svelte';
	import SetupStepPage from '../SetupStepPage.svelte';
	import { SetupFlow, setSetupFlow, type SetupFlowSource } from '../setupFlow.svelte';
	import TrainingTypeEditorStub from './TrainingTypeEditorStub.svelte';

	let {
		source,
		support = {
			access: createClientAccess({ membershipRole: 'owner' }),
			trainingSuggestions: () => [],
			trainingTypes: { load: () => Promise.resolve({ trainingTypes: [] }), Editor: TrainingTypeEditorStub }
		},
		navigate = async () => {}
	}: { source: SetupFlowSource; support?: SetupStepSupport; navigate?: (href: string) => Promise<void> } = $props();

	// svelte-ignore state_referenced_locally
	setSetupFlow(new SetupFlow(() => source, navigate));

	// Read through the props, so a rerender with new access reaches the step, as the app shell's access does.
	setSetupStepSupport({
		get access() {
			return support.access;
		},
		trainingSuggestions: (branch) => support.trainingSuggestions(branch),
		get trainingTypes() {
			return support.trainingTypes;
		}
	});
</script>

<SetupRail />
<SetupStepPage />
