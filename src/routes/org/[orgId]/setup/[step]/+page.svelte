<script lang="ts">
	import { SetupStepPage } from '$features/organization';
	import SetupCalendarStep from './SetupCalendarStep.svelte';
	import SetupGroupsStep from './SetupGroupsStep.svelte';
	import SetupPersonnelStep from './SetupPersonnelStep.svelte';
	import SetupRanksStep from './SetupRanksStep.svelte';
</script>

<SetupStepPage
	delivered={{
		groups: SetupGroupsStep,
		ranks: SetupRanksStep,
		personnel: SetupPersonnelStep,
		calendar: SetupCalendarStep
	}}
/>
