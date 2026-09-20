<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/stores';
	import {
		BadgeCheck,
		Bell,
		Building2,
		ClipboardList,
		CreditCard,
		FileText,
		Gauge,
		LogOut,
		Moon,
		ShieldCheck,
		Sun,
		UsersRound
	} from '@lucide/svelte';
	import AdminSearch from '$lib/components/admin/AdminSearch.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import { Separator } from '$lib/components/ui/separator';
	import * as Sidebar from '$lib/components/ui/sidebar';
	import { themeStore } from '$lib/stores/theme.svelte';

	let { children, data } = $props();
	const canUseGlobalAdminSearch = $derived(
		data.accessiblePages.includes('users') || data.accessiblePages.includes('organizations')
	);

	const navIconByPage = {
		dashboard: Gauge,
		users: UsersRound,
		organizations: Building2,
		'access-requests': ShieldCheck,
		feedback: ClipboardList,
		subscriptions: CreditCard,
		audit: FileText,
		announcements: Bell
	};

	function isActive(href: string): boolean {
		if (href === '/admin') return $page.url.pathname === '/admin';
		return $page.url.pathname.startsWith(href);
	}

	function formatRole(role: string | null | undefined): string {
		return role ? role.replace(/_/g, ' ').toUpperCase() : 'ADMIN';
	}
</script>

<Sidebar.Provider class="min-h-svh bg-background font-sans">
	<Sidebar.Root collapsible="icon">
		<Sidebar.Header>
			<Sidebar.Menu>
				<Sidebar.MenuItem>
					<Sidebar.MenuButton size="lg" tooltipContent="Platform Admin">
						<span
							class="flex aspect-square size-8 shrink-0 items-center justify-center rounded-md bg-sidebar-primary text-xs font-semibold text-sidebar-primary-foreground"
						>
							TT
						</span>
						<span class="grid flex-1 text-left text-sm leading-tight">
							<span class="truncate font-medium">Platform Admin</span>
							<span class="truncate text-xs">Control Room</span>
						</span>
					</Sidebar.MenuButton>
				</Sidebar.MenuItem>
			</Sidebar.Menu>
		</Sidebar.Header>

		<Sidebar.Content>
			{#each data.visibleNavGroups as group (group.label ?? 'dashboard')}
				<Sidebar.Group>
					{#if group.label}
						<Sidebar.GroupLabel>{group.label}</Sidebar.GroupLabel>
					{/if}
					<Sidebar.GroupContent>
						<Sidebar.Menu>
							{#each group.items as item (item.href)}
								{@const Icon = navIconByPage[item.page as keyof typeof navIconByPage] ?? Gauge}
								<Sidebar.MenuItem>
									<Sidebar.MenuButton isActive={isActive(item.href)} tooltipContent={item.label}>
										{#snippet child({ props })}
											<a {...props} href={resolve(item.href as '/')}>
												<Icon />
												<span>{item.label}</span>
											</a>
										{/snippet}
									</Sidebar.MenuButton>
								</Sidebar.MenuItem>
							{/each}
						</Sidebar.Menu>
					</Sidebar.GroupContent>
				</Sidebar.Group>
			{/each}
		</Sidebar.Content>

		<Sidebar.Footer>
			<Sidebar.Menu>
				<Sidebar.MenuItem>
					<Sidebar.MenuButton size="lg" tooltipContent={data.adminEmail ?? 'Admin user'}>
						<BadgeCheck />
						<span class="grid min-w-0 flex-1 text-left text-sm leading-tight">
							<span class="truncate font-medium">{data.adminEmail ?? 'Admin user'}</span>
							<span class="truncate text-xs">{formatRole(data.adminRole)}</span>
						</span>
					</Sidebar.MenuButton>
				</Sidebar.MenuItem>
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

	<Sidebar.Inset>
		<header class="flex min-h-14 shrink-0 items-center gap-3 border-b bg-background px-4 md:px-6">
			<Sidebar.Trigger />
			<Separator orientation="vertical" class="h-5" />
			<div class="grid min-w-0 flex-1 gap-0.5">
				<p class="truncate text-sm font-medium">Platform Oversight</p>
				<p class="truncate text-xs text-muted-foreground">Internal admin workspace</p>
			</div>
			{#if canUseGlobalAdminSearch}
				<div class="hidden min-w-0 flex-1 justify-center lg:flex">
					<AdminSearch />
				</div>
			{/if}
			<Button variant="ghost" size="icon-sm" onclick={() => themeStore.toggle()} aria-label="Toggle theme">
				{#if themeStore.isDark}
					<Sun />
				{:else}
					<Moon />
				{/if}
			</Button>
			<Badge variant="outline" class="hidden md:inline-flex">{formatRole(data.adminRole)}</Badge>
		</header>
		{#if canUseGlobalAdminSearch}
			<div class="border-b bg-background px-4 py-3 lg:hidden">
				<AdminSearch />
			</div>
		{/if}
		{@render children()}
	</Sidebar.Inset>
</Sidebar.Provider>
