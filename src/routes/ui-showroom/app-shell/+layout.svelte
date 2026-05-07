<script lang="ts">
	import { Bell, CircleHelp, LogOut, Moon, Settings, Sun, UserRound } from '@lucide/svelte';
	import OrgNavIcon from '$lib/components/OrgNavIcon.svelte';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import * as NavigationMenu from '$lib/components/ui/navigation-menu/index.js';
	import { Separator } from '$lib/components/ui/separator/index.js';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';

	let { children } = $props();

	type ShowroomNavItem = {
		id: string;
		href: string;
		label: string;
		compactLabel?: string;
		badgeLabel?: string;
		icon: 'dashboard' | 'calendar' | 'personnel' | 'rating-scheme' | 'training' | 'critical-tasks' | 'onboarding';
		active: boolean;
	};

	const orgName = '1-23 Infantry';
	const userRole = 'admin';
	const userInitial = '1';

	const navItems: ShowroomNavItem[] = [
		{
			id: 'dashboard',
			href: `/ui-showroom/app-shell`,
			label: 'Dashboard',
			compactLabel: 'Home',
			icon: 'dashboard',
			active: true
		},
		{
			id: 'calendar',
			href: `/ui-showroom/app-shell#calendar`,
			label: 'Calendar',
			icon: 'calendar',
			active: false
		},
		{
			id: 'personnel',
			href: `/ui-showroom/app-shell#personnel`,
			label: 'Personnel',
			icon: 'personnel',
			active: false
		},
		{
			id: 'rating-scheme',
			href: `/ui-showroom/app-shell#evals`,
			label: 'Evals',
			icon: 'rating-scheme',
			active: false
		},
		{
			id: 'training',
			href: `/ui-showroom/app-shell#training`,
			label: 'Training',
			icon: 'training',
			active: false
		},
		{
			id: 'critical-tasks',
			href: `/ui-showroom/app-shell#critical-tasks`,
			label: 'Critical Tasks',
			compactLabel: 'ICTLs',
			badgeLabel: 'Beta',
			icon: 'critical-tasks',
			active: false
		},
		{
			id: 'onboarding',
			href: `/ui-showroom/app-shell#onboarding`,
			label: 'Onboarding',
			compactLabel: 'Onboard',
			icon: 'onboarding',
			active: false
		}
	];

	const orgMenuItems = [
		{ name: '1-23 Infantry', role: 'Admin', active: true },
		{ name: 'HHC Brigade', role: 'Viewer', active: false },
		{ name: 'Training Detachment', role: 'Member', active: false }
	];
</script>

