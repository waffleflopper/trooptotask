<script lang="ts">
	import { formatRelativeDate } from '$lib/utils/dates';

	interface Notification {
		id: string;
		title: string;
		message: string | null;
		link: string | null;
		read: boolean;
		created_at: string;
	}

	interface Props {
		orgId: string;
		unreadCount: number;
	}

	let { orgId, unreadCount }: Props = $props();

	let open = $state(false);
	let notifications = $state<Notification[]>([]);
	let loaded = $state(false);
	let loading = $state(false);
	let localUnreadCount = $state(0);

	$effect(() => {
		localUnreadCount = unreadCount;
	});

	async function loadNotifications() {
		if (loaded || loading) return;
		loading = true;
		try {
			const res = await fetch(`/org/${orgId}/api/notifications`);
			if (res.ok) {
				notifications = await res.json();
				loaded = true;
			}
		} finally {
			loading = false;
		}
	}

	function toggle() {
		open = !open;
		if (open && !loaded) {
			loadNotifications();
		}
	}

	function close() {
		open = false;
	}

	async function markAllRead() {
		const res = await fetch(`/org/${orgId}/api/notifications`, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ markAllRead: true })
		});
		if (res.ok) {
			notifications = notifications.map((n) => ({ ...n, read: true }));
			localUnreadCount = 0;
		}
	}

	async function handleLinkClick(notification: Notification) {
		close();
		if (!notification.read) {
			notification.read = true;
			localUnreadCount = Math.max(0, localUnreadCount - 1);
			await fetch(`/org/${orgId}/api/notifications`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id: notification.id })
			});
		}
	}

	async function dismissAll() {
		const res = await fetch(`/org/${orgId}/api/notifications`, {
			method: 'DELETE',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ deleteAll: true })
		});
		if (res.ok) {
			notifications = [];
			localUnreadCount = 0;
		}
	}

	async function dismiss(id: string) {
		const res = await fetch(`/org/${orgId}/api/notifications`, {
			method: 'DELETE',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ id })
		});
		if (res.ok) {
			const removed = notifications.find((n) => n.id === id);
			notifications = notifications.filter((n) => n.id !== id);
			if (removed && !removed.read) {
				localUnreadCount = Math.max(0, localUnreadCount - 1);
			}
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape' && open) {
			open = false;
		}
	}

	function handleClickOutside(event: MouseEvent) {
		const target = event.target as HTMLElement;
		if (!target.closest('.notification-bell-wrapper')) {
			close();
		}
	}

	let dropdownEl = $state<HTMLDivElement | null>(null);

	$effect(() => {
		if (open) {
			document.addEventListener('click', handleClickOutside, true);
			// Focus first interactive element in dropdown
			setTimeout(() => {
				const firstFocusable = dropdownEl?.querySelector<HTMLElement>('a[href], button:not([disabled])');
				firstFocusable?.focus();
			}, 0);
			return () => document.removeEventListener('click', handleClickOutside, true);
		}
	});
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="notification-bell-wrapper">
	<button
		class="bell-button"
		type="button"
		onclick={toggle}
		aria-label={localUnreadCount > 0 ? `Notifications, ${localUnreadCount} unread` : 'Notifications'}
		aria-expanded={open}
		aria-haspopup="true"
	>
		<svg
			xmlns="http://www.w3.org/2000/svg"
			width="20"
			height="20"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
			stroke-linejoin="round"
		>
			<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
			<path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
		</svg>
		{#if localUnreadCount > 0}
			<span class="badge-count">{localUnreadCount > 9 ? '9+' : localUnreadCount}</span>
		{/if}
	</button>

	{#if open}
		<div class="dropdown" role="region" aria-label="Notifications" bind:this={dropdownEl}>
			<div class="dropdown-header">
				<span class="dropdown-title">Notifications</span>
				{#if localUnreadCount > 0}
					<button class="mark-all-btn" type="button" onclick={markAllRead}> Mark all read </button>
				{/if}
				{#if notifications.length > 0}
					<button class="mark-all-btn clear-all-btn" type="button" onclick={dismissAll}> Clear all </button>
				{/if}
			</div>
			<div class="dropdown-body">
				{#if loading}
					<div class="dropdown-empty">Loading...</div>
				{:else if notifications.length === 0}
					<div class="dropdown-empty">No notifications</div>
				{:else}
					{#each notifications as notification (notification.id)}
						<div class="notification-item" class:unread={!notification.read}>
							<div class="notification-content">
								{#if notification.link}
									<a href={notification.link} class="notification-title" onclick={() => handleLinkClick(notification)}>
										{notification.title}
									</a>
								{:else}
									<span class="notification-title">{notification.title}</span>
								{/if}
								{#if notification.message}
									<p class="notification-message">{notification.message}</p>
								{/if}
								<span class="notification-time">{formatRelativeDate(notification.created_at)}</span>
							</div>
							<button
								class="dismiss-btn"
								type="button"
								onclick={() => dismiss(notification.id)}
								aria-label="Dismiss: {notification.title}"
							>
								<svg
									xmlns="http://www.w3.org/2000/svg"
									width="14"
									height="14"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
									stroke-linecap="round"
									stroke-linejoin="round"
								>
									<polyline points="3 6 5 6 21 6"></polyline>
									<path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
								</svg>
							</button>
						</div>
					{/each}
				{/if}
			</div>
		</div>
	{/if}
</div>

<style>
	.notification-bell-wrapper {
		position: relative;
	}

	.bell-button {
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		border: none;
		background: transparent;
		color: var(--color-chrome-text-muted);
		cursor: pointer;
		border-radius: var(--radius-sm);
		transition: color var(--transition-fast);
		padding: 0;
	}

	.bell-button:hover {
		color: var(--color-chrome-text);
	}

	.badge-count {
		position: absolute;
		top: 2px;
		right: 2px;
		min-width: 16px;
		height: 16px;
		padding: 0 4px;
		background: var(--color-error, #ef4444);
		color: white;
		font-size: 10px;
		font-weight: 700;
		line-height: 16px;
		text-align: center;
		border-radius: var(--radius-full);
		pointer-events: none;
	}

	.dropdown {
		position: absolute;
		top: calc(100% + var(--spacing-sm));
		right: 0;
		width: 320px;
		max-height: 400px;
		background: var(--color-surface, #fff);
		border: 1px solid var(--color-border, #e0e0e0);
		border-radius: var(--radius-md);
		box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
		z-index: 1000;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.dropdown-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--spacing-sm) var(--spacing-md);
		border-bottom: 1px solid var(--color-border, #e0e0e0);
		flex-shrink: 0;
	}

	.dropdown-title {
		font-size: var(--font-size-base);
		font-weight: 600;
		color: var(--color-text);
	}

	.mark-all-btn {
		border: none;
		background: none;
		color: var(--color-primary);
		font-size: var(--font-size-sm);
		cursor: pointer;
		padding: 2px 4px;
		border-radius: var(--radius-sm);
	}

	.mark-all-btn:hover {
		text-decoration: underline;
	}

	.clear-all-btn {
		color: var(--color-text-muted);
	}

	.dropdown-body {
		overflow-y: auto;
		flex: 1;
	}

	.dropdown-empty {
		padding: var(--spacing-xl) var(--spacing-md);
		text-align: center;
		color: var(--color-text-muted);
		font-size: var(--font-size-sm);
	}

	.notification-item {
		display: flex;
		align-items: flex-start;
		gap: var(--spacing-sm);
		padding: var(--spacing-sm) var(--spacing-md);
		border-bottom: 1px solid var(--color-divider, #f0f0f0);
		transition: background var(--transition-fast);
	}

	.notification-item:last-child {
		border-bottom: none;
	}

	.notification-item.unread {
		background: rgba(var(--color-primary-rgb), var(--opacity-subtle));
	}

	.notification-content {
		flex: 1;
		min-width: 0;
	}

	.notification-title {
		display: block;
		font-size: var(--font-size-sm);
		font-weight: 600;
		color: var(--color-text);
		text-decoration: none;
		line-height: 1.3;
	}

	a.notification-title:hover {
		text-decoration: underline;
		color: var(--color-primary);
	}

	.notification-message {
		margin: 2px 0 0;
		font-size: var(--font-size-xs);
		color: var(--color-text-secondary);
		line-height: 1.4;
	}

	.notification-time {
		font-size: var(--font-size-xs);
		color: var(--color-text-muted);
	}

	.dismiss-btn {
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 24px;
		height: 24px;
		border: none;
		background: transparent;
		color: var(--color-text-muted);
		cursor: pointer;
		border-radius: var(--radius-sm);
		padding: 0;
		margin-top: 2px;
	}

	.dismiss-btn:hover {
		color: var(--color-error, #ef4444);
		background: var(--color-surface-variant, #f5f5f5);
	}
</style>
