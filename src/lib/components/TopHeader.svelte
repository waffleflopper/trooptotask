<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/stores';
	import { onMount } from 'svelte';
	import type { Snippet } from 'svelte';
	import BadgeCheck from '@lucide/svelte/icons/badge-check';
	import Bell from '@lucide/svelte/icons/bell';
	import Building2 from '@lucide/svelte/icons/building-2';
	import Check from '@lucide/svelte/icons/check';
	import ChevronsUpDownIcon from '@lucide/svelte/icons/chevrons-up-down';
	import LogOut from '@lucide/svelte/icons/log-out';
	import Megaphone from '@lucide/svelte/icons/megaphone';
	import MessageSquareText from '@lucide/svelte/icons/message-square-text';
	import Moon from '@lucide/svelte/icons/moon';
	import Settings from '@lucide/svelte/icons/settings';
	import Sun from '@lucide/svelte/icons/sun';
	import UserCircle from '@lucide/svelte/icons/user-circle';
	import type { CapabilityMap } from '$lib/access/memberAccessShape';
	import { formatDate, formatRelativeDate } from '$lib/utils/dates';
	import { formatDashboardDisplayDate } from '$lib/utils/dashboardDate';
	import OrgNavIcon from './OrgNavIcon.svelte';
	import { getOrgBreadcrumbs, getOrgNavigation, isOrgNavItemActive } from './orgNavigation';
	import * as AppDialog from '$lib/components/ui/app-dialog/index.js';
	import * as Breadcrumb from '$lib/components/ui/breadcrumb/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Separator } from '$lib/components/ui/separator/index.js';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import * as Tooltip from '$lib/components/ui/tooltip/index.js';

	interface OrgInfo {
		id: string;
		name: string;
		role: string;
		urlSegment?: string;
	}

	interface Props {
		orgId: string;
		orgUrlSegment?: string;
		orgName: string;
		userRole: string;
		membershipId?: string | null;
		capabilityMap: CapabilityMap;
		onToggleTheme: () => void;
		isDarkTheme: boolean;
		onFeedback?: () => void;
		onWhatsNew?: () => void;
		children?: Snippet;
	}

	interface Notification {
		id: string;
		title: string;
		message: string | null;
		link: string | null;
		read: boolean;
		created_at: string;
	}

	let {
		orgId,
		orgUrlSegment = orgId,
		orgName,
		userRole,
		membershipId = null,
		capabilityMap,
		onToggleTheme,
		isDarkTheme,
		onFeedback,
		onWhatsNew,
		children
	}: Props = $props();

	let clientDashboardDateLabel = $state<string | null>(null);
	let orgSwitcherOpen = $state(false);
	let orgSwitcherOrgs = $state<OrgInfo[]>([]);
	let orgSwitcherLoaded = $state(false);
	let orgSwitcherLoading = $state(false);
	let orgSwitcherLoadAttempted = $state(false);
	let notificationsOpen = $state(false);
	let notifications = $state<Notification[]>([]);
	let notificationsLoaded = $state(false);
	let notificationsLoading = $state(false);
	let showLeaveOrganizationDialog = $state(false);
	let leaveOrganizationConfirmText = $state('');
	let localUnreadCount = $state(0);
	let lastOrgUrlSegment = $state<string | null>(null);
	let lastNotificationCountSegment = $state<string | null>(null);
	const pathname = $derived($page.url.pathname);
	const dashboardPath = $derived(`/org/${orgUrlSegment}`);
	const isDashboardRoot = $derived(pathname === dashboardPath);
	const routeLeafLabel = $derived(
		isDashboardRoot
			? clientDashboardDateLabel
			: typeof $page.data?.breadcrumbLabel === 'string'
				? $page.data.breadcrumbLabel
				: undefined
	);
	const allNavItems = $derived(getOrgNavigation(orgUrlSegment, capabilityMap));
	const navItems = $derived(allNavItems.filter((item) => item.visible));
	const breadcrumbs = $derived(getOrgBreadcrumbs(pathname, orgName, allNavItems, routeLeafLabel));
	const activeOrg = $derived(
		orgSwitcherOrgs.find((org) => org.id === orgId) ?? {
			id: orgId,
			name: orgName,
			role: userRole,
			urlSegment: orgUrlSegment
		}
	);
	const visibleOrgs = $derived(orgSwitcherLoaded ? orgSwitcherOrgs : [activeOrg]);
	const isMultiOrg = $derived(orgSwitcherLoaded && orgSwitcherOrgs.length > 1);
	const normalizedUserRole = $derived(userRole.toLowerCase());
	const canLeaveOrganization = $derived(normalizedUserRole !== 'owner');
	const canAccessOrganizationSettings = $derived(normalizedUserRole === 'owner' || normalizedUserRole === 'admin');
	const canSubmitLeaveOrganization = $derived(
		canLeaveOrganization && Boolean(membershipId) && leaveOrganizationConfirmText === 'YES'
	);
	const accountInitials = $derived('ME');

	onMount(() => {
		clientDashboardDateLabel = formatDashboardDisplayDate(formatDate(new Date()));
	});

	function getInitials(value: string) {
		const words = value
			.split(/\s+/)
			.map((word) => word.trim())
			.filter(Boolean);
		return words
			.slice(0, 2)
			.map((word) => word[0]?.toUpperCase() ?? '')
			.join('');
	}

	function openLeaveOrganizationDialog() {
		leaveOrganizationConfirmText = '';
		showLeaveOrganizationDialog = true;
	}

	function closeLeaveOrganizationDialog() {
		leaveOrganizationConfirmText = '';
		showLeaveOrganizationDialog = false;
	}

	function switchOrg(targetOrgId: string, targetOrgUrlSegment: string = targetOrgId) {
		if (targetOrgId === orgId) return;

		const orgPrefix = `/org/${orgUrlSegment}`;
		const suffix = pathname.startsWith(orgPrefix) ? pathname.slice(orgPrefix.length) : '';
		void goto(resolve(`/org/${targetOrgUrlSegment}${suffix}`));
	}

	async function loadOrgSwitcherOrgs(segment = orgUrlSegment) {
		if (orgSwitcherLoaded || orgSwitcherLoading || orgSwitcherLoadAttempted) return;

		orgSwitcherLoadAttempted = true;
		orgSwitcherLoading = true;
		try {
			const response = await fetch(`/org/${segment}/api/app-shell-chrome?part=organization-switcher`);
			if (!response.ok) return;

			const result = await response.json();
			if (segment === orgUrlSegment && result.ok && Array.isArray(result.organizations)) {
				orgSwitcherOrgs = result.organizations;
				orgSwitcherLoaded = true;
			}
		} finally {
			orgSwitcherLoading = false;
		}
	}

	async function loadUnreadNotificationCount(segment = orgUrlSegment) {
		try {
			const response = await fetch(`/org/${segment}/api/app-shell-chrome?part=notification-count`);
			if (!response.ok) return;

			const result = await response.json();
			if (segment === orgUrlSegment && result.ok && typeof result.unreadNotificationCount === 'number') {
				localUnreadCount = result.unreadNotificationCount;
			}
		} catch {
			if (segment === orgUrlSegment) {
				localUnreadCount = 0;
			}
		}
	}

	async function loadNotifications() {
		if (notificationsLoaded || notificationsLoading) return;

		notificationsLoading = true;
		try {
			const response = await fetch(`/org/${orgUrlSegment}/api/notifications`);
			if (response.ok) {
				notifications = await response.json();
				notificationsLoaded = true;
			}
		} finally {
			notificationsLoading = false;
		}
	}

	async function markAllNotificationsRead() {
		const response = await fetch(`/org/${orgUrlSegment}/api/notifications`, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ markAllRead: true })
		});

		if (response.ok) {
			notifications = notifications.map((notification) => ({ ...notification, read: true }));
			localUnreadCount = 0;
		}
	}

	async function openNotification(notification: Notification) {
		notificationsOpen = false;

		if (!notification.read) {
			notification.read = true;
			localUnreadCount = Math.max(0, localUnreadCount - 1);
			await fetch(`/org/${orgUrlSegment}/api/notifications`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id: notification.id })
			});
		}

		if (notification.link) {
			void goto(resolve(notification.link as `/org/${string}`));
		}
	}

	$effect(() => {
		const segment = orgUrlSegment;
		if (lastOrgUrlSegment === segment) return;

		lastOrgUrlSegment = segment;
		orgSwitcherOrgs = [];
		orgSwitcherLoaded = false;
		orgSwitcherLoading = false;
		orgSwitcherLoadAttempted = false;
		notifications = [];
		notificationsLoaded = false;
		notificationsLoading = false;
		localUnreadCount = 0;
	});

	$effect(() => {
		const segment = orgUrlSegment;
		if (lastNotificationCountSegment === segment) return;

		lastNotificationCountSegment = segment;
		void loadUnreadNotificationCount(segment);
	});

	$effect(() => {
		if (orgSwitcherOpen && !orgSwitcherLoadAttempted) {
			void loadOrgSwitcherOrgs(orgUrlSegment);
		}
	});

	$effect(() => {
		if (notificationsOpen) {
			void loadNotifications();
		}
	});