<Sidebar.Provider class="min-h-svh bg-background font-sans">
	<Sidebar.Root collapsible="icon">
		<Sidebar.Header>
			<Sidebar.Menu>
				<Sidebar.MenuItem>
					<Sidebar.MenuButton size="lg" tooltipContent="Troop to Task">
						<span
							class="flex aspect-square size-8 items-center justify-center rounded-md border bg-sidebar-primary text-sidebar-primary-foreground"
							>T2T</span
						>
						<span class="grid flex-1 text-left text-sm leading-tight">
							<span class="truncate font-medium">Troop to Task</span>
							<span class="truncate text-xs">{orgName}</span>
						</span>
					</Sidebar.MenuButton>
				</Sidebar.MenuItem>
			</Sidebar.Menu>
		</Sidebar.Header>

		<Sidebar.Content>
			<Sidebar.Group>
				<Sidebar.GroupLabel>Navigation</Sidebar.GroupLabel>
				<Sidebar.GroupContent>
					<Sidebar.Menu>
						{#each navItems as item (item.id)}
							<Sidebar.MenuItem>
								<Sidebar.MenuButton isActive={item.active} tooltipContent={item.label}>
									{#snippet child({ props })}
										<a {...props} href={item.href}>
											<OrgNavIcon icon={item.icon} />
											<span>{item.compactLabel ?? item.label}</span>
											{#if item.badgeLabel}
												<Sidebar.MenuBadge>{item.badgeLabel}</Sidebar.MenuBadge>
											{/if}
										</a>
									{/snippet}
								</Sidebar.MenuButton>
							</Sidebar.MenuItem>
						{/each}
					</Sidebar.Menu>
				</Sidebar.GroupContent>
			</Sidebar.Group>
		</Sidebar.Content>

		<Sidebar.Footer>
			<Sidebar.Menu>
				<Sidebar.MenuItem>
					<DropdownMenu.Root>
						<DropdownMenu.Trigger>
							{#snippet child({ props })}
								<Sidebar.MenuButton {...props} size="lg" tooltipContent="Account menu">
									<span
										class="flex aspect-square size-8 items-center justify-center rounded-md border bg-muted text-sm font-medium"
										>{userInitial}</span
									>
									<span class="grid flex-1 text-left text-sm leading-tight">
										<span class="truncate font-medium">{orgName}</span>
										<span class="truncate text-xs capitalize">{userRole}</span>
									</span>
								</Sidebar.MenuButton>
							{/snippet}
						</DropdownMenu.Trigger>
						<DropdownMenu.Content class="w-64" side="right" align="end">
							<DropdownMenu.Label>
								<div class="grid gap-1">
									<p class="text-sm font-medium leading-none">{orgName}</p>
									<p class="text-xs leading-none text-muted-foreground capitalize">{userRole}</p>
								</div>
							</DropdownMenu.Label>
							<DropdownMenu.Separator />
							<DropdownMenu.Group>
								{#each orgMenuItems as org (org.name)}
									<DropdownMenu.Item>
										<span class="flex min-w-0 flex-1 flex-col">
											<span class="truncate">{org.name}</span>
											<span class="text-xs text-muted-foreground">{org.role}</span>
										</span>
										{#if org.active}
											<span class="text-xs text-muted-foreground">Current</span>
										{/if}
									</DropdownMenu.Item>
								{/each}
								<DropdownMenu.Item>Manage Organizations</DropdownMenu.Item>
							</DropdownMenu.Group>
							<DropdownMenu.Separator />
							<DropdownMenu.Group>
								<DropdownMenu.Item>
									<Settings />
									Org Settings
								</DropdownMenu.Item>
								<DropdownMenu.Item>
									<Moon />
									Dark Mode
								</DropdownMenu.Item>
								<DropdownMenu.Item>
									<UserRound />
									What's New
								</DropdownMenu.Item>
								<DropdownMenu.Item>
									<CircleHelp />
									Help
								</DropdownMenu.Item>
							</DropdownMenu.Group>
							<DropdownMenu.Separator />
							<DropdownMenu.Item variant="destructive">
								<LogOut />
								Sign Out
							</DropdownMenu.Item>
						</DropdownMenu.Content>
					</DropdownMenu.Root>
				</Sidebar.MenuItem>
			</Sidebar.Menu>
		</Sidebar.Footer>
		<Sidebar.Rail />
	</Sidebar.Root>

	<Sidebar.Inset>
		<header class="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b bg-background px-4">
			<Sidebar.Trigger />
			<Separator orientation="vertical" class="h-4" />
			<NavigationMenu.Root>
				<NavigationMenu.List>
					<NavigationMenu.Item>
						<NavigationMenu.Trigger>{orgName}</NavigationMenu.Trigger>
						<NavigationMenu.Content>
							<div class="grid w-80 gap-2 p-2">
								{#each navItems as item (item.id)}
									<NavigationMenu.Link href={item.href}>
										<OrgNavIcon icon={item.icon} />
										<span>{item.label}</span>
									</NavigationMenu.Link>
								{/each}
							</div>
						</NavigationMenu.Content>
					</NavigationMenu.Item>
					<NavigationMenu.Item>
						<NavigationMenu.Link href="/ui-showroom">Showroom</NavigationMenu.Link>
					</NavigationMenu.Item>
				</NavigationMenu.List>
			</NavigationMenu.Root>
			<div class="ml-auto flex items-center gap-1">
				<button class="inline-flex size-8 items-center justify-center rounded-md border" aria-label="Notifications">
					<Bell class="size-4" />
				</button>
				<button class="inline-flex size-8 items-center justify-center rounded-md border" aria-label="Toggle theme">
					<Sun class="size-4 dark:hidden" />
					<Moon class="hidden size-4 dark:block" />
				</button>
			</div>
		</header>

		{@render children?.()}
	</Sidebar.Inset>
</Sidebar.Provider>
