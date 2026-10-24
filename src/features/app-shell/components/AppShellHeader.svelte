<script lang="ts">
	import type { OrganizationSwitcherOrg } from '$features/app-shell/contracts';
	import type { SignedInAccount } from '$features/identity/contracts';
	import { accountLabel, mfaSetupHref } from '$features/identity';
	import type { Notification } from '$features/notifications/contracts';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { navigating } from '$app/state';
	import { page } from '$app/stores';
	import { onDestroy, untrack } from 'svelte';
	import type { Snippet } from 'svelte';
	import Bell from '@lucide/svelte/icons/bell';
	import Building2 from '@lucide/svelte/icons/building-2';
	import Check from '@lucide/svelte/icons/check';
	import ChevronsUpDownIcon from '@lucide/svelte/icons/chevrons-up-down';
	import CircleUser from '@lucide/svelte/icons/circle-user';
	import LogOut from '@lucide/svelte/icons/log-out';
	import Megaphone from '@lucide/svelte/icons/megaphone';
	import MessageSquareText from '@lucide/svelte/icons/message-square-text';
	import Moon from '@lucide/svelte/icons/moon';
	import Settings from '@lucide/svelte/icons/settings';
	import ShieldCheck from '@lucide/svelte/icons/shield-check';
	import Sun from '@lucide/svelte/icons/sun';
	import { MEMBERSHIP_ROLE_LABELS, type CapabilityMap, type MembershipRole } from '$lib/access/memberAccessShape';
	import { formatRelativeDate } from '$lib/utils/dates';
	import { toastStore } from '$lib/stores/toast.svelte';
	import AppShellNavigation from './AppShellNavigation.svelte';
	import { getOrgBreadcrumbs, getOrgNavigation } from './orgNavigation';
	import * as Breadcrumb from '$lib/components/ui/breadcrumb/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import { Separator } from '$lib/components/ui/separator/index.js';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import * as Tooltip from '$lib/components/ui/tooltip/index.js';
	import { IsMobile } from '$lib/hooks/is-mobile.svelte.js';

	interface Props {
		orgId: string;
		userId: string;
		orgUrlSegment?: string;
		orgName: string;
		userRole: MembershipRole;
		membershipId?: string | null;
		capabilityMap: CapabilityMap;
		account: SignedInAccount;
		onToggleTheme: () => void;
		isDarkTheme: boolean;
		onFeedback?: () => void;
		onWhatsNew?: () => void;
		banner?: Snippet;
		children?: Snippet;
	}

	let {
		orgId,
		userId,
		orgUrlSegment = orgId,
		orgName,
		userRole,
		membershipId = null,
		capabilityMap,
		account,
		onToggleTheme,
		isDarkTheme,
		onFeedback,
		onWhatsNew,
		banner,
		children
	}: Props = $props();

	// The mobile drawer leaves no room beside it, so its menus open vertically as in the shadcn sidebar blocks.
	const isMobile = new IsMobile();
	const drawerMenuSide = $derived(isMobile.current ? 'bottom' : 'right');
	let orgSwitcherOpen = $state(false);
	let orgSwitcherOrgs = $state<OrganizationSwitcherOrg[]>([]);
	let orgSwitcherLoaded = $state(false);
	let orgSwitcherLoading = $state(false);
	let orgSwitcherLoadFailed = $state(false);
	let orgSwitcherGeneration = 0;
	let active = true;
	onDestroy(() => {
		active = false;
	});
	let notificationsOpen = $state(false);
	let notifications = $state<Notification[]>([]);
	let notificationsLoaded = $state(false);
	let notificationsLoading = $state(false);
	let notificationsWriting = $state(false);
	let notificationsLoadFailed = $state(false);
	let notificationCountFailed = $state(false);
	let notificationGeneration = 0;
	let notificationCountRequest = 0;
	let notificationCountLoading = $state(false);
	let localUnreadCount = $state(0);
	const notificationScope = $derived(`${userId}/${orgId}/${orgUrlSegment}/${membershipId ?? ''}`);
	const pathname = $derived($page.url.pathname);
	const routeLeafLabel = $derived(
		typeof $page.data?.breadcrumbLabel === 'string' ? $page.data.breadcrumbLabel : undefined
	);
	const allNavItems = $derived(getOrgNavigation(orgUrlSegment, capabilityMap));
	const navItems = $derived(allNavItems.filter((item) => item.visible));
	const settingsPath = $derived(`/org/${orgUrlSegment}/settings`);
	const inSettings = (path: string) => path === settingsPath || path.startsWith(`${settingsPath}/`);
	const accountPath = $derived(`/org/${orgUrlSegment}/account`);
	const inAccount = $derived(pathname.startsWith(`${accountPath}/`));
	const signedInAs = $derived(accountLabel(account));
	// Between settings pages the crumb names the target right away, as the settings nav does.
	const crumbPath = $derived.by(() => {
		const target = navigating.to?.url.pathname;
		return target && inSettings(target) && inSettings(pathname) ? target : pathname;
	});
	const breadcrumbs = $derived(getOrgBreadcrumbs(crumbPath, orgName, allNavItems, routeLeafLabel));
	// A narrow header clips the unit name first, then the crumbs between, and keeps the page name. Flex shrinks in
	// proportion, so a smaller factor on the unit name still clips the others by a fraction of a pixel.
	function crumbClass(index: number, count: number) {
		if (count > 1 && index === 0) return 'min-w-10 shrink-[100000]';
		if (count > 1 && index === count - 1) return 'max-w-3/5 shrink-0';
		return 'min-w-0';
	}
	const activeOrg = $derived({
		...(orgSwitcherOrgs.find((org) => org.id === orgId) ?? { id: orgId, role: userRole, urlSegment: orgUrlSegment }),
		name: orgName
	});
	const visibleOrgs = $derived(
		orgSwitcherLoaded ? orgSwitcherOrgs.map((org) => (org.id === orgId ? activeOrg : org)) : [activeOrg]
	);
	const isMultiOrg = $derived(orgSwitcherLoaded && orgSwitcherOrgs.length > 1);
	const canAccessOrganizationSettings = $derived(userRole === 'owner' || userRole === 'admin');

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

	function submitLogout(event: MouseEvent) {
		event.preventDefault();
		(event.currentTarget as HTMLElement).closest('form')?.requestSubmit();
	}

	function switchOrg(targetOrgId: string, targetOrgUrlSegment: string = targetOrgId) {
		if (targetOrgId === orgId) return;

		const orgPrefix = `/org/${orgUrlSegment}`;
		const suffix = pathname.startsWith(orgPrefix) ? pathname.slice(orgPrefix.length) : '';
		void goto(resolve(`/org/${targetOrgUrlSegment}${suffix}`));
	}

	async function loadOrgSwitcherOrgs() {
		if (orgSwitcherLoaded || orgSwitcherLoading) return;
		const scope = notificationScope;
		const generation = orgSwitcherGeneration;
		const segment = orgUrlSegment;
		const isCurrent = () => active && scope === notificationScope && generation === orgSwitcherGeneration;
		orgSwitcherLoading = true;
		orgSwitcherLoadFailed = false;
		try {
			const response = await fetch(`/org/${segment}/api/app-shell-chrome?part=organization-switcher`);
			if (!response.ok) throw new Error('Could not load organizations');
			const result = await response.json();
			if (!isCurrent()) return;
			if (!result?.ok || !Array.isArray(result.organizations)) throw new Error('Could not load organizations');
			orgSwitcherOrgs = result.organizations;
			orgSwitcherLoaded = true;
		} catch {
			if (isCurrent()) orgSwitcherLoadFailed = true;
		} finally {
			if (isCurrent()) orgSwitcherLoading = false;
		}
	}

	function isCurrentNotificationRequest(scope: string, generation: number) {
		return active && scope === notificationScope && generation === notificationGeneration;
	}

	async function loadUnreadNotificationCount(segment: string, scope: string, generation: number) {
		const request = ++notificationCountRequest;
		notificationCountLoading = true;
		const isCurrent = () => isCurrentNotificationRequest(scope, generation) && request === notificationCountRequest;
		try {
			const response = await fetch(`/org/${segment}/api/app-shell-chrome?part=notification-count`);
			const result = response.ok ? await response.json() : null;
			if (!isCurrent()) return;
			if (result?.ok && typeof result.unreadNotificationCount === 'number') {
				localUnreadCount = result.unreadNotificationCount;
				notificationCountFailed = false;
			} else {
				notificationCountFailed = true;
			}
		} catch {
			if (isCurrent()) {
				localUnreadCount = 0;
				notificationCountFailed = true;
			}
		} finally {
			if (isCurrent()) notificationCountLoading = false;
		}
	}

	async function loadNotifications() {
		if (notificationsLoaded || notificationsLoading) return;
		const scope = notificationScope;
		const generation = notificationGeneration;
		const segment = orgUrlSegment;
		notificationsLoading = true;
		notificationsLoadFailed = false;
		try {
			const response = await fetch(`/org/${segment}/api/notifications`);
			if (!response.ok) throw new Error('Could not load notifications');
			const result = await response.json();
			if (isCurrentNotificationRequest(scope, generation)) {
				notifications = result;
				notificationsLoaded = true;
			}
		} catch {
			if (isCurrentNotificationRequest(scope, generation)) {
				notificationsLoadFailed = true;
				toastStore.error('Could not load notifications. Reopen the bell to retry.');
			}
		} finally {
			if (isCurrentNotificationRequest(scope, generation)) notificationsLoading = false;
		}
	}

	async function markAllNotificationsRead() {
		if (notificationsWriting || !notificationsLoaded) return;
		const scope = notificationScope;
		const generation = notificationGeneration;
		const segment = orgUrlSegment;
		notificationsWriting = true;
		try {
			const response = await fetch(`/org/${segment}/api/notifications`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ markAllRead: true })
			});
			if (!response.ok) throw new Error('Could not mark notifications read');
			if (isCurrentNotificationRequest(scope, generation)) {
				++notificationCountRequest;
				notificationCountLoading = false;
				notifications = notifications.map((notification) => ({ ...notification, read: true }));
				localUnreadCount = 0;
			}
		} catch {
			if (isCurrentNotificationRequest(scope, generation))
				toastStore.error('Could not mark notifications read. Try again.');
		} finally {
			if (isCurrentNotificationRequest(scope, generation)) notificationsWriting = false;
		}
	}

	async function openNotification(notification: Notification) {
		if (notificationsWriting) return;
		const scope = notificationScope;
		const generation = notificationGeneration;
		const segment = orgUrlSegment;
		notificationsOpen = false;

		if (!notification.read) {
			notificationsWriting = true;
			try {
				const response = await fetch(`/org/${segment}/api/notifications`, {
					method: 'PUT',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ id: notification.id })
				});
				if (!response.ok) throw new Error('Could not mark notification read');
				if (isCurrentNotificationRequest(scope, generation)) {
					const countWasLoading = notificationCountLoading;
					++notificationCountRequest;
					notification.read = true;
					localUnreadCount = Math.max(0, localUnreadCount - 1);
					if (countWasLoading) void loadUnreadNotificationCount(segment, scope, generation);
				}
			} catch {
				if (isCurrentNotificationRequest(scope, generation))
					toastStore.error('Could not mark notification read. Reopen the bell to retry.');
				return;
			} finally {
				if (isCurrentNotificationRequest(scope, generation)) notificationsWriting = false;
			}
		}

		if (isCurrentNotificationRequest(scope, generation) && notification.link) {
			void goto(resolve(notification.link as `/org/${string}`));
		}
	}

	$effect(() => {
		// Retire pending organization-switcher requests whenever the admitted actor scope changes.
		void notificationScope;
		++orgSwitcherGeneration;
		orgSwitcherOrgs = [];
		orgSwitcherLoaded = false;
		orgSwitcherLoading = false;
		orgSwitcherLoadFailed = false;
		orgSwitcherOpen = false;
		return () => {
			++orgSwitcherGeneration;
		};
	});

	$effect(() => {
		const scope = notificationScope;
		const generation = ++notificationGeneration;
		notifications = [];
		notificationsLoaded = false;
		notificationsLoading = false;
		notificationsWriting = false;
		notificationsLoadFailed = false;
		notificationCountFailed = false;
		notificationsOpen = false;
		localUnreadCount = 0;
		void loadUnreadNotificationCount(orgUrlSegment, scope, generation);
		return () => {
			++notificationGeneration;
		};
	});

	$effect(() => {
		if (orgSwitcherOpen)
			untrack(() => {
				void loadOrgSwitcherOrgs();
			});
	});

	$effect.pre(() => {
		if (notificationsOpen) {
			untrack(() => {
				void loadNotifications();
				if (notificationCountFailed)
					void loadUnreadNotificationCount(orgUrlSegment, notificationScope, notificationGeneration);
			});
		}
	});
