<script lang="ts">
	import { onMount, tick, untrack } from 'svelte';
	import { afterNavigate } from '$app/navigation';
	import { resolve } from '$app/paths';
	import ArrowRight from '@lucide/svelte/icons/arrow-right';
	import Check from '@lucide/svelte/icons/check';
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import Lock from '@lucide/svelte/icons/lock';
	import Search from '@lucide/svelte/icons/search';
	import X from '@lucide/svelte/icons/x';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { toastStore } from '$lib/stores/toast.svelte';
	import {
		HELP_AREA_LABELS,
		accessGap,
		guidesForRoute,
		helpLocation,
		helpPagePath,
		isGuideAvailable,
		isStepAvailable,
		isStepHere,
		searchGuides,
		stepHref,
		type HelpArea,
		type HelpPageUrl,
		type HelpGuide,
		type HelpRouteKey,
		type HelpViewer
	} from './contracts';
	import { highlightSegments, markupSegments } from './text';

	interface Props {
		guides: readonly HelpGuide[];
		viewer: HelpViewer;
		/** The current page's key, or null when the page is not an Organization page. */
		routeKey: HelpRouteKey | null;
		orgUrlSegment: string;
		/** The visible URL, which Help adds its param to. */
		url: HelpPageUrl;
		/** The guide to show, or null for the list. An id that names no available guide shows the list. */
		guideId: string | null;
		onOpenGuide: (id: string) => void;
		onShowList: () => void;
		onClose: () => void;
		onFeedback: () => void;
	}

	let { guides, viewer, routeKey, orgUrlSegment, url, guideId, onOpenGuide, onShowList, onClose, onFeedback }: Props =
		$props();

	let panel: HTMLElement | undefined;
	let scroller: HTMLElement | undefined;
	let heading = $state<HTMLElement>();
	let allGuidesSection = $state<HTMLElement>();
	let query = $state('');
	let browsingAll = $state(false);

	const available = $derived(guides.filter((guide) => isGuideAvailable(guide, viewer)));
	const guide = $derived(guideId ? available.find((candidate) => candidate.id === guideId) : undefined);
	const nextGuide = $derived(guide?.next ? available.find((candidate) => candidate.id === guide.next) : undefined);
	const pagePath = $derived(helpPagePath(orgUrlSegment, url.pathname));
	const onPage = $derived(routeKey === null ? [] : guidesForRoute(available, routeKey, pagePath));
	const missed = $derived(
		available.filter((candidate) => candidate.missed && !onPage.some((entry) => entry.id === candidate.id))
	);
	const results = $derived(query.trim() ? searchGuides(available, query) : null);
	const byArea = $derived(
		(Object.keys(HELP_AREA_LABELS) as HelpArea[])
			.map((area) => ({ area, guides: available.filter((candidate) => candidate.area === area) }))
			.filter((group) => group.guides.length)
	);
	const guideGap = $derived(guide && accessGap(guide.access, viewer));
	const steps = $derived(guide ? guide.steps.filter((step) => isStepAvailable(step, viewer)) : []);

	function isPlainClick(event: MouseEvent) {
		return !(
			event.defaultPrevented ||
			event.button !== 0 ||
			event.metaKey ||
			event.ctrlKey ||
			event.shiftKey ||
			event.altKey
		);
	}

	/** A plain click stays inside Help's history; a modified click keeps the link's own behavior. */
	function follow(event: MouseEvent, id: string) {
		if (!isPlainClick(event)) return;
		event.preventDefault();
		onOpenGuide(id);
	}

	/** A "Go there" click moves to another page; SvelteKit then drops focus on the body, so Help takes it back. */
	let leavingFromStep = false;
	afterNavigate(() => {
		const lost = !document.activeElement || document.activeElement === document.body;
		if (leavingFromStep && lost) heading?.focus();
		leavingFromStep = false;
	});

	function guideHref(id: string) {
		return resolve(helpLocation(url, id) as '/');
	}

	async function toggleAll() {
		browsingAll = !browsingAll;
		if (!browsingAll) return;
		await tick();
		allGuidesSection?.scrollIntoView?.({ block: 'start' });
	}

	async function copyLink() {
		if (!guide) return;
		const link = new URL(helpLocation(url, guide.id), url.origin).href;
		try {
			await navigator.clipboard.writeText(link);
			toastStore.success('Link copied');
		} catch {
			toastStore.error('Could not copy the link. Copy it from the address bar instead.');
		}
	}

	/** Escape closes Help only while focus is inside it, so it never takes an Escape meant for a menu or dialog. */
	function onKeydown(event: KeyboardEvent) {
		if (event.key !== 'Escape' || event.defaultPrevented || !panel?.contains(document.activeElement)) return;
		event.preventDefault();
		onClose();
	}

	onMount(() => {
		// A page loaded on `?help` opens with focus on the body, which is no place to return to.
		const active = document.activeElement;
		const opener = active instanceof HTMLElement && active !== document.body ? active : null;
		panel?.focus();
		return () => {
			const current = document.activeElement;
			if (current && current !== document.body && !panel?.contains(current)) return;
			const target = opener?.isConnected ? opener : document.querySelector<HTMLElement>('[data-help-trigger]');
			target?.focus();
		};
	});

	let shownGuide = untrack(() => guide?.id);
	$effect(() => {
		const id = guide?.id;
		if (id === shownGuide) return;
		shownGuide = id;
		if (scroller) scroller.scrollTop = 0;
		void tick().then(() => heading?.focus());
	});
