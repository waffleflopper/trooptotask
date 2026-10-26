<script lang="ts">
	import { invalidate } from '$app/navigation';
	import * as Alert from '$lib/components/ui/alert';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { Spinner } from '$lib/components/ui/spinner';
	import { rejectedRequestMessage, withinOrganizationLifetime } from '$lib/stores/core';
	import { StreamedValue } from '$lib/utils/streamedValue.svelte';
	import type { EventRead } from '../../../events/eventModel';
	import EventLoadFailed from '../../../events/components/EventLoadFailed.svelte';
	import { isEditable, type GroupLabels, type Tasking } from '../../taskingModel';
	import {
		outsideScopeLabel,
		personName,
		pickReview,
		staffingLabel,
		type AvailabilityCoverage,
		type StaffingSave,
		type StaffingSaveResult,
		type TaskingStaffing
	} from '../staffingModel';
	import { saveStaffingRequest } from '../staffingRequests';
	import { availabilityTargets } from '../availabilityPrefill';
	import AssignPeopleDialog from './AssignPeopleDialog.svelte';
	import SetAvailability from './SetAvailability.svelte';
	import { groupLabel, reviewLabel } from './staffingLabels';

	interface Props {
		orgId: string;
		tasking: Tasking;
		groups: GroupLabels;
		people: Promise<EventRead<TaskingStaffing>>;
		canManage: boolean;
		orgUrlSegment: string;
		/** Whether the reader may set Availability for a Person in this Group, under Bulk Status's rules. */
		canSetAvailability: (groupId: string | null) => boolean;
		availabilityGaps: Promise<EventRead<AvailabilityCoverage>>;
	}

	let { orgId, tasking, groups, people, canManage, orgUrlSegment, canSetAvailability, availabilityGaps }: Props =
		$props();

	const streamed = new StreamedValue(() => people);
	// A save answers with the stored selection; it stands until the refreshed load arrives.
	let saved = $state.raw<{ staffing: TaskingStaffing; over: unknown } | null>(null);
	let assigning = $state(false);
	let resolvingId = $state<string | null>(null);
	let resolveError = $state('');
	let alive = true;

	$effect(() => () => (alive = false));

	const staffing = $derived.by(() => {
		const current = streamed.current;
		if (current.state !== 'ready') return current.state === 'failed' ? ('failed' as const) : null;
		if (current.value.status !== 'loaded') return 'failed' as const;
		return saved?.over === current ? saved.staffing : current.value.value;
	});
	const editable = $derived(canManage && isEditable(tasking));
	const organizationLevel = $derived(tasking.responsibility.kind === 'organization');

	function show(result: StaffingSaveResult) {
		saved = { staffing: result.staffing, over: streamed.current };
		if (result.outcome !== 'unchanged') void invalidate('app:calendar-events');
	}

	async function resolve(current: TaskingStaffing, personnelId: string, keep: boolean) {
		if (resolvingId) return;
		resolvingId = personnelId;
		resolveError = '';
		const ids = current.picks.map((pick) => pick.personnelId);
		const save: StaffingSave = {
			personnelIds: keep ? ids : ids.filter((id) => id !== personnelId),
			keep: keep ? [personnelId] : [],
			removeOutsideScope: false,
			expectedRevision: current.revision
		};
		try {
			const result = await withinOrganizationLifetime(saveStaffingRequest(orgId, tasking.id, save), () => alive);
			show(result);
			if (result.outcome === 'conflict')
				resolveError = 'Someone else changed who is picked just now. This list shows their changes; review it again.';
		} catch (error) {
			if (alive) resolveError = rejectedRequestMessage(error, 'Nothing changed. Try again in a moment.');
		} finally {
			if (alive) resolvingId = null;
		}
	}
</script>

