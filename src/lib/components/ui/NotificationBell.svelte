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
	let localUnreadCount = $derived(unreadCount);

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
		class:open
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
				<div class="dropdown-actions">
					{#if localUnreadCount > 0}
						<button class="mark-all-btn" type="button" onclick={markAllRead}> Mark all read </button>
					{/if}
					{#if notifications.length > 0}
						<button class="mark-all-btn clear-all-btn" type="button" onclick={dismissAll}> Clear all </button>
					{/if}
				</div>
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
		width: 2.25rem;
		height: 2.25rem;
		border: 1px solid var(--color-chrome-border);
		background: rgba(240, 239, 233, 0.03);
		color: var(--color-chrome-text-muted);
		cursor: pointer;
		border-radius: var(--radius-md);
		transition:
			color var(--transition-fast),
			border-color var(--transition-fast),
			background var(--transition-fast);
		padding: 0;
	}

	.bell-button:hover {
		color: var(--color-chrome-text);
		border-color: rgba(240, 239, 233, 0.16);
		background: rgba(240, 239, 233, 0.06);
	}

	.bell-button.open {
		color: var(--color-chrome-active);
		border-color: rgba(var(--amber-rgb), 0.42);
		background: rgba(var(--amber-rgb), 0.08);
	}

	.badge-count {
		position: absolute;
		top: -4px;
		right: -4px;
		min-width: 18px;
		height: 18px;
		padding: 0 4px;
		background: var(--color-error, #ef4444);
		color: var(--white);
		font-family: var(--font-mono);
		font-size: 9px;
		font-weight: var(--font-weight-semibold);
		line-height: 18px;
		text-align: center;
		border: 1px solid var(--color-chrome);
		border-radius: 999px;
		pointer-events: none;
	}

	.dropdown {
		position: absolute;
		top: calc(100% + var(--sp-2));
		right: 0;
		width: min(360px, calc(100vw - 2rem));
		max-height: 400px;
		background: var(--surface-panel);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-md);
		z-index: 1000;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.dropdown-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--sp-2) var(--sp-4);
		border-bottom: 1px solid var(--border-default);
		flex-shrink: 0;
		gap: var(--sp-2);
	}

	.dropdown-title {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-medium);
		letter-spacing: var(--letter-spacing-mono);
		text-transform: uppercase;
		color: var(--text-secondary);
	}

	.dropdown-actions {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		justify-content: flex-end;
		gap: var(--sp-2);
	}

	.mark-all-btn {
		border: none;
		background: none;
		color: var(--amber-dark);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		letter-spacing: var(--letter-spacing-mono);
		text-transform: uppercase;
		cursor: pointer;
		padding: 2px 0;
		border-radius: var(--radius-sm);
	}

	.mark-all-btn:hover {
		color: var(--amber);
	}

	.clear-all-btn {
		color: var(--text-tertiary);
	}

	.dropdown-body {
		overflow-y: auto;
		flex: 1;
	}

	.dropdown-empty {
		padding: var(--sp-8) var(--sp-4);
		text-align: center;
		color: var(--text-tertiary);
		font-size: var(--text-sm);
	}

	.notification-item {
		display: flex;
		align-items: flex-start;
		gap: var(--sp-2);
		padding: var(--sp-2) var(--sp-4);
		border-bottom: 1px solid var(--divider-color);
		transition: background var(--transition-fast);
	}

	.notification-item:last-child {
		border-bottom: none;
	}

	.notification-item.unread {
		background: rgba(var(--amber-rgb), 0.06);
		box-shadow: inset 2px 0 0 var(--amber);
	}

	.notification-content {
		flex: 1;
		min-width: 0;
	}

	.notification-title {
		display: block;
		font-size: var(--text-sm);
		font-weight: var(--font-weight-semibold);
		color: var(--text-primary);
		text-decoration: none;
		line-height: 1.3;
	}

	a.notification-title:hover {
		color: var(--amber-dark);
	}

	.notification-message {
		margin: 2px 0 0;
		font-size: var(--text-xs);
		color: var(--text-secondary);
		line-height: 1.4;
	}

	.notification-time {
		display: inline-block;
		margin-top: var(--sp-1);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		color: var(--text-tertiary);
		letter-spacing: 0.04em;
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
		color: var(--text-tertiary);
		cursor: pointer;
		border-radius: var(--radius-sm);
		padding: 0;
		margin-top: 2px;
	}

	.dismiss-btn:hover {
		color: var(--color-error, #ef4444);
		background: var(--surface-subtle);
	}
</style>
