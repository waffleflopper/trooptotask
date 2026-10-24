<script lang="ts">
	import { afterNavigate, invalidate, replaceState } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { getAppShellContext } from '$features/app-shell';
	import type { PersonnelCriticalTaskReadiness } from '$features/critical-tasks/contracts';
	import { PersonnelCriticalTaskDrawer, PersonnelCriticalTaskReadinessTable } from '$features/critical-tasks';
	import type { PersonnelOnboardingSummary } from '$features/onboarding/contracts';
	import { PersonnelOnboardingLine } from '$features/onboarding';
	import type { Personnel, PersonnelLossReadiness } from '$features/personnel/contracts';
	import PersonnelLossBlock from '$features/personnel/components/PersonnelLossBlock.svelte';
	import { readinessDrawerFromSearch, type ReadinessDrawerTarget } from '$features/personnel';
	import type { PersonnelActiveEvaluation } from '$features/rating-scheme/contracts';
	import { PersonnelEvaluationCard } from '$features/rating-scheme';
	import type { PersonnelTrainingReadiness } from '$features/training/contracts';
	import PersonnelTrainingReadinessTable from '$features/training/components/PersonnelTrainingReadinessTable.svelte';
	import PersonnelTrainingDrawer from '$features/training/components/PersonnelTrainingDrawer.svelte';
	import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
	import { ReadinessItemTableSkeleton } from '$lib/components/patterns/readiness-items';
	import { Skeleton } from '$lib/components/ui/skeleton/index.js';
	import { StreamedValue } from '$lib/utils/streamedValue.svelte';

	let {
		orgId,
		person,
		readiness,
		asOf
	}: {
		orgId: string;
		person: Pick<Personnel, 'id' | 'rank' | 'lastName' | 'groupId'>;
		readiness: {
			training: Promise<PersonnelTrainingReadiness> | null;
			criticalTasks: Promise<PersonnelCriticalTaskReadiness> | null;
			evaluation: Promise<PersonnelActiveEvaluation | null> | null;
			loss: Promise<PersonnelLossReadiness>;
			onboarding: Promise<PersonnelOnboardingSummary> | null;
		};
		asOf: string;
	} = $props();

	const shell = getAppShellContext();
	const training = new StreamedValue(() => readiness.training);
	const criticalTasks = new StreamedValue(() => readiness.criticalTasks);
	const evaluation = new StreamedValue(() => readiness.evaluation);
	const loss = new StreamedValue(() => readiness.loss);
	const onboarding = new StreamedValue(() => readiness.onboarding);

	const personName = $derived(`${person.rank} ${person.lastName}`.trim());
	const personResource = $derived(
		person.groupId ? { kind: 'group' as const, groupId: person.groupId } : { kind: 'organization' as const }
	);
	const canRecordTraining = $derived(
		shell.affordanceForFeatureAction(POLICY_ACTION_CATALOG.training.recordCompletions, personResource).allowed
	);
	const canExemptTraining = $derived(
		shell.affordanceForFeatureAction(POLICY_ACTION_CATALOG.training.configureRequirements).allowed
	);
	const canRecordCriticalTasks = $derived(
		shell.affordanceForFeatureAction(POLICY_ACTION_CATALOG.criticalTasks.recordCompletion, personResource).allowed
	);

	/** `fromUrl` marks a drawer the address names, so Back closes it with the intent. */
	let drawer = $state<(ReadinessDrawerTarget & { fromUrl: boolean }) | null>(null);
	/** A link to an item that no longer applies opens the picker instead of an empty drawer. */
	const drawerItemId = $derived.by(() => {
		if (!drawer?.id) return null;
		const id = drawer.id;
		if (drawer.kind === 'training') {
			return training.current.state === 'ready' && training.current.value.items.some((item) => item.typeId === id)
				? id
				: null;
		}
		return criticalTasks.current.state === 'ready' &&
			criticalTasks.current.value.items.some((item) => item.taskId === id)
			? id
			: null;
	});

	afterNavigate(({ to }) => {
		if (!to) return;
		const target = readinessDrawerFromSearch(to.url.searchParams);
		if (target) drawer = { ...target, fromUrl: true };
		else if (drawer?.fromUrl) drawer = null;
	});

	function open(target: ReadinessDrawerTarget) {
		drawer = { ...target, fromUrl: false };
	}

	function close() {
		drawer = null;
		const params = [...new URLSearchParams(window.location.search)];
		const kept = params.filter(([key]) => key !== 'item' && key !== 'add');
		if (kept.length === params.length) return;
		const path = resolve('/org/[orgId]/personnel/[personnelSlug]/readiness', {
			orgId: page.params.orgId ?? orgId,
			personnelSlug: page.params.personnelSlug ?? person.id
		});
		const query = new URLSearchParams(kept).toString();
		replaceState(query ? `${path}?${query}` : path, page.state);
	}

	async function refresh() {
		await Promise.all([invalidate('app:personnel-detail-readiness'), invalidate('app:personnel-detail-counts')]);
	}
