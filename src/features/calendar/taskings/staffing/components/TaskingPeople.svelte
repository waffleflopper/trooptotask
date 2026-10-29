<script lang="ts">
	import { buildGroupTree, type Group } from '$features/personnel/contracts';
	import * as Alert from '$lib/components/ui/alert';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { Spinner } from '$lib/components/ui/spinner';
	import { rejectedRequestMessage, withinOrganizationLifetime } from '$lib/stores/core';
	import { formatWeekdayDayMonth } from '$lib/utils/dates';
	import { StreamedValue } from '$lib/utils/streamedValue.svelte';
	import type { EventRead } from '../../../events/eventModel';
	import EventLoadFailed from '../../../events/components/EventLoadFailed.svelte';
	import { isActiveStatus, isEditable, type GroupLabels, type Tasking } from '../../taskingModel';
	import {
		outsideScopeLabel,
		personName,
		pickReview,
		type AvailabilityCoverage,
		type StaffingPersonState,
		type StaffingSave,
		type TaskingPick,
		type TaskingStaffing
	} from '../staffingModel';
	import { saveStaffingRequest } from '../staffingRequests';
	import { availabilityTargets } from '../availabilityPrefill';
	import PersonState from './PersonState.svelte';
	import SetAvailability from './SetAvailability.svelte';
	import { groupLabel, personStateLine, reviewLabel } from './staffingLabels';
	import type { TaskingStaffingState } from './staffingState.svelte';

	interface Props {
		orgId: string;
		tasking: Tasking;
		groups: GroupLabels;
		groupCatalog: readonly Group[];
		staffing: TaskingStaffingState;
		pickStates: Promise<EventRead<Record<string, StaffingPersonState>>>;
		canManage: boolean;
		orgUrlSegment: string;
		today: string;
		/** Whether the reader may set Availability for a Person in this Group, under Bulk Status's rules. */
		canSetAvailability: (groupId: string | null) => boolean;
		availabilityGaps: Promise<EventRead<AvailabilityCoverage>>;
	}

	let {
		orgId,
		tasking,
		groups,
		groupCatalog,
		staffing,
		pickStates,
		canManage,
		orgUrlSegment,
		today,
		canSetAvailability,
		availabilityGaps
	}: Props = $props();

	const groupTree = $derived(buildGroupTree(groupCatalog));

	const streamedStates = new StreamedValue(() => pickStates);
	let resolvingId = $state<string | null>(null);
	let resolveError = $state('');
	let alive = true;

	$effect(() => () => (alive = false));

	const current = $derived(staffing.current);
	const states = $derived.by(() => {
		const settled = streamedStates.current;
		if (settled.state === 'pending' || settled.state === 'absent') return null;
		return settled.state === 'ready' && settled.value.status === 'loaded' ? settled.value.value : ('failed' as const);
	});
	const editable = $derived(canManage && isEditable(tasking));
	const organizationLevel = $derived(tasking.responsibility.kind === 'organization');
	const required = $derived(tasking.requirement?.count ?? null);
	const scopeName = $derived(
		tasking.responsibility.kind === 'organization' ? null : groupLabel(tasking.responsibility.groupId, groups)
	);
	const requirementLine = $derived(
		[tasking.requirement?.qualifications?.replace(/\.$/, ''), scopeName ? `From ${scopeName}` : 'From any Group']
			.filter(Boolean)
			.join('. ') + '.'
	);
	const neededBy = $derived(formatWeekdayDayMonth(tasking.execution?.startsOn ?? tasking.suspenseOn));

	function secondary(pick: TaskingPick) {
		return [
			pick.mos,
			organizationLevel && groupLabel(pick.groupId, groups),
			pick.clinicRole,
			staffing.added.has(pick.personnelId) && 'new'
		]
			.filter(Boolean)
			.join(' · ');
	}

	async function resolve(selection: TaskingStaffing, personnelId: string, keep: boolean) {
		if (resolvingId) return;
		resolvingId = personnelId;
		resolveError = '';
		const ids = selection.picks.map((pick) => pick.personnelId);
		const save: StaffingSave = {
			personnelIds: keep ? ids : ids.filter((id) => id !== personnelId),
			keep: keep ? [personnelId] : [],
			removeOutsideScope: false,
			expectedRevision: selection.revision
		};
		try {
			const result = await withinOrganizationLifetime(saveStaffingRequest(orgId, tasking.id, save), () => alive);
			staffing.show(result);
			if (result.outcome === 'conflict')
				resolveError = 'Someone else changed who is picked just now. This list shows their changes; review it again.';
		} catch (error) {
			if (alive) resolveError = rejectedRequestMessage(error, 'Nothing changed. Try again in a moment.');
		} finally {
			if (alive) resolvingId = null;
		}
	}
</script>

