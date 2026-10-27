<script lang="ts">
	import { getAppShellContext } from '$features/app-shell';
	import { SetupStepPage, setSetupStepSupport } from '$features/organization';
	import { getTrainingSuggestions } from '$features/training/contracts';

	setSetupStepSupport({ access: getAppShellContext(), trainingSuggestions: getTrainingSuggestions });
</script>

<SetupStepPage />