</script>

{#snippet unavailable(label: string, source: string)}
	<section class="flex flex-col gap-2" aria-label={label}>
		<h2 class="font-mono text-[0.6875rem] leading-[14px] font-medium tracking-[0.08em] text-muted-foreground uppercase">
			{label}
		</h2>
		<p class="rounded-md border border-dashed px-4 py-3 text-sm text-muted-foreground">
			Couldn't check {source}. Reload the page to try again.
		</p>
	</section>
{/snippet}

<!-- Shaped like each block with the least it shows: the Evaluation card's empty state, both Loss dates, one Onboarding line. -->
{#snippet railSkeleton(label: string, lines: number)}
	<div class="flex flex-col gap-2 px-1" aria-busy="true" aria-label={label}>
		<Skeleton class="h-3.5 w-20" />
		{#each { length: lines }, index (index)}
			<Skeleton class="h-5 w-48 last:w-36" />
		{/each}
	</div>
{/snippet}

<div class="grid gap-12 lg:grid-cols-[minmax(0,1fr)_320px]">
	<div class="flex min-w-0 flex-col gap-12">
		{#if training.current.state === 'ready'}
			<PersonnelTrainingReadinessTable
				readiness={training.current.value}
				onOpen={(id) => open({ kind: 'training', id })}
				onLog={canRecordTraining ? () => open({ kind: 'training', id: null }) : undefined}
			/>
		{:else if training.current.state === 'failed'}
			{@render unavailable('Training', 'training')}
		{:else if training.current.state === 'pending'}
			<ReadinessItemTableSkeleton label="Training" />
		{/if}

		{#if criticalTasks.current.state === 'ready'}
			<PersonnelCriticalTaskReadinessTable
				readiness={criticalTasks.current.value}
				{orgId}
				onOpen={(id) => open({ kind: 'critical-task', id })}
				onRecord={canRecordCriticalTasks ? () => open({ kind: 'critical-task', id: null }) : undefined}
			/>
		{:else if criticalTasks.current.state === 'failed'}
			{@render unavailable('Critical tasks', 'critical tasks')}
		{:else if criticalTasks.current.state === 'pending'}
			<ReadinessItemTableSkeleton label="Critical tasks" />
		{/if}
	</div>

	<aside class="flex flex-col gap-8" aria-label="Evaluation, loss and onboarding">
		{#if evaluation.current.state === 'ready'}
			<PersonnelEvaluationCard evaluation={evaluation.current.value} />
		{:else if evaluation.current.state === 'failed'}
			{@render unavailable('Evaluation', 'the evaluation')}
		{:else if evaluation.current.state === 'pending'}
			<div class="flex flex-col gap-3.5 rounded-md border bg-muted p-5" aria-busy="true" aria-label="Evaluation">
				<Skeleton class="h-3.5 w-20" />
				<Skeleton class="h-5 w-44" />
			</div>
		{/if}

		{#if loss.current.state === 'ready'}
			<PersonnelLossBlock loss={loss.current.value} />
		{:else if loss.current.state === 'failed'}
			{@render unavailable('Loss', 'loss dates')}
		{:else}
			{@render railSkeleton('Loss', 2)}
		{/if}

		{#if onboarding.current.state === 'ready'}
			<PersonnelOnboardingLine summary={onboarding.current.value} />
		{:else if onboarding.current.state === 'failed'}
			{@render unavailable('Onboarding', 'onboarding')}
		{:else if onboarding.current.state === 'pending'}
			{@render railSkeleton('Onboarding', 1)}
		{/if}
	</aside>
</div>

{#if drawer?.kind === 'training' && training.current.state === 'ready'}
	{#key drawerItemId}
		<PersonnelTrainingDrawer
			{orgId}
			personnelId={person.id}
			{personName}
			items={training.current.value.items}
			typeId={drawerItemId}
			{asOf}
			canRecord={canRecordTraining}
			canExempt={canExemptTraining}
			onSaved={refresh}
			onClose={close}
		/>
	{/key}
{:else if drawer?.kind === 'critical-task' && criticalTasks.current.state === 'ready'}
	{#key drawerItemId}
		<PersonnelCriticalTaskDrawer
			{orgId}
			personnelId={person.id}
			{personName}
			items={criticalTasks.current.value.items}
			taskId={drawerItemId}
			{asOf}
			canRecord={canRecordCriticalTasks}
			onSaved={refresh}
			onClose={close}
		/>
	{/key}
{/if}