<!-- Nobody needed and nobody picked has nothing to show, so the card stays out of the way. -->
{#if required !== null || (typeof current === 'object' && current !== null && (current.picks.length > 0 || current.outsideScope > 0)) || current === 'failed'}
	<section
		class="@container overflow-clip rounded-lg border border-border bg-card"
		aria-labelledby="tasking-people-heading"
	>
		<div class="flex items-start justify-between gap-3 px-4 pt-[14px] pb-3">
			<div class="grid min-w-0 gap-0.5">
				<div class="flex flex-wrap items-baseline gap-x-2.5">
					<h2 id="tasking-people-heading" class="font-heading text-xl leading-6 font-semibold">People</h2>
					{#if current === null}
						<Skeleton class="h-4 w-24 self-center" />
					{:else if current !== 'failed'}
						<span
							class={[
								'font-mono text-[13px] font-semibold tabular-nums',
								required === null
									? 'text-muted-foreground'
									: current.picked >= required
										? 'text-success-foreground'
										: 'text-accent-text'
							]}
						>
							{required === null ? `${current.picked} selected` : `${current.picked} of ${required} selected`}
						</span>
					{/if}
				</div>
				<p class="m-0 text-[13px] leading-[18px] text-muted-foreground">{requirementLine}</p>
			</div>
			{#if editable && typeof current === 'object' && current !== null && current.picks.length > 0}
				<Button variant="outline" size="sm" class="h-[30px]" onclick={() => (staffing.assigning = true)}>Change</Button>
			{/if}
		</div>

		{#if resolveError}
			<Alert.Root variant="destructive" class="m-3 w-auto">
				<Alert.Description>{resolveError}</Alert.Description>
			</Alert.Root>
		{/if}

		{#if current === null}
			<div role="status" aria-label="Loading people">
				{#each [0, 1, 2] as placeholder (placeholder)}
					<div class="flex h-[46px] items-center gap-3 border-t border-border px-4">
						<Skeleton class="h-3.5 w-9" />
						<Skeleton class="h-4 w-40" />
					</div>
				{/each}
			</div>
		{:else if current === 'failed'}
			<div class="border-t border-border p-3"><EventLoadFailed title="People could not be loaded" /></div>
		{:else}
			{@const open =
				required !== null && isActiveStatus(tasking.status.kind) ? Math.max(0, required - current.picked) : 0}
			<ul class="m-0 list-none p-0">
				{#each current.picks as pick (pick.personnelId)}
					{@const review = pickReview(pick, tasking.responsibility, groupTree)}
					<li
						class={[
							'flex min-h-[46px] flex-wrap items-center gap-x-3 gap-y-1 border-t border-border px-4 py-2',
							staffing.added.has(pick.personnelId) && 'bg-success/6'
						]}
					>
						<span class="w-9 shrink-0 font-mono text-xs text-muted-foreground">{pick.rank}</span>
						<span class="min-w-0 flex-1 basis-32 truncate text-sm">{pick.lastName}, {pick.firstName}</span>
						<span class="hidden w-[150px] shrink-0 truncate font-mono text-xs text-muted-foreground @[40rem]:block">
							{secondary(pick)}
						</span>
						<span
							class="flex basis-full flex-wrap items-center gap-2 pl-12 @[40rem]:w-[230px] @[40rem]:basis-auto @[40rem]:pl-0"
						>
							{#if review}
								<Badge variant="warning">Needs review</Badge>
								<span class="text-[13px] text-muted-foreground">{reviewLabel(review, pick.groupId, groups)}</span>
								{#if editable}
									{#if review === 'eligible_again'}
										<Button
											size="sm"
											variant="outline"
											onclick={() => resolve(current, pick.personnelId, true)}
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
										onclick={() => resolve(current, pick.personnelId, false)}
										disabled={resolvingId !== null}
										aria-label={`Remove ${personName(pick)}`}
									>
										Remove
									</Button>
								{/if}
							{:else if states === null}
								<Skeleton class="h-4 w-32" />
							{:else if states !== 'failed'}
								<PersonState
									line={personStateLine(
										states[pick.personnelId] ?? { kind: 'unknown', reason: 'failed' },
										tasking.execution,
										today
									)}
								/>
							{/if}
						</span>
					</li>
				{/each}
				{#if current.outsideScope > 0}
					<li class="border-t border-border px-4 py-2.5 text-[13px] text-muted-foreground">
						{outsideScopeLabel(current.outsideScope)}
					</li>
				{/if}
				{#if open > 0}
					<li class="flex min-h-[50px] flex-wrap items-center gap-3 border-t border-border bg-accent/6 px-4 py-2">
						<span
							class="h-[22px] w-9 shrink-0 rounded-[3px] border-[1.5px] border-dashed border-accent"
							aria-hidden="true"
						></span>
						<span class="min-w-0 flex-1 text-sm font-medium text-accent-text">
							{open} more {open === 1 ? 'person' : 'people'} needed by {neededBy}
						</span>
						{#if editable}
							<Button
								variant="outline"
								size="sm"
								class="h-[30px] border-accent bg-background text-accent-text hover:bg-accent/10 hover:text-accent-text"
								onclick={() => (staffing.assigning = true)}
							>
								Pick {open} more
							</Button>
						{/if}
					</li>
				{/if}
			</ul>
			{#if states === 'failed' && current.picks.length > 0}
				<p class="m-0 border-t border-border px-4 py-2.5 text-[13px] text-muted-foreground">
					Overlaps could not be checked, so nothing is claimed about them.
				</p>
			{/if}
			{#if current.picks.some((pick) => pickReview(pick, tasking.responsibility, groupTree))}
				<p class="m-0 border-t border-border px-4 py-2.5 text-[13px] text-muted-foreground">
					People under review stay on the list but do not count toward the requirement until someone keeps or removes
					them.
				</p>
			{/if}
			{#if tasking.execution && isEditable(tasking)}
				{@const targets = availabilityTargets(current.picks, canSetAvailability)}
				{#if targets.length > 0}
					<div class="border-t border-border px-4 py-3">
						<SetAvailability
							{orgUrlSegment}
							{tasking}
							execution={tasking.execution}
							{targets}
							gaps={availabilityGaps}
						/>
					</div>
				{/if}
			{/if}
		{/if}
	</section>
{/if}
