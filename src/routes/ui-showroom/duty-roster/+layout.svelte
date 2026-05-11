<script lang="ts">
	import { resolve } from '$app/paths';
	import {
		BadgeCheck,
		Bell,
		CalendarDays,
		ChevronsUpDown,
		ClipboardList,
		FileText,
		Home,
		LogOut,
		Moon,
		Settings,
		ShieldCheck,
		Sun,
		UserRound,
		UsersRound
	} from '@lucide/svelte';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import { Separator } from '$lib/components/ui/separator/index.js';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';

	let { children } = $props();

	type ShowroomHref =
		| '/ui-showroom'
		| '/ui-showroom/app-shell'
		| '/ui-showroom/app-shell#personnel'
		| '/ui-showroom/calendar'
		| '/ui-showroom/duty-roster';

	const navItems: Array<{
		id: string;
		href: ShowroomHref;
		label: string;
		icon: typeof Home;
		active: boolean;
	}> = [
		{ id: 'dashboard', href: '/ui-showroom/app-shell', label: 'Dashboard', icon: Home, active: false },
		{ id: 'calendar', href: '/ui-showroom/calendar', label: 'Calendar', icon: CalendarDays, active: false },
		{ id: 'duty-roster', href: '/ui-showroom/duty-roster', label: 'Duty Rosters', icon: ClipboardList, active: true },
		{ id: 'personnel', href: '/ui-showroom/app-shell#personnel', label: 'Personnel', icon: UsersRound, active: false },
		{ id: 'settings', href: '/ui-showroom/app-shell', label: 'Settings', icon: Settings, active: false }
	];

	const user = {
		name: 'CPT Avery Brooks',
		email: 'avery.brooks@example.mil',
		role: 'Organization admin',
		initials: 'AB'
	};
</script>

<Sidebar.Provider class="h-svh min-h-0 overflow-hidden bg-background font-sans">
	<Sidebar.Root collapsible="icon">
		<Sidebar.Header>
			<Sidebar.Menu>
				<Sidebar.MenuItem>
					<DropdownMenu.Root>
						<DropdownMenu.Trigger>
							{#snippet child({ props })}
								<Sidebar.MenuButton {...props} size="lg" tooltipContent="Switch organization">
									<span
										class="flex aspect-square size-8 shrink-0 items-center justify-center rounded-md bg-sidebar-accent text-xs font-semibold text-sidebar-accent-foreground"
									>
										1-23
									</span>
									<span class="grid flex-1 text-left text-sm leading-tight">
										<span class="truncate font-medium">1-23 Infantry</span>
										<span class="truncate text-xs">Admin</span>
									</span>
									<ChevronsUpDown class="ms-auto" />
								</Sidebar.MenuButton>
							{/snippet}
						</DropdownMenu.Trigger>
						<DropdownMenu.Content class="w-72" side="right" align="start">
							<DropdownMenu.Label>Organizations</DropdownMenu.Label>
							<DropdownMenu.Item>
								<span
									class="flex aspect-square size-8 shrink-0 items-center justify-center rounded-md border bg-muted text-xs font-semibold"
								>
									1-23
								</span>
								<span class="grid min-w-0 flex-1">
									<span class="truncate font-medium">1-23 Infantry</span>
									<span class="truncate text-xs text-muted-foreground">Admin</span>
								</span>
								<ShieldCheck class="ms-auto size-4 text-primary" />
							</DropdownMenu.Item>
							<DropdownMenu.Item>
								<span
									class="flex aspect-square size-8 shrink-0 items-center justify-center rounded-md border bg-muted text-xs font-semibold"
								>
									HHC
								</span>
								<span class="grid min-w-0 flex-1">
									<span class="truncate font-medium">HHC Brigade</span>
									<span class="truncate text-xs text-muted-foreground">Viewer</span>
								</span>
							</DropdownMenu.Item>
						</DropdownMenu.Content>
					</DropdownMenu.Root>
				</Sidebar.MenuItem>
			</Sidebar.Menu>
		</Sidebar.Header>

		<Sidebar.Content>
			<Sidebar.Group>
				<Sidebar.GroupLabel>Navigation</Sidebar.GroupLabel>
				<Sidebar.GroupContent>
					<Sidebar.Menu>
						{#each navItems as item (item.id)}
							{@const Icon = item.icon}
							<Sidebar.MenuItem>
								<Sidebar.MenuButton isActive={item.active} tooltipContent={item.label}>
									{#snippet child({ props })}
										<a {...props} href={resolve(item.href)}>
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
		</Sidebar.Content>

		<Sidebar.Footer>
			<Sidebar.Menu>
				<Sidebar.MenuItem>
					<DropdownMenu.Root>
						<DropdownMenu.Trigger>
							{#snippet child({ props })}
								<Sidebar.MenuButton {...props} size="lg" tooltipContent={user.name}>
									<span
										class="flex aspect-square size-8 items-center justify-center rounded-md border bg-muted text-sm font-medium"
									>
										{user.initials}
									</span>
									<span class="grid flex-1 text-left text-sm leading-tight">
										<span class="truncate font-medium">{user.name}</span>
										<span class="truncate text-xs">{user.email}</span>
									</span>
								</Sidebar.MenuButton>
							{/snippet}
						</DropdownMenu.Trigger>
						<DropdownMenu.Content class="w-64" side="right" align="end">
							<DropdownMenu.Label>
								<div class="flex min-w-0 items-center gap-2">
									<span
										class="flex aspect-square size-9 shrink-0 items-center justify-center rounded-md border bg-muted text-sm font-medium"
									>
										{user.initials}
									</span>
									<span class="grid min-w-0 gap-1">
										<span class="truncate text-sm font-medium leading-none text-foreground">{user.name}</span>
										<span class="truncate text-xs leading-none text-muted-foreground">{user.email}</span>
									</span>
								</div>
							</DropdownMenu.Label>
							<DropdownMenu.Separator />
							<DropdownMenu.Item>
								<UserRound />
								Account
							</DropdownMenu.Item>
							<DropdownMenu.Item>
								<BadgeCheck />
								Role: {user.role}
							</DropdownMenu.Item>
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

	<Sidebar.Inset class="h-svh min-h-0 overflow-hidden bg-background">
		<header class="z-10 flex h-14 shrink-0 items-center gap-2 border-b bg-background px-4">
			<Sidebar.Trigger />
			<Separator orientation="vertical" class="h-4" />
			<div class="grid min-w-0 flex-1 leading-tight">
				<span class="truncate text-sm font-medium">1-23 Infantry</span>
				<span class="hidden truncate text-xs text-muted-foreground sm:block">Duty roster showroom</span>
			</div>
			<div class="ml-auto flex items-center gap-1">
				<a
					href={resolve('/ui-showroom')}
					class="hidden h-8 items-center rounded-md border px-3 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground sm:inline-flex"
				>
					Showroom
				</a>
				<button class="inline-flex size-8 items-center justify-center rounded-md border" aria-label="Notifications">
					<Bell class="size-4" />
				</button>
				<button class="inline-flex size-8 items-center justify-center rounded-md border" aria-label="Toggle theme">
					<Sun class="size-4 dark:hidden" />
					<Moon class="hidden size-4 dark:block" />
				</button>
				<FileText class="hidden size-4 text-muted-foreground sm:block" aria-hidden="true" />
			</div>
		</header>

		{@render children?.()}
	</Sidebar.Inset>
</Sidebar.Provider>