</script>

<Tooltip.Provider>
	<Sidebar.Provider
		class="min-h-0 overflow-hidden bg-background font-sans"
		style="margin-top: var(--banner-height, 0px); height: calc(100dvh - var(--banner-height, 0px)); max-height: calc(100dvh - var(--banner-height, 0px));"
	>
		<Sidebar.Root collapsible="icon">
			<Sidebar.Header>
				<Sidebar.Menu>
					<Sidebar.MenuItem>
						<DropdownMenu.Root bind:open={orgSwitcherOpen}>
							<DropdownMenu.Trigger>
								{#snippet child({ props })}
									<Sidebar.MenuButton
										{...props}
										size="lg"
										tooltipContent="Switch organization"
										aria-label="Switch organization"
									>
										<span
											class="flex aspect-square size-8 shrink-0 items-center justify-center rounded-md bg-sidebar-accent text-xs font-semibold text-sidebar-accent-foreground"
										>
											{getInitials(activeOrg.name)}
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
									{#each visibleOrgs as org (org.id)}
										<DropdownMenu.Item
											onclick={() => switchOrg(org.id, org.urlSegment)}
											disabled={org.id === orgId && !isMultiOrg}
										>
											<span
												class="flex aspect-square size-8 shrink-0 items-center justify-center rounded-md border bg-muted text-xs font-semibold"
											>
												{getInitials(org.name)}
											</span>
											<span class="grid min-w-0 flex-1">
												<span class="truncate font-medium">{org.name}</span>
												<span class="truncate text-xs text-muted-foreground">{org.role}</span>
											</span>
											{#if org.id === orgId}
												<Check class="ms-auto size-4 text-primary" />
											{/if}
										</DropdownMenu.Item>
									{/each}
									{#if orgSwitcherOpen && orgSwitcherLoading}
										<DropdownMenu.Item disabled>Loading organizations...</DropdownMenu.Item>
									{/if}
								</DropdownMenu.Group>
								{#if canAccessOrganizationSettings}
									<DropdownMenu.Separator />
									<DropdownMenu.Item onclick={() => goto(resolve(`/org/${orgUrlSegment}/settings`))}>
										<Settings />
										Organization Settings
									</DropdownMenu.Item>
								{/if}
								{#if isMultiOrg}
									{#if !canAccessOrganizationSettings}
										<DropdownMenu.Separator />
									{/if}
									<DropdownMenu.Item onclick={() => goto(resolve('/dashboard?show=all'))}>
										<Building2 />
										Manage Organizations
									</DropdownMenu.Item>
								{/if}
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
							{#each navItems as item (item.href)}
								<Sidebar.MenuItem>
									<Sidebar.MenuButton isActive={isOrgNavItemActive(pathname, item)} tooltipContent={item.label}>
										{#snippet child({ props })}
											<a
												{...props}
												href={resolve(item.href as `/org/${string}`)}
												aria-current={isOrgNavItemActive(pathname, item) ? 'page' : undefined}
											>
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
					{#if canAccessOrganizationSettings}
						<Sidebar.MenuItem>
							<Sidebar.MenuButton
								isActive={pathname === `/org/${orgUrlSegment}/settings` ||
									pathname.startsWith(`/org/${orgUrlSegment}/settings/`)}
								tooltipContent="Organization Settings"
							>
								{#snippet child({ props })}
									<a
										{...props}
										href={resolve(`/org/${orgUrlSegment}/settings`)}
										aria-current={pathname === `/org/${orgUrlSegment}/settings` ? 'page' : undefined}
									>
										<Settings />
										<span>Organization Settings</span>
									</a>
								{/snippet}
							</Sidebar.MenuButton>
						</Sidebar.MenuItem>
					{/if}
					<Sidebar.MenuItem>
						<DropdownMenu.Root>
							<DropdownMenu.Trigger>
								{#snippet child({ props })}
									<Sidebar.MenuButton {...props} size="lg" tooltipContent="Account menu" aria-label="Account menu">
										<span
											class="flex aspect-square size-8 items-center justify-center rounded-md border bg-muted text-sm font-medium"
										>
											{accountInitials}
										</span>
										<span class="grid flex-1 text-left text-sm leading-tight">
											<span class="truncate font-medium">Account</span>
											<span class="truncate text-xs">Signed in</span>
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
											{accountInitials}
										</span>
										<span class="grid min-w-0 gap-1">
											<span class="truncate text-sm font-medium leading-none text-foreground">Account</span>
											<span class="truncate text-xs leading-none text-muted-foreground">Signed in</span>
										</span>
									</div>
								</DropdownMenu.Label>
								<DropdownMenu.Separator />
								<DropdownMenu.Group>
									<DropdownMenu.Item>
										<BadgeCheck />
										Role: {userRole}
									</DropdownMenu.Item>
									<DropdownMenu.Item onclick={() => goto(resolve('/account/profile'))}>
										<UserCircle />
										Account
									</DropdownMenu.Item>
								</DropdownMenu.Group>
								{#if onWhatsNew || onFeedback}
									<DropdownMenu.Separator />
									<DropdownMenu.Group>
										{#if onWhatsNew}
											<DropdownMenu.Item onclick={onWhatsNew}>
												<Megaphone />
												What's New
											</DropdownMenu.Item>
										{/if}
										{#if onFeedback}
											<DropdownMenu.Item onclick={onFeedback}>
												<MessageSquareText />
												Send Feedback
											</DropdownMenu.Item>
										{/if}
									</DropdownMenu.Group>
								{/if}
								<DropdownMenu.Separator />
								{#if canLeaveOrganization}
									<DropdownMenu.Item variant="destructive" onclick={openLeaveOrganizationDialog}>
										<Building2 />
										Leave Organization
									</DropdownMenu.Item>
									<DropdownMenu.Separator />
								{/if}
								<DropdownMenu.Item variant="destructive" onclick={() => goto(resolve('/auth/logout'))}>
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
			<header class="sticky top-0 z-10 flex h-14 min-w-0 shrink-0 items-center gap-2 border-b bg-background px-4">
				<a href="#main-content" class="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3"
					>Skip to main content</a
				>
				<Sidebar.Trigger />
				<Separator orientation="vertical" class="h-4" />
				<Breadcrumb.Root class="min-w-0 flex-1" aria-label="Current section">
					<Breadcrumb.List class="flex-nowrap overflow-hidden">
						{#each breadcrumbs as crumb, index (`${crumb.label}:${index}`)}
							<Breadcrumb.Item class="min-w-0 shrink-0">
								{#if crumb.href && index < breadcrumbs.length - 1}
									<Breadcrumb.Link href={resolve(crumb.href as `/org/${string}`)} class="truncate">
										{crumb.label}
									</Breadcrumb.Link>
								{:else}
									<Breadcrumb.Page class="truncate">{crumb.label}</Breadcrumb.Page>
								{/if}
							</Breadcrumb.Item>
							{#if index < breadcrumbs.length - 1}
								<Breadcrumb.Separator class="shrink-0" />
							{/if}
						{/each}
					</Breadcrumb.List>
				</Breadcrumb.Root>
				<div class="ml-auto flex items-center gap-1">
					{#if onFeedback}
						<Button
							variant="outline"
							size="sm"
							onclick={onFeedback}
							class="hidden sm:inline-flex"
							aria-label="Send feedback"
						>
							Feedback
						</Button>
					{/if}
					<DropdownMenu.Root bind:open={notificationsOpen}>
						<DropdownMenu.Trigger>
							{#snippet child({ props })}
								<Button
									{...props}
									variant="ghost"
									size="icon"
									aria-label={localUnreadCount > 0 ? `${localUnreadCount} unread notifications` : 'Notifications'}
								>
									<Bell />
									{#if localUnreadCount > 0}
										<span class="sr-only">{localUnreadCount} unread</span>
									{/if}
								</Button>
							{/snippet}
						</DropdownMenu.Trigger>
						<DropdownMenu.Content class="w-80" align="end">
							<DropdownMenu.Label>
								<span class="flex items-center justify-between gap-3">
									<span>Notifications</span>
									{#if localUnreadCount > 0}
										<Button variant="ghost" size="xs" onclick={markAllNotificationsRead}>Mark all read</Button>
									{/if}
								</span>
							</DropdownMenu.Label>
							<DropdownMenu.Separator />
							{#if notificationsLoading}
								<DropdownMenu.Item disabled>Loading notifications...</DropdownMenu.Item>
							{:else if notifications.length === 0}
								<DropdownMenu.Item disabled>No notifications</DropdownMenu.Item>
							{:else}
								{#each notifications as notification (notification.id)}
									<DropdownMenu.Item onclick={() => openNotification(notification)}>
										<span class="grid min-w-0 gap-1">
											<span class="truncate font-medium">{notification.title}</span>
											{#if notification.message}
												<span class="line-clamp-2 text-xs text-muted-foreground">{notification.message}</span>
											{/if}
											<span class="text-xs text-muted-foreground">{formatRelativeDate(notification.created_at)}</span>
										</span>
									</DropdownMenu.Item>
								{/each}
							{/if}
						</DropdownMenu.Content>
					</DropdownMenu.Root>
					<Tooltip.Root>
						<Tooltip.Trigger>
							{#snippet child({ props })}
								<Button {...props} variant="ghost" size="icon" onclick={onToggleTheme} aria-label="Toggle theme">
									{#if isDarkTheme}
										<Sun />
									{:else}
										<Moon />
									{/if}
								</Button>
							{/snippet}
						</Tooltip.Trigger>
						<Tooltip.Content>{isDarkTheme ? 'Light mode' : 'Dark mode'}</Tooltip.Content>
					</Tooltip.Root>
				</div>
			</header>

			<main id="main-content" class="min-h-0 w-full min-w-0 flex-1 overflow-x-hidden overflow-y-auto bg-background">
				{@render children?.()}
			</main>
		</Sidebar.Inset>
	</Sidebar.Provider>

	{#if canLeaveOrganization}
		<AppDialog.Root bind:open={showLeaveOrganizationDialog} onClose={closeLeaveOrganizationDialog}>
			<AppDialog.Content>
				<AppDialog.Header>
					<AppDialog.Title>Leave Organization</AppDialog.Title>
					<AppDialog.Description>
						Are you sure you wish to leave {orgName}? You will lose access to this organization's workspace unless you
						are invited again.
					</AppDialog.Description>
				</AppDialog.Header>

				<AppDialog.Body>
					<form
						id="leave-organization-form"
						method="POST"
						action={resolve(`/org/${orgUrlSegment}?/leaveOrganization`)}
						class="grid gap-3"
						onsubmit={(event) => {
							if (!canSubmitLeaveOrganization) event.preventDefault();
						}}
					>
						<input type="hidden" name="membershipId" value={membershipId ?? ''} />
						<div class="grid gap-2">
							<Label for="leave-organization-confirm">Type YES to confirm</Label>
							<Input
								id="leave-organization-confirm"
								name="confirmLeaveOrganization"
								type="text"
								bind:value={leaveOrganizationConfirmText}
								autocomplete="off"
								placeholder="YES"
								aria-describedby="leave-organization-help"
							/>
							<p id="leave-organization-help" class="text-sm text-muted-foreground">
								This confirms you understand the action applies to {orgName}.
							</p>
						</div>
						{#if !membershipId}
							<p class="text-sm text-destructive">
								We could not identify your organization membership. Refresh the page and try again.
							</p>
						{/if}
					</form>
				</AppDialog.Body>

				<AppDialog.Footer>
					<Button type="button" variant="outline" onclick={closeLeaveOrganizationDialog}>Cancel</Button>
					<Button
						type="submit"
						form="leave-organization-form"
						variant="destructive"
						disabled={!canSubmitLeaveOrganization}
					>
						Leave Organization
					</Button>
				</AppDialog.Footer>
			</AppDialog.Content>
		</AppDialog.Root>
	{/if}
</Tooltip.Provider>
