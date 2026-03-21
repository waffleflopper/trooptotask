<script lang="ts">
	import { onboardingTemplateStore } from '$features/onboarding/stores/onboardingTemplate.svelte';
	import { onboardingStore } from '$features/onboarding/stores/onboarding.svelte';
	import { personnelTrainingsStore } from '$features/training/stores/personnelTrainings.svelte';

	let { children, data } = $props();

	// Guard against parent-only invalidation clobbering optimistic store mutations.
	// See calendar/+layout.svelte for full explanation.
	let lastRefs: unknown[] = [];

	$effect(() => {
		const refs = [
			data.onboardingTemplates,
			data.onboardingTemplateSteps,
			data.onboardings,
			data.personnelTrainings,
			data.orgId
		];

		const unchanged = refs.length === lastRefs.length && refs.every((r, i) => r === lastRefs[i]);
		if (unchanged) return;
		lastRefs = refs;

		onboardingTemplateStore.load(data.onboardingTemplates, data.onboardingTemplateSteps, data.orgId);
		onboardingStore.load(data.onboardings, data.orgId);
		personnelTrainingsStore.load(data.personnelTrainings ?? [], data.orgId);
	});
</script>

{@render children()}
