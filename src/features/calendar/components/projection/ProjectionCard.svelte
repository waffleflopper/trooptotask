<script lang="ts">
	import type { Snippet } from 'svelte';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import { eventDateRange } from '$features/calendar/events/eventModel';
	import type { CardStatusAction, EventCard, TaskingCard } from '$features/calendar/projection/projectionCardModel';
	import type { ProjectionCardRequest, ProjectionTarget } from '$features/calendar/projection/projectionCards';
	import { ATTENTION_BADGES, STATUS_BADGES } from '$features/calendar/taskings/components/taskingLabels';
	import { IsMobile } from '$lib/hooks/is-mobile.svelte';
	import { formatDayMonthYear } from '$lib/utils/dates';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import * as Popover from '$lib/components/ui/popover';

	interface Props {
		request: ProjectionCardRequest;
		anchor: HTMLElement;
		today: string;
		/** The card for a target from the latest read, or null once the read no longer holds it. */
		cardFor: (target: ProjectionTarget) => EventCard | TaskingCard | null;
		groupName: (groupId: string) => string;
		personName: (personnelId: string) => string;
		canAddTasking: boolean;
		canManage: (card: TaskingCard) => boolean;
		/** Resolves once the change is saved and the Calendar has read it, or with why it did not land. */
		onStatus: (card: TaskingCard, action: CardStatusAction) => Promise<'done' | 'failed' | 'abandoned'>;
		onAssign: (card: TaskingCard) => void;
		onClose: () => void;
	}

	let {
		request,
		anchor,
		today,
		cardFor,
		groupName,
		personName,
		canAddTasking,
		canManage,
		onStatus,
		onAssign,
		onClose
	}: Props = $props();

	const ACTION_LABELS: Record<CardStatusAction, string> = {
		start: 'Start',
		complete: 'Mark done',
		unblock: 'Unblock'
	};

	const isMobile = new IsMobile();
	// A list opens on its choices; choosing one shows its card in the same place.
	let chosen = $state.raw<ProjectionTarget | null>(null);
	const target = $derived(request.kind === 'one' ? request.target : chosen);
	const card = $derived(target ? cardFor(target) : null);
	let lastTitle = $state('');
	let busy = $state<CardStatusAction | null>(null);
	let notice = $state('');
	let failure = $state('');
	let content = $state<HTMLElement | null>(null);
	let alive = true;

	$effect(() => () => (alive = false));

	const heading = $derived(
		card?.title ?? (request.kind === 'list' && !chosen ? request.heading : lastTitle || 'No longer on the Calendar')
	);

	async function runStatus(current: TaskingCard) {
		if (busy) return;
		busy = current.next;
		// Completing a Tasking drops it from the read, so the card keeps its title to say what was saved.
		lastTitle = current.title;
		failure = '';
		notice = '';
		const outcome = await onStatus(current, current.next);
		// The card may have closed or moved on to another target while the change was saved.
		if (!alive || target?.kind !== 'tasking' || target.id !== current.id) return;
		busy = null;
		if (outcome === 'failed') failure = 'The status did not change. Try again.';
		else if (outcome === 'done') notice = `${ACTION_LABELS[current.next]} saved.`;
	}

	function focusContent(event: Event) {
		event.preventDefault();
		content?.focus();
	}

	function returnFocus(event: Event) {
		event.preventDefault();
		if (anchor.isConnected) anchor.focus();
	}

	function peopleLabel(current: TaskingCard): string {
		return current.required === null ? `${current.picked} picked` : `${current.picked} of ${current.required}`;
	}
</script>

