<script lang="ts">
	import type { PersonnelLookup } from '$features/personnel/contracts';
	import type { RatingSchemeEntry } from '../rating-scheme.types';
	import type { RatingDueStatus } from '../rating-scheme.types';
	import { WORKFLOW_STATUS_OPTIONS } from '../rating-scheme.types';
	import { getRatingDueStatus, getDaysUntilDue } from '$features/rating-scheme/utils/ratingScheme';
	import EvalBadge from './EvalBadge.svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Empty from '$lib/components/ui/empty';
	import { groupRatingSchemeEntries, type GroupedSort } from '../utils/ratingSchemeGroups';

	interface Props {
		entries: RatingSchemeEntry[];
		personnel: PersonnelLookup[];
		sort?: GroupedSort;
		onEdit?: (entry: RatingSchemeEntry) => void;
	}

	let { entries, personnel, sort = 'urgency', onEdit }: Props = $props();

	const grouped = $derived(
		groupRatingSchemeEntries(entries, personnel, sort).map((group) => ({
			seniorRaterKey: group.key,
			seniorRaterLabel: group.label,
			raterGroups: group.raterGroups.map((rater) => ({
				raterKey: rater.key,
				raterLabel: rater.label,
				entries: rater.entries
			}))
		}))
	);

	function formatDueStatus(entry: RatingSchemeEntry): { status: RatingDueStatus; label: string } {
		const status = getRatingDueStatus(entry.ratingPeriodEnd, entry.status);
		const days = getDaysUntilDue(entry.ratingPeriodEnd);

		if (status === 'completed') return { status, label: 'Completed' };
		if (status === 'overdue') return { status, label: `Expired (${Math.abs(days)}d)` };
		if (status === 'due-30') return { status, label: `Expiring (${days}d)` };
		if (status === 'due-60') return { status, label: `Expires Soon (${days}d)` };
		return { status, label: 'Current' };
	}

	function getRatedPersonLabel(id: string): string {
		const p = personnel.find((p) => p.id === id);
		return p ? `${p.rank} ${p.lastName}` : 'Unknown';
	}

	function formatDate(dateStr: string): string {
		const d = new Date(dateStr + 'T00:00:00');
		return d.toLocaleDateString('en-US', { day: '2-digit', month: 'short' });
	}

	function getWorkflowLabel(status: string): string {
		return WORKFLOW_STATUS_OPTIONS.find((o) => o.value === status)?.label ?? status;
	}
</script>

{#if entries.length === 0}
	<Empty.Root>
		<Empty.Header>
			<Empty.Title>No rating scheme entries yet</Empty.Title>
			<Empty.Description>Click Add Entry to get started.</Empty.Description>
		</Empty.Header>
	</Empty.Root>
{:else}
	<div class="grid gap-4 p-4">
		{#each grouped as srGroup (srGroup.seniorRaterKey)}
			<div class="overflow-hidden rounded-lg border bg-card text-card-foreground">
				<div class="border-b bg-muted/40 px-4 py-3 text-base font-medium text-foreground uppercase">
					<span class="text-muted-foreground">SR:</span>
					{srGroup.seniorRaterLabel}
				</div>
				{#each srGroup.raterGroups as rGroup (rGroup.raterKey)}
					<div class="border-b last:border-b-0">
						<div class="border-b bg-muted/20 px-4 py-2 pl-8 text-sm font-medium text-muted-foreground uppercase">
							<span>Rater:</span>
							{rGroup.raterLabel}
						</div>
						{#each rGroup.entries as entry (entry.id)}
							{@const due = formatDueStatus(entry)}
							{#if onEdit}
								<Button
									variant="cell"
									size="none"
									class="flex h-auto w-full flex-wrap items-center justify-start gap-2 border-b border-border px-4 py-3 pl-12 text-left text-sm whitespace-normal last:border-b-0"
									data-rating-entry-id={entry.id}
									onclick={() => onEdit(entry)}
								>
									<span class="min-w-35 text-sm font-normal">{getRatedPersonLabel(entry.ratedPersonId)}</span>
									<EvalBadge kind="type" value={entry.evalType} reportType={entry.reportType} />
									{#if entry.workflowStatus}
										<EvalBadge kind="workflow" value={entry.workflowStatus}
											>{getWorkflowLabel(entry.workflowStatus)}</EvalBadge
										>
									{/if}
									<span class="ml-auto inline-flex items-center gap-2">
										<EvalBadge kind="due" value={due.status}>{due.label}</EvalBadge>
										<span class="text-xs font-medium whitespace-nowrap text-muted-foreground uppercase">
											{formatDate(entry.ratingPeriodStart)}-{formatDate(entry.ratingPeriodEnd)}
										</span>
									</span>
								</Button>
							{:else}
								<div class="flex flex-wrap items-center gap-2 border-b px-4 py-3 pl-12 text-sm last:border-b-0">
									<span class="min-w-35 text-sm font-normal">{getRatedPersonLabel(entry.ratedPersonId)}</span>
									<EvalBadge kind="type" value={entry.evalType} reportType={entry.reportType} />
									{#if entry.workflowStatus}
										<EvalBadge kind="workflow" value={entry.workflowStatus}
											>{getWorkflowLabel(entry.workflowStatus)}</EvalBadge
										>
									{/if}
									<span class="ml-auto inline-flex items-center gap-2">
										<EvalBadge kind="due" value={due.status}>{due.label}</EvalBadge>
										<span class="text-xs font-medium whitespace-nowrap text-muted-foreground uppercase">
											{formatDate(entry.ratingPeriodStart)}-{formatDate(entry.ratingPeriodEnd)}
										</span>
									</span>
								</div>
							{/if}
						{/each}
					</div>
				{/each}
			</div>
		{/each}
	</div>
{/if}
