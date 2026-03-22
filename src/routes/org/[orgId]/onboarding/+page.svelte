<script lang="ts">
	import { OnboardingPageContext } from '$features/onboarding/contexts/OnboardingPageContext.svelte';
	import { ModalRegistry } from '$lib/utils/modalRegistry.svelte';
	import { getOrgContext } from '$lib/stores/orgContext.svelte';
	import OnboardingPageView from '$features/onboarding/components/OnboardingPageView.svelte';
	import OnboardingModals from '$features/onboarding/components/OnboardingModals.svelte';

	let { data } = $props();

	const org = getOrgContext();
	const modals = new ModalRegistry();
	const ctx = new OnboardingPageContext(modals, org);
</script>

<OnboardingPageView {ctx} />
<OnboardingModals {ctx} />
