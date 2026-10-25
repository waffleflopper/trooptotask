<script lang="ts">
	import { onDestroy, tick } from 'svelte';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { getAppShellContext } from '$features/app-shell';
	import { ACCOUNT_PAGES } from '$features/identity/AccountShell.svelte';
	import { notificationHref } from '$features/notifications';
	import type { Notification } from '$features/notifications/contracts';
	import * as PageShell from '$lib/components/patterns/page-shell/index.js';
	import { WorkspaceToolbar, type ToolbarItem } from '$lib/components/patterns/workspace-toolbar';
	import { Button } from '$lib/components/ui/button';
	import { ConfirmDialog } from '$lib/components/ui/confirm-dialog';
	import { toastStore } from '$lib/stores/toast.svelte';
	import { formatRelativeDate } from '$lib/utils/dates';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const shell = getAppShellContext();
	let active = true;
	onDestroy(() => {
		active = false;
	});

	let notifications = $derived(data.notifications);
	let pending = $state<'markAll' | 'deleteAll' | { id: string } | null>(null);
	let confirmingDeleteAll = $state(false);
	let list = $state<HTMLUListElement>();
	let summary = $state<HTMLParagraphElement>();
	const unread = $derived(notifications.filter((notification) => !notification.read).length);

	/** Sends one command for the Organization the page was in, and reports whether the page may apply its result. */
	async function send(method: 'PUT' | 'DELETE', body: object, failure: string): Promise<boolean> {
		const orgId = shell.orgId;
		const isCurrent = () => active && shell.orgId === orgId;
		try {
			const response = await fetch(`/org/${shell.orgUrlSegment}/api/notifications`, {
				method,
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body)
			});
			if (!response.ok) throw new Error(failure);
			// Opening a linked item leaves this page first, and the bell still needs the new count.
			if (shell.orgId === orgId) shell.refreshNotifications();
			return isCurrent();
		} catch {
			if (isCurrent()) toastStore.error(failure);
			return false;
		}
	}

	async function run(kind: NonNullable<typeof pending>, write: () => Promise<boolean>, apply: () => void) {
		if (pending) return;
		pending = kind;
		const ok = await write();
		if (!active) return;
		pending = null;
		if (ok) apply();
	}

	function open(notification: Notification) {
		if (notification.link) void goto(resolve(notificationHref(notification.link, shell.orgUrlSegment)));
		if (notification.read || pending) return;
		void run(
			{ id: notification.id },
			() => send('PUT', { id: notification.id }, 'Could not mark the notification read.'),
			() =>
				(notifications = notifications.map((item) => (item.id === notification.id ? { ...item, read: true } : item)))
		);
	}

	async function remove(notification: Notification) {
		const index = notifications.findIndex((item) => item.id === notification.id);
		await run(
			{ id: notification.id },
			() => send('DELETE', { id: notification.id }, 'Could not delete the notification. Try again.'),
			() => (notifications = notifications.filter((item) => item.id !== notification.id))
		);
		await tick();
		// Disabling or removing the pressed button dropped focus; give it to the row that took its place.
		if (!active || document.activeElement !== document.body) return;
		const buttons = Array.from(list?.querySelectorAll<HTMLElement>('[data-delete-notification]') ?? []);
		(buttons[Math.min(index, buttons.length - 1)] ?? summary)?.focus();
	}

	const markAllRead = () =>
		run(
			'markAll',
			() => send('PUT', { markAllRead: true }, 'Could not mark notifications read. Try again.'),
			() => (notifications = notifications.map((notification) => ({ ...notification, read: true })))
		);

	async function deleteAll() {
		await run(
			'deleteAll',
			() => send('DELETE', { deleteAll: true }, 'Could not delete notifications. Try again.'),
			() => (notifications = [])
		);
		if (active && notifications.length === 0) confirmingDeleteAll = false;
	}

	const busyId = $derived(typeof pending === 'object' && pending ? pending.id : null);
	const toolbarItems = $derived<ToolbarItem[]>([
		{
			kind: 'action',
			id: 'mark-all-read',
			label: 'Mark all read',
			icon: 'circle-check',
			onclick: markAllRead,
			loading: pending === 'markAll',
			disabled: unread === 0 || pending !== null,
			disabledReason: unread === 0 ? 'Nothing is unread.' : undefined
		},
		{
			kind: 'action',
			id: 'delete-all',
			label: 'Delete all',
			destructive: true,
			menuOnly: true,
			onclick: () => (confirmingDeleteAll = true),
			disabled: notifications.length === 0 || pending !== null,
			disabledReason: notifications.length === 0 ? 'There is nothing to delete.' : undefined
		}
	]);
</script>

{#snippet body(notification: Notification)}
	<span class="text-[15px] leading-5 wrap-anywhere {notification.read ? 'font-medium' : 'font-semibold'}">
		{notification.title}
	</span>
	{#if notification.message}
		<span class="text-sm leading-5 wrap-anywhere text-muted-foreground">{notification.message}</span>
	{/if}
	<span class="font-mono text-xs leading-4 text-muted-foreground">
		{formatRelativeDate(notification.created_at)}{notification.read ? '' : ' · Unread'}
	</span>
{/snippet}

<div class="grid gap-7">
	<PageShell.Header
		eyebrow="Account · Only you"
		title={ACCOUNT_PAGES.notifications.label}
		variant="display"
		subtitle={ACCOUNT_PAGES.notifications.subtitle}
	/>

	<div class="grid gap-4">
		<div class="flex min-h-8 flex-wrap items-center justify-between gap-x-3 gap-y-2">
			<p bind:this={summary} class="text-sm text-muted-foreground outline-none" tabindex="-1" aria-live="polite">
				{unread} unread of {notifications.length}
			</p>
			<div class="min-w-0 flex-1 basis-48">
				<WorkspaceToolbar ariaLabel="Notifications" items={toolbarItems} bare />
			</div>
		</div>

		{#if notifications.length > 0}
			<ul bind:this={list} class="border-t-2 border-foreground">
				{#each notifications as notification (notification.id)}
					<li class="flex items-start gap-3 border-b border-border py-4">
						<span
							class="mt-1.5 size-2 shrink-0 rounded-full {notification.read ? 'bg-transparent' : 'bg-accent'}"
							aria-hidden="true"
						></span>
						{#if notification.link || !notification.read}
							<button
								type="button"
								class="grid min-w-0 flex-1 gap-2 rounded-sm text-left outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 disabled:no-underline"
								disabled={busyId === notification.id}
								onclick={() => open(notification)}
							>
								{@render body(notification)}
							</button>
						{:else}
							<div class="grid min-w-0 flex-1 gap-2">{@render body(notification)}</div>
						{/if}
						<Button
							variant="ghost-destructive"
							size="icon-sm"
							aria-label={`Delete notification: ${notification.title}`}
							disabled={pending !== null}
							data-delete-notification
							onclick={() => remove(notification)}
						>
							<Trash2 />
						</Button>
					</li>
				{/each}
			</ul>
		{:else}
			<p class="border-t-2 border-foreground pt-5 text-sm text-muted-foreground">
				No notifications. Replies to your feedback and updates from your unit show up here.
			</p>
		{/if}
	</div>
</div>

{#if confirmingDeleteAll}
	<ConfirmDialog
		title="Delete all notifications?"
		message="This removes every notification here, read or not. It cannot be undone."
		confirmLabel="Delete all"
		onConfirm={deleteAll}
		onCancel={() => (confirmingDeleteAll = false)}
	/>
{/if}
