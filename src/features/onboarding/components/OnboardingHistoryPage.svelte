<script lang="ts">
	import { createRosterReadModel, type Group, type Personnel } from '$features/personnel/contracts';
	import type { ScopeSet } from '$lib/access/memberAccessShape';
	import type { OnboardingTemplate, PersonnelOnboarding } from '../contracts';
	import { getTemplateDisplayName } from '../contexts/OnboardingPageContext.svelte';
	import {
		buildHistory,
		filterHistoryRows,
		finalSteps,
		formatHistoryDate,
		HISTORY_ALL,
		historySubtitleParts,
		packetNotes,
		type HistoryPerson,
		type HistoryRow,
		type OutcomeFilter
	} from '../onboardingHistory';
	import type { NoteAuthorLookup } from '../onboardingNoteAuthors';
	import { todayIn } from '../onboardingStatus';
	import * as PageShell from '$lib/components/patterns/page-shell';
	import {
		WorkspaceToolbar,
		type ToolbarItem,
		type WorkspaceToolbarProps
	} from '$lib/components/patterns/workspace-toolbar';
	import { Button } from '$lib/components/ui/button';
	import * as Empty from '$lib/components/ui/empty';
	import ClipboardList from '@lucide/svelte/icons/clipboard-list';
	import SearchX from '@lucide/svelte/icons/search-x';
	import * as OnboardingPacketList from './packet-list';

	interface Props {
		orgUrlSegment: string;
		scopeSet: ScopeSet;
		onboardings: PersonnelOnboarding[];
		personnel: Personnel[];
		templates: OnboardingTemplate[];
		groups: Group[];
		noteAuthorName: NoteAuthorLookup;
		/** Months the Organization keeps finished packets, the same figure the cleanup job uses. */
		archiveRetentionMonths: number | null;
		/** Whether this member may open Organization settings, where the retention period is set. */
		canOpenOrganizationSettings: boolean;
	}

	let {
		orgUrlSegment,
		scopeSet,
		onboardings,
		personnel,
		templates,
		groups,
		noteAuthorName,
		archiveRetentionMonths,
		canOpenOrganizationSettings
	}: Props = $props();

	const OUTCOME_OPTIONS: { value: OutcomeFilter; label: string }[] = [
		{ value: 'all', label: 'All' },
		{ value: 'completed', label: 'Completed' },
		{ value: 'cancelled', label: 'Cancelled' }
	];

	const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
	// Finish dates are the member's local days, so the 90-day window is counted from the viewer's day.
	const todayDate = todayIn(timeZone, new Date()).date;

	let expandedId = $state('');
	let outcome = $state<OutcomeFilter>('all');
	let search = $state('');
	let groupId = $state(HISTORY_ALL);
	let templateId = $state(HISTORY_ALL);

	const roster = $derived(createRosterReadModel({ personnel }).scoped(scopeSet, { status: 'all' }));
	const history = $derived(buildHistory(onboardings, todayDate, timeZone));
	const subtitleParts = $derived(historySubtitleParts(history.overview));

	function personOf(personnelId: string): HistoryPerson | undefined {
		const person = roster.getById(personnelId);
		return (
			person && { name: roster.displayName(personnelId), rank: person.rank, mos: person.mos, groupId: person.groupId }
		);
	}

	const visibleRows = $derived(
		filterHistoryRows(history.rows, { outcome, query: search, groupId, templateId }, personOf)
	);
	const openId = $derived(visibleRows.some((row) => row.packet.id === expandedId) ? expandedId : '');
	const filtered = $derived(
		outcome !== 'all' || search.trim() !== '' || groupId !== HISTORY_ALL || templateId !== HISTORY_ALL
	);

	function clearFilters() {
		outcome = 'all';
		search = '';
		groupId = HISTORY_ALL;
		templateId = HISTORY_ALL;
	}

	const toolbarItems = $derived.by<ToolbarItem[]>(() => {
		const items: ToolbarItem[] = [
			{
				kind: 'view',
				id: 'outcome',
				label: 'Outcome',
				options: OUTCOME_OPTIONS,
				value: outcome,
				onValueChange: (value) => {
					outcome = value as OutcomeFilter;
				}
			}
		];
		if (groups.length > 0) {
			items.push({
				kind: 'select',
				id: 'group',
				label: 'Group',
				options: [
					{ value: HISTORY_ALL, label: 'All groups' },
					...groups.map((group) => ({ value: group.id, label: group.name }))
				],
				value: groupId,
				defaultValue: HISTORY_ALL,
				onValueChange: (value) => (groupId = value)
			});
		}
		if (templates.length > 0) {
			items.push({
				kind: 'select',
				id: 'template',
				label: 'Template',
				options: [
					{ value: HISTORY_ALL, label: 'All templates' },
					...templates.map((template) => ({ value: template.id, label: template.name }))
				],
				value: templateId,
				defaultValue: HISTORY_ALL,
				onValueChange: (value) => (templateId = value)
			});
		}
		items.push({
			kind: 'action',
			id: 'active',
			label: 'Active onboarding',
			icon: 'arrow-left',
			href: `/org/${orgUrlSegment}/onboarding`
		});
		return items;
	});

	const toolbarSearch = $derived({
		label: 'Search by name, rank, or MOS',
		placeholder: 'Search name, rank, MOS...',
		value: search,
		onValueChange: (value: string) => (search = value)
	} satisfies NonNullable<WorkspaceToolbarProps['search']>);

	function days(count: number): string {
		return count === 1 ? '1 day' : `${count} days`;
	}

	function personMeta(onboarding: PersonnelOnboarding): string {
		return [roster.groupName(onboarding.personnelId), roster.getById(onboarding.personnelId)?.mos]
			.filter(Boolean)
			.join(' · ');
	}

	function noteByline(stepName: string, userId: string, timestamp: string): string {
		const day = todayIn(timeZone, new Date(timestamp)).date;
		return `${stepName} · ${noteAuthorName(userId)} · ${formatHistoryDate(day, todayDate)}`;
	}

	function summaryOf(row: HistoryRow) {
		const { packet } = row;
		return {
			name: roster.displayName(packet.personnelId),
			meta: personMeta(packet),
			template: getTemplateDisplayName(packet.templateId, templates),
			dates: `${formatHistoryDate(packet.startedAt, todayDate)} → ${formatHistoryDate(row.finishedOn, todayDate)}`,
			took: days(row.days),
			tookLong: row.tookLong,
			final: `${row.done} of ${row.total}`,
			finalShort: row.outcome === 'cancelled',
			outcome: row.outcome
		};
	}
