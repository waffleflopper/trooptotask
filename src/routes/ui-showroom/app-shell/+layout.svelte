<script lang="ts">
	import { resolve } from '$app/paths';
	import {
		BadgeCheck,
		Bell,
		Building2,
		Check,
		CircleHelp,
		LogOut,
		Moon,
		Settings,
		ShieldCheck,
		Sun,
		UserRound,
		ChevronsUpDownIcon
	} from '@lucide/svelte';
	import OrgNavIcon from '$lib/components/OrgNavIcon.svelte';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import { Separator } from '$lib/components/ui/separator/index.js';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';

	let { children } = $props();

	type ShowroomHref =
		| '/ui-showroom/app-shell'
		| '/ui-showroom/app-shell#calendar'
		| '/ui-showroom/app-shell#personnel'
		| '/ui-showroom/app-shell#evals'
		| '/ui-showroom/app-shell#training'
		| '/ui-showroom/app-shell#critical-tasks'
		| '/ui-showroom/app-shell#onboarding';

	type ShowroomNavItem = {
		id: string;
		href: ShowroomHref;
		label: string;
		compactLabel?: string;
		badgeLabel?: string;
		icon: 'dashboard' | 'calendar' | 'personnel' | 'rating-scheme' | 'training' | 'critical-tasks' | 'onboarding';
		active: boolean;
	};

	type ShowroomOrg = {
		id: string;
		name: string;
		shortName: string;
		role: string;
		active: boolean;
	};

	const orgMenuItems: ShowroomOrg[] = [
		{ id: '1-23', name: '1-23 Infantry', shortName: '1-23', role: 'Admin', active: true },
		{ id: 'hhc-bde', name: 'HHC Brigade', shortName: 'HHC', role: 'Viewer', active: false },
		{ id: 'training-det', name: 'Training Detachment', shortName: 'TRN', role: 'Member', active: false }
	];

	const activeOrg = orgMenuItems.find((org) => org.active) ?? orgMenuItems[0]!;
	const orgName = activeOrg.name;
	const user = {
		name: 'CPT Avery Brooks',
		email: 'avery.brooks@example.mil',
		role: 'Organization admin',
		initials: 'AB'
	};

	const navItems: ShowroomNavItem[] = [
		{
			id: 'dashboard',
			href: '/ui-showroom/app-shell',
			label: 'Dashboard',
			compactLabel: 'Home',
			icon: 'dashboard',
			active: true
		},
		{
			id: 'calendar',
			href: '/ui-showroom/app-shell#calendar',
			label: 'Calendar',
			icon: 'calendar',
			active: false
		},
		{
			id: 'personnel',
			href: '/ui-showroom/app-shell#personnel',
			label: 'Personnel',
			icon: 'personnel',
			active: false
		},
		{
			id: 'rating-scheme',
			href: '/ui-showroom/app-shell#evals',
			label: 'Evals',
			icon: 'rating-scheme',
			active: false
		},
		{
			id: 'training',
			href: '/ui-showroom/app-shell#training',
			label: 'Training',
			icon: 'training',
			active: false
		},
		{
			id: 'critical-tasks',
			href: '/ui-showroom/app-shell#critical-tasks',
			label: 'Critical Tasks',
			compactLabel: 'ICTLs',
			badgeLabel: 'Beta',
			icon: 'critical-tasks',
			active: false
		},
		{
			id: 'onboarding',
			href: '/ui-showroom/app-shell#onboarding',
			label: 'Onboarding',
			compactLabel: 'Onboard',
			icon: 'onboarding',
			active: false
		}
	];
</script>

<Sidebar.Provider class="min-h-svh bg-background font-sans">
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
										{activeOrg.shortName}
									</span>
									<span class="grid flex-1 text-left text-sm leading-tight">
										<span class="truncate font-medium">{activeOrg.name}</span>
										<span class="truncate text-xs">{activeOrg.role}</span>
									</span>
									<ChevronsUpDownIcon class="ms-auto" />
								</Sidebar.MenuButton>
							{/snippet}
						</DropdownMenu.Trigger>
						<DropdownMenu.Content class="w-72" side="right" align="start">
							<DropdownMenu.Label>Organizations</DropdownMenu.Label>
							<DropdownMenu.Group>
								{#each orgMenuItems as org (org.id)}
									<DropdownMenu.Item>
										<span
											class="flex aspect-square size-8 shrink-0 items-center justify-center rounded-md border bg-muted text-xs font-semibold"
										>
											{org.shortName}
										</span>
										<span class="grid min-w-0 flex-1">
											<span class="truncate font-medium">{org.name}</span>
											<span class="truncate text-xs text-muted-foreground">{org.role}</span>
										</span>
										{#if org.active}
											<Check class="ms-auto size-4 text-primary" />
										{/if}
									</DropdownMenu.Item>
								{/each}
							</DropdownMenu.Group>
							<DropdownMenu.Separator />
							<DropdownMenu.Item>
								<Building2 />
								Manage Organizations
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
							<Sidebar.MenuItem>
								<Sidebar.MenuButton isActive={item.active} tooltipContent={item.label}>
									{#snippet child({ props })}
										<a {...props} href={resolve(item.href)}>
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
								<Sidebar.MenuButton {...props} size="lg" tooltipContent={user.name}>
									<span
										class="flex aspect-square size-8 items-center justify-center rounded-md border bg-muted text-sm font-medium"
										>{user.initials}</span
									>
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
							<DropdownMenu.Group>
								<DropdownMenu.Item>
									<UserRound />
									Account
								</DropdownMenu.Item>
								<DropdownMenu.Item>
									<BadgeCheck />
									Role: {user.role}
								</DropdownMenu.Item>
							</DropdownMenu.Group>
							<DropdownMenu.Separator />
							<DropdownMenu.Group>
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
			<div class="grid min-w-0 flex-1 leading-tight">
				<span class="truncate text-sm font-medium">{orgName}</span>
				<span class="hidden truncate text-xs text-muted-foreground sm:block">App shell showroom</span>
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
			</div>
		</header>

		{@render children?.()}
	</Sidebar.Inset>
</Sidebar.Provider>
