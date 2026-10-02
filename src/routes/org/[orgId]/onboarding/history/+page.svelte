<script lang="ts">
	import { OnboardingHistoryPage } from '$features/onboarding';
	import { getOrgContext } from '$lib/stores/orgContext.svelte';

	let { data } = $props();
	const org = getOrgContext();
</script>

<OnboardingHistoryPage orgUrlSegment={data.shell.org.urlSegment} orgId={org.orgId} scopeSet={org.scopeSet} />
