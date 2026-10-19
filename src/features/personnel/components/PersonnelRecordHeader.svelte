<script lang="ts">
	import { onDestroy } from 'svelte';
	import * as PageShell from '$lib/components/patterns/page-shell';
	import type { RouteTabBadge, RouteTabItem } from '$lib/components/patterns/page-shell';
	import {
		WorkspaceToolbar,
		type ToolbarAction,
		type ToolbarItem,
		type WorkspaceToolbarProps
	} from '$lib/components/patterns/workspace-toolbar';
	import * as Alert from '$lib/components/ui/alert';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { ConfirmDialog } from '$lib/components/ui/confirm-dialog';
	import { Separator } from '$lib/components/ui/separator';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
	import ArchiveIcon from '@lucide/svelte/icons/archive';
	import type { PersonnelDetailHeader, PersonnelDetailLayoutStreams, PersonnelPageAccess } from '../contracts';
	import { MOS_TITLES } from '../mosTitles';
	import { formatServiceSpan } from '../serviceSpan';
	import type { RequestPersonnelArchiveApproval } from '../utils/archivePersonnel';
	import type { DataSheetEditSession } from '../workspace/dataSheetEditSession.svelte';
	import { PersonnelRecordActions } from '../workspace/personnelRecordActions.svelte';

	interface Props {
		orgId: string;
		orgUrlSegment: string;
		header: PersonnelDetailHeader;
		streams: PersonnelDetailLayoutStreams;
		today: string;
		activeTab: string;
		access: Pick<PersonnelPageAccess, 'affordanceForFeatureAction'>;
		requestArchiveApproval: RequestPersonnelArchiveApproval;
		/** The open Data sheet edit, when there is one. Its actions replace the toolbar and the other tabs dim. */
		edit?: DataSheetEditSession | null;
	}

	let {
		orgId,
		orgUrlSegment,
		header,
		streams,
		today,
		activeTab,
		access,
		requestArchiveApproval,
		edit = null
	}: Props = $props();

	const person = $derived(header.person);
	const basePath = $derived(`/org/${orgUrlSegment}/personnel/${person.slug}` as const);
	const actions = new PersonnelRecordActions(() => ({ orgId, orgUrlSegment, person, requestArchiveApproval }));
	onDestroy(actions.dispose);

	const recordResource = $derived(
		person.groupId ? { kind: 'group' as const, groupId: person.groupId } : { kind: 'organization' as const }
	);
	const allows = (action: Parameters<typeof access.affordanceForFeatureAction>[0]) =>
		access.affordanceForFeatureAction(action, recordResource).allowed;
	const canManageRecords = $derived(allows(POLICY_ACTION_CATALOG.personnel.manageRecords));
	const canAddReadableRecords = $derived(
		canManageRecords && allows(POLICY_ACTION_CATALOG.personnel.readSensitiveRecords)
	);
	const canExportRecords = $derived(allows(POLICY_ACTION_CATALOG.personnel.exportRecords));
	const canRecordTraining = $derived(allows(POLICY_ACTION_CATALOG.training.recordCompletions));

	const eyebrow = $derived([person.groupName, person.clinicRole].filter(Boolean).join(' · ') || undefined);
	const title = $derived(`${person.rank} ${person.firstName} ${person.lastName}`);
	const mosTitle = $derived(person.mos ? MOS_TITLES[person.mos] : undefined);
	const serviceFacts = $derived(
		[
			[formatServiceSpan(header.basd, today), 'service'],
			[formatServiceSpan(header.dateOfRank, today), 'in grade']
		].flatMap(([span, unit]) => (span ? [`${span} ${unit}`] : []))
	);

	const addItems = $derived(
		(
			[
				{
					id: 'add-follow-up',
					label: 'Follow-up',
					description: 'Something that needs doing, with a due date',
					icon: 'square-check',
					href: `${basePath}/log?add=follow-up`,
					allowed: canAddReadableRecords
				},
				{
					id: 'add-note',
					label: 'Note',
					description: 'An observation. No action needed.',
					icon: 'notebook-pen',
					href: `${basePath}/log?add=note`,
					allowed: canAddReadableRecords
				},
				{
					id: 'add-counseling',
					label: 'Counseling',
					description: 'DA 4856 PDF with the date conducted',
					icon: 'file-text',
					href: `${basePath}/files?add=counseling`,
					allowed: canAddReadableRecords
				},
				{
					id: 'add-document',
					label: 'Document',
					description: 'Certificate, form, or photo',
					icon: 'upload',
					href: `${basePath}/files?add=document`,
					allowed: canAddReadableRecords
				},
				{
					id: 'add-training',
					label: 'Training completion',
					description: 'Log a completed course or validation',
					icon: 'circle-check',
					href: `${basePath}/readiness?add=training`,
					allowed: canRecordTraining
				}
			] as const
		).flatMap(({ allowed, ...item }): ToolbarAction[] => (allowed ? [{ kind: 'action', ...item }] : []))
	);

	const toolbarItems = $derived<ToolbarItem[]>([
		...(canManageRecords
			? [{ kind: 'action', id: 'edit', label: 'Edit', href: `${basePath}/data-sheet?edit=1` } satisfies ToolbarAction]
			: []),
		...(canExportRecords
			? [
					{
						kind: 'action',
						id: 'export-records',
						label: actions.exporting ? 'Exporting...' : 'Export records',
						icon: 'download',
						menuOnly: true,
						loading: actions.exporting,
						onclick: actions.exportRecords
					} satisfies ToolbarAction
				]
			: []),
		...(canManageRecords
			? [
					{
						kind: 'action',
						id: 'archive',
						label: 'Archive',
						icon: 'archive',
						menuOnly: true,
						destructive: true,
						onclick: () => (actions.confirmingArchive = true)
					} satisfies ToolbarAction
				]
			: [])
	]);
	const primary = $derived<WorkspaceToolbarProps['primary']>(
		addItems.length > 0
			? { kind: 'action', id: 'add-to-record', label: 'Add to record', icon: 'plus', menuItems: addItems }
			: undefined
	);

	function readinessTabBadge(badge: Awaited<PersonnelDetailLayoutStreams['readinessBadge']>): RouteTabBadge | null {
		if (!badge) return null;
		const { count, complete } = badge;
		if (!complete) {
			return {
				value: count > 0 ? `${count}+` : '–',
				label: count > 0 ? `${count} or more items need attention` : 'not every item could be checked',
				variant: 'outline'
			};
		}
		if (!count) return null;
		return {
			value: count,
			label: `${count} ${count === 1 ? 'item needs' : 'items need'} attention`,
			variant: 'outline'
		};
	}

	const sections = $derived<(RouteTabItem & { path: string })[]>([
		{ path: '', label: 'Overview', href: basePath },
		{
			path: '/readiness',
			label: 'Readiness',
			href: `${basePath}/readiness`,
			badge: streams.readinessBadge.then(readinessTabBadge)
		},
		{
			path: '/log',
			label: 'Log',
			href: `${basePath}/log`,
			badge: streams.tabCounts.then((counts) =>
				counts?.log ? { value: counts.log, label: `${counts.log} open follow-ups`, variant: 'outline' as const } : null
			)
		},
		{ path: '/files', label: 'Files', href: `${basePath}/files` },
		{ path: '/data-sheet', label: 'Data sheet', href: `${basePath}/data-sheet` },
		{
			path: '/archived',
			label: 'Archived',
			href: `${basePath}/archived`,
			icon: ArchiveIcon,
			trailing: true,
			badge: streams.tabCounts.then((counts) =>
				counts?.archived ? { value: counts.archived, label: `${counts.archived} archived items` } : null
			)
		}
	]);
	const tabs = $derived(
		sections.map((section) => {
			const active = section.path === activeTab;
			return { ...section, active, disabled: edit !== null && !active };
		})
	);
	const unsavedLabel = $derived(
		edit ? `${edit.changeCount} unsaved ${edit.changeCount === 1 ? 'change' : 'changes'}` : ''
	);
