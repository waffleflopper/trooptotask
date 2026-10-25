<script lang="ts">
	import { afterNavigate, beforeNavigate } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/stores';
	import AdminSearch from '$features/platform-admin/components/AdminSearch.svelte';
	import { ADMIN_SECTIONS, isAdminSectionActive, type AdminSection } from '$features/platform-admin/sections';
	import { BrandWordmark } from '$lib/components/patterns/brand-wordmark';
	import * as Breadcrumb from '$lib/components/ui/breadcrumb';
	import { cn } from '$lib/utils';
	import { MediaQuery } from 'svelte/reactivity';

	let { children, data } = $props();

	const isActive = (section: AdminSection) => isAdminSectionActive(section, $page.url.pathname);
	const currentSection = $derived(ADMIN_SECTIONS.find(isActive));
	const leafLabel = $derived(
		typeof $page.data?.breadcrumbLabel === 'string' ? ($page.data.breadcrumbLabel as string) : undefined
	);

	let openCount = $state<number | null>(null);
	$effect(() => {
		const pending = data.inboxOpenCount;
		let current = true;
		void pending?.then((count) => {
			if (current) openCount = count;
		});
		return () => {
			current = false;
		};
	});

	// One search field at a time: the top bar holds it from 640 px up, the Menu below that.
	const phone = new MediaQuery('max-width: 639.98px', false);

	let menuOpen = $state(false);
	let menuButton = $state<HTMLButtonElement | null>(null);
	// A link chosen in the menu closes it; focus returns to the Menu button rather than the top of the document.
	let returnFocusToMenu = false;
	beforeNavigate(({ type }) => {
		returnFocusToMenu = menuOpen && type === 'link';
		menuOpen = false;
	});
	afterNavigate(() => {
		if (!returnFocusToMenu) return;
		returnFocusToMenu = false;
		menuButton?.focus();
	});

	function closeMenuOnEscape(event: KeyboardEvent) {
		if (event.key !== 'Escape' || !menuOpen) return;
		menuOpen = false;
		menuButton?.focus();
	}
</script>

<svelte:window onkeydown={closeMenuOnEscape} />

{#snippet nav()}
	<nav aria-label="Platform admin">
		<ul class="grid gap-0.5">
			{#each ADMIN_SECTIONS as section (section.key)}
				{@const active = isActive(section)}
				<li>
					<a
						href={resolve(section.href as '/')}
						aria-current={active ? 'page' : undefined}
						class={cn(
							'flex min-h-8 items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors',
							'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
							active
								? 'bg-chrome-surface-muted font-semibold text-chrome-text'
								: 'text-chrome-text-muted hover:bg-chrome-hover hover:text-chrome-text'
						)}
					>
						<span>{section.label}</span>
						{#if section.key === 'inbox' && openCount}
							<span
								class="rounded-full bg-chrome-accent px-[7px] py-px font-mono text-[11px] leading-[14px] font-semibold text-chrome tabular-nums"
							>
								{openCount}<span class="sr-only"> open</span>
							</span>
						{/if}
					</a>
				</li>
			{/each}
		</ul>
	</nav>
{/snippet}

{#snippet operator()}
	<div class="grid gap-2.5 border-t border-chrome-border px-2 pt-3">
		<div class="grid min-w-0 gap-0.5">
			<span class="truncate text-sm font-semibold text-chrome-text">{data.adminEmail ?? 'Operator'}</span>
			<span class="font-mono text-[11px] tracking-[0.04em] text-chrome-text-muted">Operator · MFA on</span>
		</div>
		<a
			href={resolve('/dashboard')}
			class="w-fit rounded-sm text-sm text-chrome-text-muted transition-colors hover:text-chrome-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
		>
			<span aria-hidden="true">←</span> Back to the app
		</a>
	</div>
{/snippet}

<div class="flex h-svh min-h-0 flex-col bg-chrome font-body text-foreground lg:flex-row lg:p-2 lg:pl-0">
	<aside class="hidden w-[220px] shrink-0 flex-col gap-6 px-3 py-5 text-chrome-text lg:flex">
		<BrandWordmark variant="platform" class="px-2" />
		{@render nav()}
		<div class="flex-1"></div>
		{@render operator()}
	</aside>

	<header class="shrink-0 bg-chrome text-chrome-text lg:hidden">
		<div class="flex items-center gap-3 px-4 py-3.5">
			<BrandWordmark variant="platform" />
			<button
				bind:this={menuButton}
				type="button"
				class="ml-auto h-8 rounded-lg border border-chrome-border-subtle px-3 text-sm font-medium text-chrome-text transition-colors hover:bg-chrome-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
				aria-expanded={menuOpen}
				aria-controls="admin-menu"
				onclick={() => (menuOpen = !menuOpen)}
			>
				Menu
			</button>
		</div>
		{#if menuOpen}
			<div id="admin-menu" class="grid gap-5 border-t border-chrome-border px-3 pt-3 pb-4">
				{@render nav()}
				{#if phone.current}<div class="rounded-lg bg-background text-foreground"><AdminSearch /></div>{/if}
				{@render operator()}
			</div>
		{/if}
	</header>

	<div class="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background lg:rounded-md">
		<div class="flex h-14 shrink-0 items-center gap-3 border-b border-border px-4 max-sm:hidden">
			<Breadcrumb.Root class="min-w-0 flex-1" aria-label="Current section">
				<Breadcrumb.List class="flex-nowrap overflow-hidden">
					<Breadcrumb.Item>
						{#if currentSection}
							<Breadcrumb.Link href={resolve('/admin')}>Platform</Breadcrumb.Link>
						{:else}
							<Breadcrumb.Page>Platform</Breadcrumb.Page>
						{/if}
					</Breadcrumb.Item>
					{#if currentSection}
						<Breadcrumb.Separator />
						<Breadcrumb.Item class="min-w-0">
							{#if leafLabel}
								<Breadcrumb.Link href={resolve(currentSection.href as '/')} class="truncate">
									{currentSection.label}
								</Breadcrumb.Link>
							{:else}
								<Breadcrumb.Page class="truncate">{currentSection.label}</Breadcrumb.Page>
							{/if}
						</Breadcrumb.Item>
					{/if}
					{#if leafLabel}
						<Breadcrumb.Separator />
						<Breadcrumb.Item class="min-w-0">
							<Breadcrumb.Page class="truncate">{leafLabel}</Breadcrumb.Page>
						</Breadcrumb.Item>
					{/if}
				</Breadcrumb.List>
			</Breadcrumb.Root>
			{#if !phone.current}<div class="w-80 shrink-0 max-md:w-64"><AdminSearch /></div>{/if}
		</div>
		<main id="main-content" tabindex="-1" class="min-h-0 w-full min-w-0 flex-1 overflow-y-auto outline-none">
			{@render children()}
		</main>
	</div>
</div>
