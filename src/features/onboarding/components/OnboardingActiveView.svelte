<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { page } from '$app/state';
	import { replaceState } from '$app/navigation';
	import type { OnboardingPageContext } from '../contexts/OnboardingPageContext.svelte';
	import { MODAL_IDS, STEP_TYPE_LABELS } from '../contexts/OnboardingPageContext.svelte';
	import { groupFilterMatcher } from '$features/personnel/contracts';
	import type { PersonnelOnboarding } from '../onboarding.types';
	import { comparePacketSummaries, summarizePacket, todayIn, waitingBySteps } from '../onboardingStatus';
	import { Button } from '$lib/components/ui/button';
	import * as Alert from '$lib/components/ui/alert';
	import * as Empty from '$lib/components/ui/empty';
	import * as AppDialog from '$lib/components/ui/app-dialog';
	import * as PageShell from '$lib/components/patterns/page-shell';
	import {
		WorkspaceToolbar,
		type ToolbarItem,
		type WorkspaceToolbarProps
	} from '$lib/components/patterns/workspace-toolbar';
	import ShieldAlert from '@lucide/svelte/icons/shield-alert';
	import ClipboardList from '@lucide/svelte/icons/clipboard-list';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import CircleAlert from '@lucide/svelte/icons/circle-alert';
	import SearchX from '@lucide/svelte/icons/search-x';
	import OnboardingPacketRow from './OnboardingPacketRow.svelte';
	import OnboardingPacketPanel from './OnboardingPacketPanel.svelte';
	import OnboardingMatrixView from './OnboardingMatrixView.svelte';
	import { NoteDraft } from './noteDraft.svelte';

	interface Props {
		ctx: OnboardingPageContext;
		typicalDaysToFinish: number | null;
	}

	let { ctx, typicalDaysToFinish }: Props = $props();

	const ALL_GROUPS = 'all';
	type View = 'list' | 'matrix';
	const VIEW_OPTIONS = [
		{ value: 'list', label: 'List' },
		{ value: 'matrix', label: 'Matrix' }
	];
	const STRIP_SIZE = 4;

	const today = todayIn(Intl.DateTimeFormat().resolvedOptions().timeZone, new Date());

	let search = $state('');
	let groupId = $state(ALL_GROUPS);
	// `?packet=<id>` opens that packet, as a link from the Dashboard; an id no longer in processing selects nothing.
	let selectedId = $state<string | null>(page.url.searchParams.get('packet'));
	let view = $state<View>('list');

	const active = $derived(ctx.filteredOnboardings);
	const stalledTotal = $derived(
		active.filter((onboarding) => summarizePacket(onboarding, today).status === 'stalled').length
	);

	const inGroup = $derived(groupFilterMatcher(ctx.groupTree, groupId));

	function matches(onboarding: PersonnelOnboarding): boolean {
		const person = ctx.getPerson(onboarding.personnelId);
		if (!inGroup(person?.groupId ?? null)) return false;
		const query = search.trim().toLowerCase();
		if (!query) return true;
		return [ctx.getPersonName(onboarding.personnelId), person?.rank, person?.mos].some((field) =>
			field?.toLowerCase().includes(query)
		);
	}

	const visible = $derived(active.filter(matches));
	const summaries = $derived(
		visible.map((onboarding) => summarizePacket(onboarding, today)).sort(comparePacketSummaries)
	);
	const allWaiting = $derived(waitingBySteps(visible, today));
	const waiting = $derived(allWaiting.slice(0, STRIP_SIZE));

	const subtitleParts = $derived.by(() => {
		const parts: { text: string; stalled?: boolean }[] = [];
		if (active.length > 0)
			parts.push({ text: `${active.length} ${active.length === 1 ? 'Soldier' : 'Soldiers'} in processing` });
		if (stalledTotal > 0) parts.push({ text: `${stalledTotal} stalled`, stalled: true });
		if (typicalDaysToFinish !== null)
			parts.push({ text: `Typically ${Math.round(typicalDaysToFinish)} days to finish` });
		return parts;
	});

	const selected = $derived(
		selectedId
			? (ctx.onboardings.find(
					(o) =>
						o.id === selectedId &&
						(o.status === 'in_progress' || ctx.completingId === o.id || ctx.cancellingId === o.id)
				) ?? null)
			: null
	);

	// The param is dropped once read, so a reload does not reopen a packet the viewer closed.
	onMount(() => {
		if (!page.url.searchParams.has('packet')) return;
		const url = new URL(page.url.href);
		url.searchParams.delete('packet');
		replaceState(url, page.state);
	});

	function personMeta(onboarding: PersonnelOnboarding): string {
		return [ctx.getPersonGroupName(onboarding.personnelId), ctx.getPerson(onboarding.personnelId)?.mos]
			.filter(Boolean)
			.join(' · ');
	}

	// One draft per opened packet: a note typed in one packet never carries into another.
	const noteDraft = $derived(selectedId ? new NoteDraft() : null);
	const busy = $derived(noteDraft?.saving ?? false);
	// A draft on a step that has since completed has no editor left, so it must not trap the sheet.
	const closeBlocked = $derived(
		!!noteDraft?.dirty &&
			!!selected?.steps.some((step) => step.id === noteDraft.stepId && step.active && !step.completed)
	);

	async function closePanel() {
		const id = selectedId;
		selectedId = null;
		await tick();
		if (id && selectedId === null)
			document.querySelector<HTMLElement>(`[data-onboarding-id="${CSS.escape(id)}"]`)?.focus();
	}

	function clearFilters() {
		search = '';
		groupId = ALL_GROUPS;
	}

	const toolbarItems = $derived.by<ToolbarItem[]>(() => {
		const items: ToolbarItem[] = [
			{
				kind: 'view',
				id: 'view',
				label: 'Onboarding view',
				options: VIEW_OPTIONS,
				value: view,
				onValueChange: (value) => {
					if (value === 'list' || value === 'matrix') view = value;
				}
			}
		];
		if (ctx.groups.length > 0) {
			items.push({
				kind: 'select',
				id: 'group',
				label: 'Group',
				options: [
					{ value: ALL_GROUPS, label: 'All groups' },
					...ctx.groupTree.roots.map((group) => ({ value: group.id, label: group.name }))
				],
				value: groupId,
				defaultValue: ALL_GROUPS,
				onValueChange: (value) => {
					groupId = value;
				}
			});
		}
		items.push({ kind: 'action', id: 'history', label: 'History', href: ctx.historyUrl });
		if (ctx.canManageConfig)
			items.push({ kind: 'action', id: 'templates', label: 'Templates', href: ctx.templatesUrl });
		return items;
	});

	const toolbarSearch = $derived({
		label: 'Search by name, rank, or MOS',
		placeholder: 'Search name, rank, MOS...',
		value: search,
		onValueChange: (value: string) => {
			search = value;
		}
	} satisfies NonNullable<WorkspaceToolbarProps['search']>);

	const toolbarPrimary = $derived.by<WorkspaceToolbarProps['primary']>(() =>
		ctx.canManageWorkflows
			? {
					kind: 'action',
					id: 'start-onboarding',
					label: 'Start onboarding',
					icon: 'user-plus',
					onclick: () => ctx.modals.open(MODAL_IDS.startOnboarding),
					disabled: !ctx.hasTemplateSteps,
					disabledReason: ctx.hasTemplateSteps ? undefined : 'Build a template first'
				}
			: undefined
	);
