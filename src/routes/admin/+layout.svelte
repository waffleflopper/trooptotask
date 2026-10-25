<script lang="ts">
	import { afterNavigate, beforeNavigate } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/stores';
	import { Activity, BadgeCheck, Bell, Building2, Inbox, LogOut, Moon, Sun, UsersRound } from '@lucide/svelte';
	import AdminSearch from '$features/platform-admin/components/AdminSearch.svelte';
	import { ADMIN_SECTIONS, isAdminSectionActive, type AdminSection } from '$features/platform-admin/sections';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import { Separator } from '$lib/components/ui/separator';
	import * as Sidebar from '$lib/components/ui/sidebar';
	import { themeStore } from '$lib/stores/theme.svelte';

	let { children, data } = $props();

	const navIconBySection = {
		inbox: Inbox,
		organizations: Building2,
		people: UsersRound,
		activity: Activity,
		announcements: Bell
	} satisfies Record<AdminSection['key'], unknown>;

	const isActive = (section: AdminSection) => isAdminSectionActive(section, $page.url.pathname);

	// The phone sheet closes in the link's own click handler, before beforeNavigate runs, so note the link while it is still in the sheet.
	let phoneLinkHref: string | null = null;
	let returnFocusToSidebarTrigger = false;
	function notePhoneLink(event: MouseEvent) {
		const link = event.currentTarget as HTMLAnchorElement;
		phoneLinkHref = link.closest('[data-sidebar="sidebar"][data-mobile="true"]') ? link.href : null;
	}
	beforeNavigate(({ type, to }) => {
		returnFocusToSidebarTrigger = type === 'link' && phoneLinkHref !== null && to?.url.href === phoneLinkHref;
		phoneLinkHref = null;
	});
	afterNavigate(() => {
		if (!returnFocusToSidebarTrigger) return;
		returnFocusToSidebarTrigger = false;
		document.querySelector<HTMLElement>('[data-sidebar="trigger"]')?.focus();
	});
</script>

<Sidebar.Provider class="h-svh min-h-0 bg-background font-sans">
	<Sidebar.Root collapsible="icon">
		<Sidebar.Header>
			<div class="flex h-12 items-center gap-2 overflow-hidden p-2 text-sm group-data-[collapsible=icon]:p-0">
				<span
					class="flex aspect-square size-8 shrink-0 items-center justify-center rounded-md bg-sidebar-primary text-xs font-semibold text-sidebar-primary-foreground"
					aria-hidden="true"
				>
					TT
				</span>
				<span class="grid flex-1 leading-tight group-data-[collapsible=icon]:sr-only">
					<span class="truncate font-medium">Platform Admin</span>
					<span class="truncate text-xs">Control Room</span>
				</span>
			</div>
		</Sidebar.Header>

		<Sidebar.Content>
			<nav aria-label="Platform admin" class="flex flex-col">
				<Sidebar.Group>
					<Sidebar.GroupContent>
						<Sidebar.Menu>
							{#each ADMIN_SECTIONS as section (section.key)}
								{@const Icon = navIconBySection[section.key]}
								<Sidebar.MenuItem>
									<Sidebar.MenuButton
										isActive={isActive(section)}
										tooltipContent={section.label}
										onclick={notePhoneLink}
									>
										{#snippet child({ props })}
											<a
												{...props}
												href={resolve(section.href as '/')}
												aria-current={isActive(section) ? 'page' : undefined}
											>
												<Icon />
												<span>{section.label}</span>
											</a>
										{/snippet}
									</Sidebar.MenuButton>
								</Sidebar.MenuItem>
							{/each}
						</Sidebar.Menu>
					</Sidebar.GroupContent>
				</Sidebar.Group>
			</nav>
		</Sidebar.Content>

		<Sidebar.Footer>
			<div class="flex h-12 items-center gap-2 overflow-hidden p-2 text-sm group-data-[collapsible=icon]:p-0">
				<span class="flex size-8 shrink-0 items-center justify-center" aria-hidden="true"
					><BadgeCheck class="size-4" /></span
				>
				<span class="grid min-w-0 flex-1 leading-tight group-data-[collapsible=icon]:sr-only">
					<span class="truncate font-medium">{data.adminEmail ?? 'Admin user'}</span>
					<span class="truncate text-xs">Operator</span>
				</span>
			</div>
			<Sidebar.Menu>
				<Sidebar.MenuItem>
					<Sidebar.MenuButton tooltipContent="Exit Admin">
						{#snippet child({ props })}
							<a {...props} href={resolve('/dashboard')}>
								<LogOut />
								<span>Exit Admin</span>
							</a>
						{/snippet}
					</Sidebar.MenuButton>
				</Sidebar.MenuItem>
			</Sidebar.Menu>
		</Sidebar.Footer>
		<Sidebar.Rail />
	</Sidebar.Root>

	<Sidebar.Inset class="min-h-0 overflow-hidden">
		<header
			class="grid shrink-0 grid-cols-[auto_auto_minmax(0,1fr)_auto_auto] items-center gap-x-3 border-b bg-background px-4 md:px-6 lg:grid-cols-[auto_auto_minmax(0,1fr)_minmax(0,32rem)_auto_auto]"
		>
			<Sidebar.Trigger />
			<Separator orientation="vertical" class="h-5" />
			<div class="grid min-h-14 min-w-0 content-center gap-0.5">
				<p class="truncate text-sm font-medium">Platform Oversight</p>
				<p class="truncate text-xs text-muted-foreground">Internal admin workspace</p>
			</div>
			<div
				class="col-span-full row-start-2 -mx-4 border-t px-4 py-3 md:-mx-6 md:px-6 lg:col-[4] lg:row-start-1 lg:mx-0 lg:flex lg:justify-center lg:border-t-0 lg:p-0"
			>
				<AdminSearch />
			</div>
			<Button variant="ghost" size="icon-sm" onclick={() => themeStore.toggle()} aria-label="Toggle theme">
				{#if themeStore.isDark}
					<Sun />
				{:else}
					<Moon />
				{/if}
			</Button>
			<Badge variant="outline" class="hidden md:inline-flex">Operator</Badge>
		</header>
		<main class="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-y-auto">
			{@render children()}
		</main>
	</Sidebar.Inset>
</Sidebar.Provider>