</script>

<svelte:head>
	<title>{person.rank} {person.lastName}, {person.firstName} - Personnel</title>
</svelte:head>

<header class="grid gap-4 px-6 pt-5">
	<PageShell.Header {eyebrow} {title} variant="display">
		{#snippet subtitle()}
			<div class="flex flex-wrap items-center gap-x-3 gap-y-1.5">
				{#if person.mos}
					<Badge variant="outline">{person.mos}</Badge>
				{/if}
				{#if mosTitle}
					<span class="text-foreground">{mosTitle}</span>
				{/if}
				{#each serviceFacts as fact, index (fact)}
					{#if person.mos || index > 0}
						<Separator orientation="vertical" class="h-4" />
					{/if}
					<span>{fact}</span>
				{/each}
			</div>
		{/snippet}
	</PageShell.Header>
	<div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
		<div class="min-h-8 shrink-0">
			{#await streams.availabilityToday}
				<Skeleton class="h-6 w-28" aria-hidden="true" />
				<span class="sr-only">Today's availability loading</span>
			{:then lane}
				{#if lane}
					<Badge variant={lane.tone === 'good' ? 'success' : 'warning'} title={lane.detail}>
						<span class="size-1.5 rounded-full bg-current" aria-hidden="true"></span>
						{lane.value} today
					</Badge>
				{/if}
			{:catch}
				<span class="text-sm text-muted-foreground">Today's availability unavailable</span>
			{/await}
		</div>
		{#if edit}
			<div class="flex items-center gap-3">
				<span class="text-sm text-muted-foreground" aria-live="polite">{unsavedLabel}</span>
				<Button variant="outline" onclick={edit.cancel} disabled={edit.saving || !edit.ready}>Cancel</Button>
				<Button onclick={edit.save} disabled={edit.saving || edit.changeCount === 0}>
					{edit.saving ? 'Saving...' : 'Save changes'}
				</Button>
			</div>
		{:else}
			<div class="min-w-0 flex-1 basis-80">
				<WorkspaceToolbar ariaLabel="Personnel record" items={toolbarItems} {primary} bare />
			</div>
		{/if}
	</div>
	{#if actions.exportError}
		<Alert.Root variant="destructive">
			<Alert.Description>{actions.exportError}</Alert.Description>
		</Alert.Root>
	{/if}
	<PageShell.Tabs items={tabs} label="Personnel detail sections" />
</header>

{#if actions.confirmingArchive}
	<ConfirmDialog
		title="Archive Personnel"
		message={actions.archiveMessage}
		confirmLabel="Archive"
		variant="default"
		loading={actions.archiving}
		onConfirm={actions.confirmArchive}
		onCancel={() => (actions.confirmingArchive = false)}
	/>
{/if}