</script>

<Tooltip.Provider>
	<a
		href="#main-content"
		class="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-4 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:shadow-md"
		>Skip to main content</a
	>
	{@render banner?.()}
	<Sidebar.Provider class="below-banner min-h-0 overflow-hidden bg-background">
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
							<DropdownMenu.Content class="w-72" side={drawerMenuSide} align="start">
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
									{#if orgSwitcherLoadFailed}
										<DropdownMenu.Item disabled>Could not load organizations. Reopen to retry.</DropdownMenu.Item>
									{/if}
									{#if orgSwitcherOpen && orgSwitcherLoading}
										<DropdownMenu.Item disabled>Loading organizations...</DropdownMenu.Item>
									{/if}
								</DropdownMenu.Group>
								{#if canAccessOrganizationSettings}
									<DropdownMenu.Separator />
									<DropdownMenu.Item onclick={() => goto(resolve(`/org/${orgUrlSegment}/settings/general`))}>
										<Settings />
										Unit settings
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
						<AppShellNavigation {navItems} {pathname} />
					</Sidebar.GroupContent>
				</Sidebar.Group>
			</Sidebar.Content>

			<Sidebar.Footer>
				<Sidebar.Menu>
					{#if canAccessOrganizationSettings}
						<Sidebar.MenuItem>
							<Sidebar.MenuButton isActive={inSettings(pathname)} tooltipContent="Unit settings">
								{#snippet child({ props })}
									<a
										{...props}
										href={resolve(`/org/${orgUrlSegment}/settings/general`)}
										aria-current={pathname === `/org/${orgUrlSegment}/settings/general` ? 'page' : undefined}
									>
										<Settings />
										<span>Unit settings</span>
									</a>
								{/snippet}
							</Sidebar.MenuButton>
						</Sidebar.MenuItem>
					{/if}
					<Sidebar.MenuItem>
						<DropdownMenu.Root>
							<DropdownMenu.Trigger>
								{#snippet child({ props })}
									<Sidebar.MenuButton
										{...props}
										size="lg"
										isActive={inAccount}
										tooltipContent={signedInAs.name}
										aria-label={`${signedInAs.name}, account menu`}
									>
										<span
											class="hidden aspect-square size-8 items-center justify-center rounded-md border bg-muted text-xs font-medium group-data-[collapsible=icon]:flex"
											aria-hidden="true"
										>
											{signedInAs.initials}
										</span>
										<span class="grid flex-1 gap-0.5 text-left leading-tight">
											<span class="truncate text-sm font-medium">{signedInAs.name}</span>
											<span class="truncate font-mono text-[11px] tracking-[0.04em] text-muted-foreground"
												>Your account</span
											>
										</span>
									</Sidebar.MenuButton>
								{/snippet}
							</DropdownMenu.Trigger>
							<DropdownMenu.Content class="w-64" side={drawerMenuSide} align="end">
								<DropdownMenu.Label class="grid gap-0.5">
									<span class="truncate text-sm font-medium text-foreground" title={signedInAs.name}
										>{signedInAs.name}</span
									>
									{#if account.email && account.email !== signedInAs.name}
										<span class="truncate font-normal" title={account.email}>{account.email}</span>
									{/if}
									<span class="truncate font-normal">{MEMBERSHIP_ROLE_LABELS[userRole]} · {orgName}</span>
								</DropdownMenu.Label>
								<DropdownMenu.Separator />
								<DropdownMenu.Group>
									<DropdownMenu.Item>
										{#snippet child({ props })}
											<a {...props} href={resolve(`/org/${orgUrlSegment}/account/profile`)}>
												<CircleUser />
												Account
											</a>
										{/snippet}
									</DropdownMenu.Item>
									{#if account.hasTwoFactor === false}
										<DropdownMenu.Item class="items-start">
											{#snippet child({ props })}
												<a {...props} href={mfaSetupHref(orgUrlSegment)}>
													<ShieldCheck class="mt-0.5" />
													<span class="grid gap-0.5">
														Turn on two-factor
														<span class="text-xs text-muted-foreground">A code from your phone at sign-in</span>
													</span>
												</a>
											{/snippet}
										</DropdownMenu.Item>
									{/if}
								</DropdownMenu.Group>
								{#if onWhatsNew || onFeedback}
									<DropdownMenu.Separator />
									<DropdownMenu.Group>
										{#if onWhatsNew}
											<DropdownMenu.Item onclick={onWhatsNew}>
												<Megaphone />
												What's new
											</DropdownMenu.Item>
										{/if}
										{#if onFeedback}
											<DropdownMenu.Item onclick={onFeedback}>
												<MessageSquareText />
												Send feedback
											</DropdownMenu.Item>
										{/if}
									</DropdownMenu.Group>
								{/if}
								<DropdownMenu.Separator />
								<form method="POST" action={resolve('/auth/logout')}>
									<DropdownMenu.Item variant="destructive" onclick={submitLogout}>
										<LogOut />
										Sign out
									</DropdownMenu.Item>
								</form>
							</DropdownMenu.Content>
						</DropdownMenu.Root>
					</Sidebar.MenuItem>
				</Sidebar.Menu>
			</Sidebar.Footer>
			<Sidebar.Rail />
		</Sidebar.Root>

		<Sidebar.Inset>
			<header
				class="sticky top-0 z-10 flex h-14 min-w-0 shrink-0 items-center gap-2 border-b bg-background px-4"
				data-print-chrome
			>
				<Sidebar.Trigger />
				<Separator orientation="vertical" class="h-4" />
				<Breadcrumb.Root class="min-w-0 flex-1" aria-label="Current section">
					<Breadcrumb.List class="flex-nowrap overflow-hidden">
						{#each breadcrumbs as crumb, index (`${crumb.label}:${index}`)}
							<Breadcrumb.Item class={crumbClass(index, breadcrumbs.length)}>
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
										<Button
											variant="ghost"
											size="xs"
											onclick={markAllNotificationsRead}
											disabled={notificationsWriting || !notificationsLoaded}>Mark all read</Button
										>
									{/if}
								</span>
							</DropdownMenu.Label>
							<DropdownMenu.Separator />
							{#if notificationsLoading}
								<DropdownMenu.Item disabled>Loading notifications...</DropdownMenu.Item>
							{:else if notificationsLoadFailed}
								<DropdownMenu.Item disabled>Could not load notifications. Reopen to retry.</DropdownMenu.Item>
							{:else if notifications.length === 0}
								<DropdownMenu.Item disabled>
									{notificationCountLoading
										? 'Loading notifications...'
										: notificationCountFailed
											? 'Could not load notifications. Reopen to retry.'
											: 'No notifications'}
								</DropdownMenu.Item>
							{:else}
								{#each notifications as notification (notification.id)}
									<DropdownMenu.Item onclick={() => openNotification(notification)} disabled={notificationsWriting}>
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
						<Tooltip.Trigger onclick={onToggleTheme}>
							{#snippet child({ props })}
								<Button {...props} variant="ghost" size="icon" aria-label="Toggle theme">
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

			<main
				id="main-content"
				tabindex="-1"
				class="min-h-0 w-full min-w-0 flex-1 overflow-x-hidden overflow-y-auto bg-background outline-none"
			>
				{@render children?.()}
			</main>
		</Sidebar.Inset>
	</Sidebar.Provider>
</Tooltip.Provider>