{#snippet eyebrow(text: string)}
	<p class="font-mono text-[10px] font-semibold tracking-widest text-muted-foreground uppercase">{text}</p>
{/snippet}

{#snippet fact(label: string, body: Snippet)}
	<div class="grid grid-cols-[5.5rem_minmax(0,1fr)] items-baseline gap-2">
		<dt class="font-mono text-[10px] font-semibold tracking-widest text-muted-foreground uppercase">{label}</dt>
		<dd class="m-0 min-w-0 text-[13px] leading-snug">{@render body()}</dd>
	</div>
{/snippet}

{#snippet conflictNote(text: string)}
	<span class="mt-0.5 flex items-center gap-1 text-[12px] text-accent-text">
		<TriangleAlert class="size-3 shrink-0" aria-hidden="true" />
		{text}
	</span>
{/snippet}

<Popover.Root open onOpenChange={(open) => !open && onClose()}>
	<Popover.Content
		bind:ref={content}
		customAnchor={anchor}
		side="bottom"
		align={isMobile.current ? 'center' : 'start'}
		sideOffset={6}
		collisionPadding={8}
		class="max-h-(--bits-popover-content-available-height) w-80 max-w-(--bits-popover-content-available-width) gap-0 overflow-y-auto p-0"
		role="dialog"
		aria-label={heading}
		tabindex={-1}
		onOpenAutoFocus={focusContent}
		onCloseAutoFocus={returnFocus}
		data-slot="projection-card"
	>
		{#if request.kind === 'list' && !chosen}
			<Popover.Header class="gap-1 border-b px-4 pt-3.5 pb-3">
				{@render eyebrow('Choose one')}
				<Popover.Title class="font-body text-base leading-snug font-semibold">{request.heading}</Popover.Title>
			</Popover.Header>
			<ul class="m-0 flex list-none flex-col gap-0.5 p-2">
				{#each request.choices as choice (choice.key)}
					<li>
						<button
							type="button"
							class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
							onclick={() => (chosen = choice.target)}
						>
							<span class="flex min-w-0 flex-1 flex-col">
								<span class="truncate text-sm font-medium">{choice.title}</span>
								<span class="text-xs text-muted-foreground">{choice.detail}</span>
							</span>
							<ChevronRight class="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
						</button>
					</li>
				{/each}
			</ul>
		{:else if card?.kind === 'event'}
			<Popover.Header class="gap-1 border-b px-4 pt-3.5 pb-3">
				{@render eyebrow(card.host === null ? 'Event · We host' : 'Event · Tracked')}
				<Popover.Title class="font-body text-base leading-snug font-semibold">{card.title}</Popover.Title>
				<Popover.Description class="text-[13px] text-muted-foreground">
					{eventDateRange(card)}{card.cancelled ? ' · Cancelled' : ''}
				</Popover.Description>
			</Popover.Header>
			<dl class="m-0 grid gap-2 px-4 py-3">
				{#snippet host()}
					{card.host === null ? 'We are hosting' : card.host}
				{/snippet}
				{@render fact('Host', host)}
				{#snippet taskings()}
					{#if !card.taskings || card.taskings.total === 0}
						<span class="text-muted-foreground">None yet</span>
					{:else}
						<span class="tabular-nums">{card.taskings.total}</span>
						{#if card.taskings.needAction > 0}
							<span class="text-muted-foreground">·</span>
							<span class="text-danger-foreground tabular-nums">{card.taskings.needAction} need action</span>
						{/if}
						{#if card.taskings.conflicts > 0}
							{@render conflictNote(
								`${card.taskings.conflicts} availability conflict${card.taskings.conflicts === 1 ? '' : 's'}`
							)}
						{/if}
					{/if}
				{/snippet}
				{@render fact('Taskings', taskings)}
			</dl>
			<div class="flex flex-wrap gap-2 border-t px-4 py-3">
				<Button size="sm" href={card.href}>Open event</Button>
				{#if canAddTasking && !card.cancelled}
					<Button size="sm" variant="outline" href={card.addTaskingHref}>Add tasking</Button>
				{/if}
			</div>
		{:else if card?.kind === 'tasking'}
			{@const status = STATUS_BADGES[card.status]}
			{@const overdue = card.suspenseOn < today}
			{@const manage = canManage(card)}
			<Popover.Header class="gap-1.5 border-b px-4 pt-3.5 pb-3">
				<span class="flex flex-wrap items-center gap-1.5">
					{@render eyebrow('Tasking')}
					<Badge variant={status.variant}>{status.label}</Badge>
					{#if overdue}
						<Badge variant={ATTENTION_BADGES.overdue.variant}>{ATTENTION_BADGES.overdue.label}</Badge>
					{/if}
				</span>
				<Popover.Title class="font-body text-base leading-snug font-semibold">{card.title}</Popover.Title>
			</Popover.Header>
			<dl class="m-0 grid gap-2 px-4 py-3">
				{#snippet responsible()}
					<Badge variant="outline">
						{card.responsibility.kind === 'group' ? groupName(card.responsibility.groupId) : 'Organization'}
					</Badge>
				{/snippet}
				{@render fact('Responsible', responsible)}
				{#snippet suspense()}
					<span class={overdue ? 'text-danger-foreground' : undefined}>
						{formatDayMonthYear(card.suspenseOn)}
					</span>
				{/snippet}
				{@render fact('Suspense', suspense)}
				{#snippet people()}
					<span class="tabular-nums">{peopleLabel(card)}</span>
					{#if card.conflictingPersonId}
						{@render conflictNote(`${personName(card.conflictingPersonId)} is not available on these dates`)}
					{:else if card.conflicts > 0}
						{@render conflictNote(`${card.conflicts} availability conflict${card.conflicts === 1 ? '' : 's'}`)}
					{/if}
				{/snippet}
				{@render fact('People', people)}
			</dl>
			{#if failure}
				<p role="alert" class="mx-4 mb-2 text-[13px] text-destructive-text">{failure}</p>
			{/if}
			<div class="flex flex-wrap gap-2 border-t px-4 py-3">
				<Button size="sm" variant="outline" href={card.href}>Open tasking</Button>
				{#if manage}
					<Button size="sm" variant="outline" onclick={() => onAssign(card)}>Assign people</Button>
					<Button size="sm" aria-busy={busy !== null || undefined} onclick={() => runStatus(card)}>
						{busy ? 'Saving…' : ACTION_LABELS[card.next]}
					</Button>
				{/if}
			</div>
		{:else}
			<Popover.Header class="gap-1 px-4 py-3.5">
				{@render eyebrow(notice || 'Not on the Calendar')}
				<Popover.Title class="font-body text-base leading-snug font-semibold">{heading}</Popover.Title>
				<Popover.Description class="text-[13px] text-muted-foreground">
					It is no longer active in this view. Open it from Events & Taskings.
				</Popover.Description>
			</Popover.Header>
		{/if}
		<p class="sr-only" role="status">{notice}</p>
	</Popover.Content>
</Popover.Root>