</script>

{#snippet subtitle()}
	{#each subtitleParts as part, index (part)}
		{#if index > 0}&nbsp;&middot;&nbsp;{/if}{part}
	{/each}
{/snippet}

<div class="flex h-full min-h-0 flex-col bg-background">
	<div class="grid shrink-0 gap-4 border-b border-border p-3 md:px-6 md:pt-6 md:pb-4">
		<PageShell.Header title="History" subtitle={subtitleParts.length > 0 ? subtitle : undefined} />
		<WorkspaceToolbar ariaLabel="Onboarding history controls" items={toolbarItems} search={toolbarSearch} />
	</div>

	<div class="grid min-h-0 flex-1 content-start gap-3 overflow-y-auto p-3 md:p-6">
		{#if history.rows.length === 0}
			<Empty.Root>
				<Empty.Media variant="icon"><ClipboardList /></Empty.Media>
				<Empty.Header>
					<Empty.Title>No finished packets yet</Empty.Title>
					<Empty.Description>Completed and cancelled packets appear here.</Empty.Description>
				</Empty.Header>
			</Empty.Root>
		{:else}
			<div class="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
				<div class="flex items-baseline gap-3">
					<h2 class="font-heading text-xl font-semibold">Finished packets</h2>
					<p class="font-mono text-xs text-muted-foreground">{visibleRows.length} · most recent first</p>
				</div>
				{#if archiveRetentionMonths !== null}
					<p class="text-sm text-muted-foreground">
						Kept {archiveRetentionMonths}
						{archiveRetentionMonths === 1 ? 'month' : 'months'} after finishing, then deleted. Set in
						{#if canOpenOrganizationSettings}
							<a
								href={`/org/${orgUrlSegment}/settings/policies`}
								class="underline underline-offset-3 hover:text-foreground">Organization settings</a
							>.
						{:else}
							Organization settings.
						{/if}
					</p>
				{/if}
			</div>

			{#if visibleRows.length === 0}
				<Empty.Root>
					<Empty.Media variant="icon"><SearchX /></Empty.Media>
					<Empty.Header>
						<Empty.Title>No packets match</Empty.Title>
						<Empty.Description>No finished packet matches these filters.</Empty.Description>
					</Empty.Header>
					{#if filtered}
						<Empty.Content>
							<Button variant="outline" onclick={clearFilters}>Clear filters</Button>
						</Empty.Content>
					{/if}
				</Empty.Root>
			{:else}
				<OnboardingPacketList.Root bind:value={expandedId}>
					<OnboardingPacketList.Header />
					{#each visibleRows as row (row.packet.id)}
						<OnboardingPacketList.Item value={row.packet.id}>
							<OnboardingPacketList.Trigger>
								<OnboardingPacketList.Summary {...summaryOf(row)} />
							</OnboardingPacketList.Trigger>
							<OnboardingPacketList.Content>
								{#if openId === row.packet.id}
									{@const notes = packetNotes(row.packet)}
									<OnboardingPacketList.Steps steps={finalSteps(row.packet)} />
									<OnboardingPacketList.Notes
										notes={notes.map((note) => ({
											text: note.text,
											byline: noteByline(note.stepName, note.userId, note.timestamp)
										}))}
									/>
								{/if}
							</OnboardingPacketList.Content>
						</OnboardingPacketList.Item>
					{/each}
				</OnboardingPacketList.Root>
			{/if}
		{/if}
	</div>
</div>
