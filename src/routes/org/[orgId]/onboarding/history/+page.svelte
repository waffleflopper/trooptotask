<script lang="ts">
	import { noteAuthorLookup, OnboardingHistoryPage } from '$features/onboarding';
	import { getAppShellContext } from '$features/app-shell';
	import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';

	let { data } = $props();
	const org = getAppShellContext();

	const noteAuthorName = $derived(noteAuthorLookup(data.history.noteAuthors, org.userId));
	const canOpenOrganizationSettings = $derived(
		org.affordanceForGovernanceAction(POLICY_ACTION_CATALOG.organization.accessGovernance).visible
	);
</script>

<OnboardingHistoryPage
	orgUrlSegment={data.shell.org.urlSegment}
	scopeSet={org.scopeSet}
	onboardings={data.history.onboardings}
	personnel={data.history.personnel}
	templates={data.history.templates}
	groups={data.history.groups}
	{noteAuthorName}
	archiveRetentionMonths={data.history.archiveRetentionMonths}
	{canOpenOrganizationSettings}
/>
