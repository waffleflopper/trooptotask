<script lang="ts">
	import type { PersonnelLookup } from '$lib/types';
	import type { RatingSchemeEntry } from '../rating-scheme.types';
	import { RATING_STATUS_COLORS, WORKFLOW_STATUS_OPTIONS } from '../rating-scheme.types';
	import { getRatingDueStatus, getDaysUntilDue } from '$features/rating-scheme/utils/ratingScheme';
	import { Badge } from '$lib/components/ui/badge';
	import * as Empty from '$lib/components/ui/empty';
	import { SvelteMap } from 'svelte/reactivity';

	interface Props {
		entries: RatingSchemeEntry[];
		personnel: PersonnelLookup[];
		onEdit?: (entry: RatingSchemeEntry) => void;
	}

	let { entries, personnel, onEdit }: Props = $props();

	function getPersonDisplay(id: string | null, name: string | null): string {
		if (id) {
			const p = personnel.find((p) => p.id === id);
			return p ? `${p.rank} ${p.lastName}, ${p.firstName}` : 'Unknown';
		}
		return name ?? 'Not Set';
	}

	function getSeniorRaterKey(entry: RatingSchemeEntry): string {
		return entry.seniorRaterPersonId || entry.seniorRaterName || 'unassigned';
	}

	function getRaterKey(entry: RatingSchemeEntry): string {
		return entry.raterPersonId || entry.raterName || 'unassigned';
	}

	interface GroupedScheme {
		seniorRaterKey: string;
		seniorRaterLabel: string;
		raterGroups: {
			raterKey: string;
			raterLabel: string;
			entries: RatingSchemeEntry[];
		}[];
	}

	const grouped = $derived.by<GroupedScheme[]>(() => {
		const srMap = new SvelteMap<string, SvelteMap<string, RatingSchemeEntry[]>>();

		for (const entry of entries) {
			const srKey = getSeniorRaterKey(entry);
			if (!srMap.has(srKey)) srMap.set(srKey, new SvelteMap());
			const raterMap = srMap.get(srKey)!;
			const rKey = getRaterKey(entry);
			if (!raterMap.has(rKey)) raterMap.set(rKey, []);
			raterMap.get(rKey)!.push(entry);
		}

		const result: GroupedScheme[] = [];
		for (const [seniorRaterKey, raterMap] of srMap) {
			const firstEntry = [...raterMap.values()][0][0];
			const seniorRaterLabel = getPersonDisplay(firstEntry.seniorRaterPersonId, firstEntry.seniorRaterName);

			const raterGroups: GroupedScheme['raterGroups'] = [];
			for (const [raterKey, raterEntries] of raterMap) {
				const firstRaterEntry = raterEntries[0];
				raterGroups.push({
					raterKey,
					raterLabel: getPersonDisplay(firstRaterEntry.raterPersonId, firstRaterEntry.raterName),
					entries: raterEntries.sort((a, b) => a.ratingPeriodEnd.localeCompare(b.ratingPeriodEnd))
				});
			}
			result.push({ seniorRaterKey, seniorRaterLabel, raterGroups });
		}
		return result;
	});

	function formatDueStatus(entry: RatingSchemeEntry): { label: string; color: string } {
		const status = getRatingDueStatus(entry.ratingPeriodEnd, entry.status);
		const days = getDaysUntilDue(entry.ratingPeriodEnd);
		const color = RATING_STATUS_COLORS[status];

		if (status === 'completed') return { label: 'Completed', color };
		if (status === 'overdue') return { label: `Overdue (${Math.abs(days)}d)`, color };
		if (status === 'due-30') return { label: `${days}d`, color };
		if (status === 'due-60') return { label: `${days}d`, color };
		return { label: 'Current', color };
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
								<button
									class="flex w-full flex-wrap items-center gap-2 border-b px-4 py-3 pl-12 text-left text-sm transition-colors last:border-b-0 hover:bg-muted/40"
									type="button"
									onclick={() => onEdit(entry)}
								>
									<span class="min-w-35 text-sm font-normal">{getRatedPersonLabel(entry.ratedPersonId)}</span>
									<Badge variant="secondary"
										>{entry.reportType ? `${entry.evalType}/${entry.reportType}` : entry.evalType}</Badge
									>
									{#if entry.workflowStatus}
										<Badge variant="secondary">{getWorkflowLabel(entry.workflowStatus)}</Badge>
									{/if}
									<span class="ml-auto text-xs font-medium whitespace-nowrap text-muted-foreground uppercase">
										{formatDate(entry.ratingPeriodStart)}-{formatDate(entry.ratingPeriodEnd)}
									</span>
									<Badge variant="outline">{due.label}</Badge>
								</button>
							{:else}
								<div class="flex flex-wrap items-center gap-2 border-b px-4 py-3 pl-12 text-sm last:border-b-0">
									<span class="min-w-35 text-sm font-normal">{getRatedPersonLabel(entry.ratedPersonId)}</span>
									<Badge variant="secondary"
										>{entry.reportType ? `${entry.evalType}/${entry.reportType}` : entry.evalType}</Badge
									>
									{#if entry.workflowStatus}
										<Badge variant="secondary">{getWorkflowLabel(entry.workflowStatus)}</Badge>
									{/if}
									<span class="ml-auto text-xs font-medium whitespace-nowrap text-muted-foreground uppercase">
										{formatDate(entry.ratingPeriodStart)}-{formatDate(entry.ratingPeriodEnd)}
									</span>
									<Badge variant="outline">{due.label}</Badge>
								</div>
							{/if}
						{/each}
					</div>
				{/each}
			</div>
		{/each}
	</div>
{/if}