</script>

{#snippet highlighted(text: string)}
	{#each highlightSegments(text, query) as segment, index (index)}
		{#if segment.bold}<strong class="font-extrabold">{segment.text}</strong>{:else}{segment.text}{/if}
	{/each}
{/snippet}

{#snippet row(entry: HelpGuide, options: { featured?: boolean; area?: boolean; searching?: boolean })}
	<a
		href={guideHref(entry.id)}
		onclick={(event) => follow(event, entry.id)}
		class={[
			'flex items-start gap-3 border-b border-border px-6 py-3 transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring',
			options.featured && 'border-l-[3px] border-l-accent bg-accent/10 pl-[21px] hover:bg-accent/15'
		]}
	>
		{#if options.area}
			<span
				class="w-24 shrink-0 pt-1 font-mono text-[11px] leading-4 tracking-[0.08em] text-muted-foreground uppercase"
			>
				{HELP_AREA_LABELS[entry.area]}
			</span>
		{/if}
		<span class="grid min-w-0 flex-1 gap-0.5">
			<span class={['text-base leading-snug text-foreground', options.searching ? 'font-normal' : 'font-semibold']}>
				{@render highlighted(entry.title)}
			</span>
			{#if !options.area}
				<span class="text-sm leading-snug text-muted-foreground">{entry.summary}</span>
			{/if}
		</span>
		<ChevronRight class="mt-1 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
	</a>
{/snippet}

{#snippet section(label: string, aside?: string)}
	<div class="flex items-baseline justify-between gap-3 border-b-2 border-foreground px-0 pb-1.5">
		<h3 class="font-mono text-[11px] font-semibold tracking-[0.08em] text-foreground uppercase">{label}</h3>
		{#if aside}<span class="font-mono text-[11px] tracking-[0.08em] text-muted-foreground uppercase">{aside}</span>{/if}
	</div>
{/snippet}

<svelte:window onkeydown={onKeydown} />

<aside
	bind:this={panel}
	aria-label="Help"
	tabindex="-1"
	data-print-chrome
	class="fixed right-0 bottom-0 top-[calc(var(--banner-height,0px)+3.5rem)] md:top-[calc(var(--banner-height,0px)+4rem)] md:right-2 md:bottom-2 md:overflow-hidden md:rounded-br-md z-sheet flex w-full flex-col border-l border-border bg-background shadow-xl outline-none sm:w-[440px]"
>
	<header class="shrink-0 border-b border-chrome-border bg-chrome px-6 pt-4 pb-5 text-chrome-text">
		<div class="flex items-start justify-between gap-3">
			<div class="min-w-0">
				{#if guide}
					<button
						type="button"
						onclick={onShowList}
						class="-ml-1 inline-flex items-center gap-1 rounded-sm py-0.5 pr-1 font-heading text-xs font-semibold tracking-[0.14em] text-chrome-accent uppercase focus-visible:outline-2 focus-visible:outline-chrome-accent"
					>
						<ChevronLeft class="size-3.5" aria-hidden="true" />
						Help · {HELP_AREA_LABELS[guide.area]}
					</button>
				{:else}
					<p class="font-heading text-xs font-semibold tracking-[0.14em] text-chrome-accent uppercase">Help</p>
				{/if}
				<h2
					bind:this={heading}
					tabindex="-1"
					class="mt-1 font-heading text-[32px] leading-[1.05] font-extrabold tracking-[-0.01em] uppercase outline-none"
				>
					{guide ? guide.title : 'How do I…'}
				</h2>
			</div>
			<Button
				variant="ghost"
				size="icon-sm"
				aria-label="Close help"
				onclick={onClose}
				class="shrink-0 text-chrome-text hover:bg-chrome-hover hover:text-chrome-text"
			>
				<X />
			</Button>
		</div>
		{#if !guide}
			<div class="relative mt-4">
				<Search
					class="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-chrome-text-muted"
					aria-hidden="true"
				/>
				<Input
					type="search"
					bind:value={query}
					aria-label="Search guides"
					placeholder="Search guides, e.g. DA 6 or CQ"
					autocomplete="off"
					class="h-10 border-chrome-border bg-chrome-surface pl-8 text-chrome-text placeholder:text-chrome-text-muted dark:bg-chrome-surface"
				/>
			</div>
		{/if}
	</header>

	<div bind:this={scroller} data-help-scroller class="min-h-0 flex-1 overflow-y-auto">
		{#if guide}
			<article>
				<p class="mx-6 mt-5 border-b border-foreground pb-5 text-base leading-relaxed">{guide.lead}</p>
				<ol class="mx-6 list-none p-0">
					{#each steps as step, index (index)}
						{@const here =
							step.to !== undefined && isStepHere(step.to, { routeKey, path: pagePath, params: url.searchParams })}
						{@const href = step.to === undefined ? null : stepHref(orgUrlSegment, step.to, guide.id)}
						{@const gap = accessGap(step.access, viewer)}
						<li class="grid grid-cols-[2rem_1fr] gap-x-3 border-b border-border py-4">
							<span class="font-heading text-3xl leading-none font-extrabold text-accent">{index + 1}</span>
							<div class="grid gap-2 text-base leading-relaxed">
								<p>
									{#each markupSegments(step.text) as segment, part (part)}
										{#if segment.bold}<strong class="font-bold">{segment.text}</strong>{:else}{segment.text}{/if}
									{/each}
								</p>
								{#if gap}
									<p role="note" class="flex items-start gap-1.5 text-sm leading-snug text-muted-foreground">
										<Lock class="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
										<span>{gap}</span>
									</p>
								{/if}
								{#if here}
									<p
										class="inline-flex items-center gap-1 font-mono text-[11px] tracking-[0.08em] text-success-foreground uppercase"
									>
										<Check class="size-3.5" aria-hidden="true" />
										You're here
									</p>
								{:else if href}
									<a
										href={resolve(href as '/')}
										onclick={(event) => (leavingFromStep = isPlainClick(event))}
										class="inline-flex w-fit items-center gap-1 text-sm font-medium text-accent-text underline underline-offset-2 hover:no-underline"
									>
										Go there
										<ArrowRight class="size-3.5" aria-hidden="true" />
									</a>
								{/if}
							</div>
						</li>
					{/each}
				</ol>
				<div class="mx-6 mt-5 grid gap-3">
					{#if guide.note}
						<p class="rounded-md border border-accent/30 bg-accent/10 p-3 text-sm leading-relaxed">{guide.note}</p>
					{/if}
					{#if guideGap}
						<p role="note" class="flex items-start gap-2 rounded-md bg-muted p-3 text-sm leading-relaxed">
							<Lock class="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
							<span>{guideGap} Don't see the button? Ask a unit admin.</span>
						</p>
					{/if}
				</div>
				{#if nextGuide}
					<div class="mx-6 mt-6 mb-6">
						<p class="font-mono text-[11px] tracking-[0.08em] text-muted-foreground uppercase">Next</p>
						<a
							href={guideHref(nextGuide.id)}
							onclick={(event) => follow(event, nextGuide.id)}
							class="flex items-center justify-between gap-3 border-b border-border py-2 text-base font-medium hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
						>
							<span>Next: {nextGuide.title}</span>
							<ChevronRight class="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
						</a>
					</div>
				{:else}
					<div class="h-6"></div>
				{/if}
			</article>
		{:else if results}
			<div class="px-6 pt-4 pb-2">
				<p role="status" class="font-mono text-[11px] tracking-[0.08em] text-muted-foreground uppercase">
					{results.length}
					{results.length === 1 ? 'guide' : 'guides'} match
				</p>
			</div>
			{#if results.length}
				<div class="border-t border-border">
					{#each results as entry (entry.id)}
						{@render row(entry, { area: true, searching: true })}
					{/each}
				</div>
			{:else}
				<p class="px-6 py-4 text-sm text-muted-foreground">
					Nothing matches that. Try a shorter word, or
					<button type="button" class="underline underline-offset-2" onclick={onFeedback}>ask us</button>.
				</p>
			{/if}
		{:else}
			<section aria-label="On this page">
				<div class="px-6 pt-5">{@render section('On this page')}</div>
				{#each onPage as entry, index (entry.id)}
					{@render row(entry, { featured: index === 0 })}
				{:else}
					<p class="px-6 py-3 text-sm text-muted-foreground">No guides for this page yet.</p>
				{/each}
			</section>
			{#if missed.length}
				<section aria-label="Things people miss">
					<div class="px-6 pt-6">{@render section('Things people miss')}</div>
					{#each missed as entry (entry.id)}
						{@render row(entry, { area: true })}
					{/each}
				</section>
			{/if}
			{#if browsingAll}
				<section bind:this={allGuidesSection} class="pt-4" aria-label="All guides">
					{#each byArea as group (group.area)}
						<div class="px-6 pt-4">{@render section(HELP_AREA_LABELS[group.area])}</div>
						{#each group.guides as entry (entry.id)}
							{@render row(entry, {})}
						{/each}
					{/each}
				</section>
			{/if}
			<div class="h-4"></div>
		{/if}
	</div>

	<footer
		class="flex shrink-0 items-center justify-between gap-3 border-t border-border bg-background px-6 py-3 text-sm text-muted-foreground"
	>
		{#if guide}
			<Button variant="link" size="none" class="text-foreground underline" onclick={copyLink}>
				Copy link to this guide
			</Button>
			<span>
				Was this clear?
				<Button variant="link" size="none" class="text-foreground underline" onclick={onFeedback}>Tell us</Button>
			</span>
		{:else}
			{#if available.length}
				<Button
					variant="link"
					size="none"
					class="text-foreground underline"
					aria-expanded={browsingAll}
					onclick={toggleAll}
				>
					{browsingAll
						? 'Hide all guides'
						: `Browse all ${available.length} ${available.length === 1 ? 'guide' : 'guides'}`}
				</Button>
			{:else}
				<span></span>
			{/if}
			<span>
				Not here?
				<Button variant="link" size="none" class="text-foreground underline" onclick={onFeedback}>Ask us</Button>
			</span>
		{/if}
	</footer>
</aside>
