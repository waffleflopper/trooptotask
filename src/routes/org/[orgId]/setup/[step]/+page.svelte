<script lang="ts">
	import { getAppShellContext } from '$features/app-shell';
	import { SetupStepPage, setSetupStepSupport, setupTrainingTypeEditor } from '$features/organization';
	import { loadTrainingTypeEditor } from '$features/training';
	import { getTrainingSuggestions } from '$features/training/contracts';
	import TrainingTypeEditor from '$features/training/components/TrainingTypeEditor.svelte';
	import SetupCalendarStep from './SetupCalendarStep.svelte';
	import SetupGroupsStep from './SetupGroupsStep.svelte';
	import SetupPersonnelStep from './SetupPersonnelStep.svelte';
	import SetupRanksStep from './SetupRanksStep.svelte';

	let { data } = $props();
	const org = getAppShellContext();
	setSetupStepSupport({
		access: org,
		trainingSuggestions: getTrainingSuggestions,
		trainingTypes: setupTrainingTypeEditor({ load: () => loadTrainingTypeEditor(org), Editor: TrainingTypeEditor })
	});
</script>

<SetupStepPage
	orgName={data.orgName}
	delivered={{
		groups: SetupGroupsStep,
		ranks: SetupRanksStep,
		personnel: SetupPersonnelStep,
		calendar: SetupCalendarStep
	}}
/>
