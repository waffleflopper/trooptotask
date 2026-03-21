<script lang="ts">
	import { onboardingTemplateStore } from '$features/onboarding/stores/onboardingTemplate.svelte';
	import { onboardingStore } from '$features/onboarding/stores/onboarding.svelte';
	import { personnelTrainingsStore } from '$features/training/stores/personnelTrainings.svelte';

	let { children, data } = $props();

	// Hydrate onboarding-specific stores
	$effect(() => {
		onboardingTemplateStore.load(data.onboardingTemplates, data.onboardingTemplateSteps, data.orgId);
		onboardingStore.load(data.onboardings, data.orgId);
		personnelTrainingsStore.load(data.personnelTrainings ?? [], data.orgId);
	});
</script>

{@render children()}