<section class="grid gap-3" aria-labelledby="tasking-people-heading">
	<div class="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
		<div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
			<h2 id="tasking-people-heading" class="font-heading text-lg font-semibold">People</h2>
			{#if staffing === null}
				<Skeleton class="h-5 w-24" />
			{:else if staffing !== 'failed'}
				<span class="text-sm text-muted-foreground tabular-nums">
					{staffingLabel(staffing.picked, tasking.requirement?.count ?? null) ?? 'Nobody picked yet'}
				</span>
			{/if}
		</div>
		{#if editable}
			<Button variant="outline" onclick={() => (assigning = true)} disabled={typeof staffing !== 'object'}>
				Assign people
			</Button>
		{/if}
	</div>

	{#if resolveError}
		<Alert.Root variant="destructive">
			<Alert.Description>{resolveError}</Alert.Description>
		</Alert.Root>
	{/if}

	{#if staffing === null}
		<div class="grid gap-2 rounded-lg border p-3" role="status" aria-label="Loading people">
			{#each [0, 1, 2] as placeholder (placeholder)}
				<Skeleton class="h-6 w-1/2" />
			{/each}
		</div>
	{:else if staffing === 'failed'}
		<EventLoadFailed title="People could not be loaded" />
	{:else if staffing.picks.length === 0 && staffing.outsideScope === 0}
		<p class="m-0 rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
			{editable ? 'Nobody is picked yet. Assign people to fill this tasking.' : 'Nobody is picked yet.'}
		</p>
	{:else}
		<ul class="divide-y rounded-lg border">
			{#each staffing.picks as pick (pick.personnelId)}
				{@const review = pickReview(pick, tasking.responsibility)}
				<li class="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-3 py-2">
					<span class="grid min-w-0 gap-0.5">
						<span class="truncate font-medium">{personName(pick)}</span>
						{#if organizationLevel || review}
							<span class="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
								{#if organizationLevel}<span>{groupLabel(pick.groupId, groups)}</span>{/if}
								{#if review}
									<Badge variant="warning">Needs review</Badge>
									<span>{reviewLabel(review, pick.groupId, groups)}</span>
								{/if}
							</span>
						{/if}
					</span>
					{#if review && editable}
						<span class="flex gap-2">
							{#if review === 'eligible_again'}
								<Button
									size="sm"
									variant="outline"
									onclick={() => resolve(staffing, pick.personnelId, true)}
									disabled={resolvingId !== null}
									aria-label={`Keep ${personName(pick)}`}
								>
									{#if resolvingId === pick.personnelId}<Spinner />{/if}
									Keep
								</Button>
							{/if}
							<Button
								size="sm"
								variant="outline"
								onclick={() => resolve(staffing, pick.personnelId, false)}
								disabled={resolvingId !== null}
								aria-label={`Remove ${personName(pick)}`}
							>
								Remove
							</Button>
						</span>
					{/if}
				</li>
			{/each}
			{#if staffing.outsideScope > 0}
				<li class="px-3 py-2 text-sm text-muted-foreground">{outsideScopeLabel(staffing.outsideScope)}</li>
			{/if}
		</ul>
		{#if staffing.picks.some((pick) => pickReview(pick, tasking.responsibility))}
			<p class="m-0 text-sm text-muted-foreground">
				People under review stay on the list but do not count toward the requirement until someone keeps or removes
				them.
			</p>
		{/if}
	{/if}

	{#if typeof staffing === 'object' && staffing !== null && tasking.execution && isEditable(tasking)}
		{@const targets = availabilityTargets(staffing.picks, canSetAvailability)}
		{#if targets.length > 0}
			<SetAvailability {orgUrlSegment} {tasking} execution={tasking.execution} {targets} gaps={availabilityGaps} />
		{/if}
	{/if}
</section>

{#if assigning && typeof staffing === 'object' && staffing !== null}
	<AssignPeopleDialog
		{orgId}
		{tasking}
		{groups}
		onSaved={(result) => {
			show(result);
			assigning = false;
		}}
		onClose={() => (assigning = false)}
	/>
{/if}
