<script lang="ts">
	import { noteAuthorLookup, OnboardingHistoryPage } from '$features/onboarding';
	import { getAppShellContext } from '$features/app-shell';
	import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import WorkspaceLoadError from '../../WorkspaceLoadError.svelte';

	let { data } = $props();
	const org = getAppShellContext();

	const canOpenOrganizationSettings = $derived(
		org.affordanceForGovernanceAction(POLICY_ACTION_CATALOG.organization.accessGovernance).visible
	);
	const skeletonRows = [0, 1, 2, 3, 4, 5];
</script>

<svelte:head>
	<title>Onboarding History - Troop to Task</title>
</svelte:head>

{#await data.history.data}
	<section class="grid gap-4 p-3 md:p-6" aria-live="polite" role="status" aria-label="Loading history">
		<div class="grid gap-2">
			<Skeleton class="h-8 w-32" />
			<Skeleton class="h-4 w-80 max-w-full" />
		</div>
		<Skeleton class="h-9 w-full" />
		<div class="overflow-hidden rounded-lg border border-border bg-card">
			<div class="border-b border-border px-3.5 py-2.5">
				<Skeleton class="h-3 w-full" />
			</div>
			{#each skeletonRows as row (row)}
				<div class="flex items-center gap-4 border-b border-border px-3.5 py-3.5 last:border-b-0">
					<Skeleton class="h-4 w-40 max-w-full flex-1" />
					<Skeleton class="hidden h-4 w-32 md:block" />
					<Skeleton class="hidden h-4 w-24 md:block" />
					<Skeleton class="h-4 w-16" />
				</div>
			{/each}
		</div>
	</section>
{:then history}
	<OnboardingHistoryPage
		orgUrlSegment={data.shell.org.urlSegment}
		scopeSet={org.scopeSet}
		onboardings={history.onboardings}
		personnel={history.personnel}
		templates={history.templates}
		groups={history.groups}
		noteAuthorName={noteAuthorLookup(history.noteAuthors, org.userId)}
		archiveRetentionMonths={history.archiveRetentionMonths}
		{canOpenOrganizationSettings}
	/>
{:catch}
	<WorkspaceLoadError subject="History" />
{/await}