</script>

{#snippet subtitle()}
	{#each subtitleParts as part, index (part.text)}
		{#if index > 0}&nbsp;&middot;&nbsp;{/if}
		{#if part.stalled}<span class="text-warning-foreground">{part.text}</span>{:else}{part.text}{/if}
	{/each}
{/snippet}

<div class="flex h-full min-h-0 flex-col bg-background">
	{#if !ctx.canViewOnboarding}
		<div class="flex min-h-0 flex-1 overflow-auto p-3 sm:p-6">
			<Empty.Root>
				<Empty.Media variant="icon"><ShieldAlert /></Empty.Media>
				<Empty.Header>
					<Empty.Title>Access Restricted</Empty.Title>
					<Empty.Description>
						You don't have permission to view this area. Contact your organization admin for access.
					</Empty.Description>
				</Empty.Header>
			</Empty.Root>
		</div>
	{:else}
		<div class="grid shrink-0 gap-4 border-b border-border p-3 md:px-6 md:pt-6 md:pb-4">
			<PageShell.Header title="Onboarding" subtitle={subtitleParts.length > 0 ? subtitle : undefined} />
			<WorkspaceToolbar
				ariaLabel="Onboarding controls"
				items={toolbarItems}
				search={toolbarSearch}
				primary={toolbarPrimary}
			/>
		</div>

		<div class="grid min-h-0 min-w-0 flex-1 content-start gap-6 overflow-y-auto p-3 md:p-6">
			{#if !ctx.hasTemplateSteps && ctx.onboardings.length > 0}
				<Alert.Root variant="warning">
					<TriangleAlert />
					<Alert.Title>Configuration Required</Alert.Title>
					<Alert.Description>
						No template steps are defined, so new onboardings cannot be started until a template is built.
					</Alert.Description>
					{#if ctx.canManageWorkflows}
						<Alert.Action>
							<Button href={ctx.templatesUrl} size="sm" variant="outline">Manage Templates</Button>
						</Alert.Action>
					{/if}
				</Alert.Root>
			{/if}

			{#each ctx.resyncErrors as { onboardingId, error } (onboardingId)}
				<Alert.Root variant="destructive">
					<CircleAlert />
					<Alert.Title>Sync Problem</Alert.Title>
					<Alert.Description>{error}</Alert.Description>
					<Alert.Action>
						<Button size="sm" variant="outline" onclick={() => ctx.dismissResyncError(onboardingId)}>Dismiss</Button>
					</Alert.Action>
				</Alert.Root>
			{/each}

			{#if active.length === 0}
				{#if !ctx.hasTemplateSteps && ctx.onboardings.length === 0}
					{#if ctx.canManageWorkflows}
						<Empty.Root>
							<Empty.Media variant="icon"><ClipboardList /></Empty.Media>
							<Empty.Header>
								<Empty.Title>Set up onboarding</Empty.Title>
								<Empty.Description>
									Set up your onboarding template to get started. Define the requirements new members need to complete.
								</Empty.Description>
							</Empty.Header>
							<Empty.Content>
								<Button href={ctx.templatesUrl}>Set Up Template</Button>
							</Empty.Content>
						</Empty.Root>
					{:else}
						<Empty.Root>
							<Empty.Media variant="icon"><ClipboardList /></Empty.Media>
							<Empty.Header>
								<Empty.Title>Onboarding not configured</Empty.Title>
								<Empty.Description>Onboarding has not been configured yet.</Empty.Description>
							</Empty.Header>
						</Empty.Root>
					{/if}
				{:else}
					<Empty.Root>
						<Empty.Media variant="icon"><ClipboardList /></Empty.Media>
						<Empty.Header>
							<Empty.Title>No active onboardings</Empty.Title>
							<Empty.Description>No active onboardings. Start one to begin tracking a new member.</Empty.Description>
						</Empty.Header>
					</Empty.Root>
				{/if}
			{:else if summaries.length === 0}
				<Empty.Root>
					<Empty.Media variant="icon"><SearchX /></Empty.Media>
					<Empty.Header>
						<Empty.Title>No Soldiers match</Empty.Title>
						<Empty.Description>No one in processing matches this search and group.</Empty.Description>
					</Empty.Header>
					<Empty.Content>
						<Button variant="outline" onclick={clearFilters}>Clear filters</Button>
					</Empty.Content>
				</Empty.Root>
			{:else if view === 'matrix'}
				<OnboardingMatrixView {ctx} packets={visible} {today} />
			{:else}
				<section class="grid gap-3" aria-labelledby="onboarding-waiting-title">
					<div class="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b-2 border-foreground pb-2">
						<h2 id="onboarding-waiting-title" class="font-heading text-xl font-semibold">Where people are waiting</h2>
						<p class="font-mono text-xs text-muted-foreground">Soldiers on each open step</p>
						<Button variant="link" size="none" class="ml-auto h-auto p-0 text-sm" onclick={() => (view = 'matrix')}>
							All {allWaiting.length} steps
						</Button>
					</div>
					<ul class="grid grid-cols-2 gap-px md:grid-cols-4">
						{#each waiting as step (step.stepName)}
							<li class="grid content-start gap-1 border-l border-border px-3 py-1 first:border-l-0 first:pl-0">
								<span class={['font-heading text-4xl font-semibold', step.stalled > 0 && 'text-warning-foreground']}>
									{step.open}
								</span>
								<span class="text-sm font-semibold">{step.stepName}</span>
								{#if step.stalled > 0}
									<span class="font-mono text-xs text-warning-foreground">{step.stalled} stalled</span>
								{:else}
									<span class="font-mono text-xs text-muted-foreground">{STEP_TYPE_LABELS[step.stepType]}</span>
								{/if}
							</li>
						{/each}
					</ul>
				</section>

				<section class="grid gap-3" aria-labelledby="onboarding-list-title">
					<div class="flex items-baseline gap-3">
						<h2 id="onboarding-list-title" class="font-heading text-xl font-semibold">In processing</h2>
						<p class="font-mono text-xs text-muted-foreground">{summaries.length} · stalled first</p>
					</div>
					<ul class="grid overflow-hidden rounded-lg border border-border bg-card" aria-label="Soldiers in processing">
						{#each summaries as summary (summary.packet.id)}
							<li class="grid border-b border-border last:border-b-0">
								<OnboardingPacketRow
									{summary}
									name={ctx.getPersonName(summary.packet.personnelId)}
									meta={personMeta(summary.packet)}
									selected={selectedId === summary.packet.id}
									onSelect={() => (selectedId = summary.packet.id)}
								/>
							</li>
						{/each}
					</ul>
				</section>
			{/if}
		</div>

		{#if selected && noteDraft}
			<AppDialog.Root open {busy} {closeBlocked} onClose={closePanel}>
				<AppDialog.Content presentation="sheet" class="p-0" showCloseButton={false}>
					<AppDialog.Description class="sr-only">Onboarding packet</AppDialog.Description>
					{#key selected.id}
						<OnboardingPacketPanel
							{ctx}
							onboarding={selected}
							{today}
							draft={noteDraft}
							onClose={busy || closeBlocked ? undefined : closePanel}
						/>
					{/key}
				</AppDialog.Content>
			</AppDialog.Root>
		{/if}
	{/if}
</div>
