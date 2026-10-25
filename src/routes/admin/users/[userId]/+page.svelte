<script lang="ts">
	import { onDestroy } from 'svelte';
	import { Button } from '$lib/components/ui/button';
	import { enhance } from '$app/forms';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { beforeNavigate, invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { formatDisplayDate, formatDisplayDateTime } from '$lib/utils/dates';
	import * as Alert from '$lib/components/ui/alert';
	import { Badge } from '$lib/components/ui/badge';
	import SuspendModal from '$features/platform-admin/components/SuspendModal.svelte';
	import { adminBadgeVariant, formatAdminLabel } from '$features/platform-admin/components/adminTheme';
	import * as Card from '$lib/components/ui/card';
	import * as Empty from '$lib/components/ui/empty';
	import * as PageShell from '$lib/components/patterns/page-shell';
	import {
		WorkspaceToolbar,
		type ToolbarItem,
		type WorkspaceToolbarProps
	} from '$lib/components/patterns/workspace-toolbar';
	import * as Table from '$lib/components/ui/table';
	import { toastStore } from '$lib/stores/toast.svelte';
	import { settleAction } from '$lib/utils/settleAction';

	let { data } = $props();

	let showSuspendModal = $state(false);
	let sendingReset = $state(false);
	let sendingInvite = $state(false);
	let emailError = $state<string | null>(null);
	let resetForm = $state<HTMLFormElement | null>(null);
	let inviteForm = $state<HTMLFormElement | null>(null);
	let navigationLifetime = $state(0);
	const canSuspend = $derived(data.canSuspend);

	beforeNavigate(() => {
		navigationLifetime += 1;
		showSuspendModal = false;
		sendingReset = false;
		sendingInvite = false;
		emailError = null;
	});
	onDestroy(() => {
		navigationLifetime += 1;
	});

	async function reloadSuspension(lifetime: number, targetId: string): Promise<boolean> {
		if (targetId !== data.user.id || lifetime !== navigationLifetime) throw new Error('User is no longer current');
		await invalidateAll();
		if (targetId !== data.user.id || lifetime !== navigationLifetime) throw new Error('User is no longer current');
		if (typeof data.isSuspended !== 'boolean') throw new Error('User state could not be refreshed');
		return data.isSuspended;
	}

	const accountEmailEnhance =
		(kind: 'reset' | 'invite'): SubmitFunction =>
		({ cancel, submitter }) => {
			if (kind === 'reset' ? sendingReset : sendingInvite) {
				cancel();
				return;
			}
			const lifetime = navigationLifetime;
			const targetId = data.user.id;
			const isCurrent = () => lifetime === navigationLifetime && targetId === data.user.id;
			emailError = null;
			if (kind === 'reset') sendingReset = true;
			else sendingInvite = true;
			return async (outcome) => {
				const { result } = outcome;
				await settleAction(outcome, {
					isCurrent,
					settled: (error) => {
						if (kind === 'reset') sendingReset = false;
						else sendingInvite = false;
						if (result.type === 'failure' || result.type === 'error')
							emailError =
								result.type === 'failure' && typeof result.data?.error === 'string'
									? result.data.error
									: 'The email could not be sent.';
						else if (error)
							emailError =
								'Account details could not be refreshed. Check the current account before sending another email.';
						else if (result.type === 'success' && typeof result.data?.message === 'string')
							toastStore.success(result.data.message);
					},
					focus: () => [submitter, toolbarControlOrMore(kind === 'reset' ? 'reset-password' : 'resend-invite')]
				});
			};
		};

	function toolbarControlOrMore(id: string): HTMLElement | null {
		const toolbar = document.querySelector(`[data-slot="workspace-toolbar"][aria-label="${toolbarLabel}"]`);
		return (
			toolbar?.querySelector<HTMLElement>(`[data-toolbar-row] [data-toolbar-item="${id}"] button`) ??
			toolbar?.querySelector<HTMLElement>('[data-toolbar-more] button') ??
			null
		);
	}

	async function handleSuspendComplete(lifetime: number, targetId: string, isSuspended: boolean) {
		if (targetId !== data.user.id || lifetime !== navigationLifetime) return;
		if ((await reloadSuspension(lifetime, targetId)) !== isSuspended)
			throw new Error('User state could not be refreshed');
		if (targetId !== data.user.id || lifetime !== navigationLifetime) return;
		showSuspendModal = false;
		toastStore.success(isSuspended ? 'User suspended' : 'User unsuspended');
	}

	const toolbarLabel = 'User controls';
	const toolbarItems = $derived.by<ToolbarItem[]>(() => {
		const items: ToolbarItem[] = [];
		if (data.user.emailConfirmationStatus === 'pending') {
			items.push({
				kind: 'action',
				id: 'resend-invite',
				label: 'Resend Invite',
				loading: sendingInvite,
				onclick: () => inviteForm?.requestSubmit()
			});
		}
		items.push({
			kind: 'action',
			id: 'suspend',
			label: data.isSuspended ? 'Unsuspend User' : 'Suspend User',
			destructive: !data.isSuspended,
			menuOnly: canSuspend,
			disabled: !canSuspend,
			disabledReason: data.suspendDisabledReason ?? undefined,
			onclick: () => (showSuspendModal = true)
		});
		return items;
	});
	const toolbarPrimary = $derived<WorkspaceToolbarProps['primary']>({
		kind: 'action',
		id: 'reset-password',
		label: 'Send Password Reset',
		loading: sendingReset,
		onclick: () => resetForm?.requestSubmit()
	});

	const emailConfirmationLabel = $derived(data.user.emailConfirmationStatus === 'confirmed' ? 'Confirmed' : 'Pending');
	const emailConfirmationDetail = $derived(
		data.user.emailConfirmedAt
			? `Confirmed ${formatDisplayDateTime(data.user.emailConfirmedAt)}`
			: 'No email confirmation timestamp is available.'
	);
</script>

<svelte:head>
	<title>User Details - Admin - Troop to Task</title>
</svelte:head>

<PageShell.Root width="wide" density="compact">
	<PageShell.Header
		title={data.user.email}
		subtitle={`Joined ${formatDisplayDate(data.user.createdAt)} - ${
			data.user.lastSignInAt ? `Last sign-in ${formatDisplayDateTime(data.user.lastSignInAt)}` : 'Never signed in'
		}`}
	>
		{#snippet back()}
			<Button href="/admin/users" variant="ghost" size="sm">Back to Users</Button>
		{/snippet}
		{#snippet meta()}
			<Badge variant="secondary">Identity Record</Badge>
			<Badge variant={data.user.emailConfirmationStatus === 'confirmed' ? 'success' : 'warning'}>
				Email {data.user.emailConfirmationStatus}
			</Badge>
			<Badge variant={adminBadgeVariant(data.isSuspended ? 'suspended' : 'active')}>
				{data.isSuspended ? 'Suspended' : 'Active'}
			</Badge>
		{/snippet}
	</PageShell.Header>

	<PageShell.FactGrid layout="three">
		<PageShell.Metric label="User ID" value={data.user.id} class="[&_strong]:font-mono [&_strong]:text-sm" />
		<PageShell.Metric
			label="Organizations"
			value={data.organizations.length}
			detail="Organizations where this account currently holds membership."
		/>
		<PageShell.Metric label="Email Confirmation" value={emailConfirmationLabel} detail={emailConfirmationDetail} />
	</PageShell.FactGrid>

	<WorkspaceToolbar ariaLabel={toolbarLabel} items={toolbarItems} primary={toolbarPrimary} />
	{#if data.suspendDisabledReason}
		<p class="text-sm text-muted-foreground">{data.suspendDisabledReason}</p>
	{/if}
	<form
		bind:this={resetForm}
		method="POST"
		action="?/resetPassword"
		use:enhance={accountEmailEnhance('reset')}
		hidden
	></form>
	{#if data.user.emailConfirmationStatus === 'pending'}
		<form
			bind:this={inviteForm}
			method="POST"
			action="?/resendInvite"
			use:enhance={accountEmailEnhance('invite')}
			hidden
		></form>
	{/if}

	{#if emailError}
		<Alert.Root variant="destructive">
			<Alert.Description>{emailError}</Alert.Description>
		</Alert.Root>
	{/if}

	<div class="grid gap-4 xl:grid-cols-2">
		<Card.Root>
			<Card.Header>
				<Card.Title>Organizations</Card.Title>
				<Card.Description>Memberships and personnel counts for this account.</Card.Description>
			</Card.Header>
			<Card.Content class="overflow-x-auto">
				<Table.Root>
					<Table.Header>
						<Table.Row>
							<Table.Head>Name</Table.Head>
							<Table.Head>Role</Table.Head>
							<Table.Head>Personnel</Table.Head>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each data.organizations as org (org.id)}
							<Table.Row>
								<Table.Cell>
									{#if org.id}
										<a
											href={resolve(`/admin/organizations/${org.id}`)}
											class="text-sm font-medium underline-offset-4 hover:underline">{org.name}</a
										>
									{:else}
										{org.name}
									{/if}
								</Table.Cell>
								<Table.Cell
									><Badge variant={adminBadgeVariant(org.role)}>{formatAdminLabel(org.role)}</Badge></Table.Cell
								>
								<Table.Cell>{org.personnelCount}</Table.Cell>
							</Table.Row>
						{:else}
							<Table.Row>
								<Table.Cell colspan={3}>
									<Empty.Root class="border-0">No organizations.</Empty.Root>
								</Table.Cell>
							</Table.Row>
						{/each}
					</Table.Body>
				</Table.Root>
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title>Recent Activity</Card.Title>
				<Card.Description>Latest audit events tied to this identity.</Card.Description>
			</Card.Header>
			<Card.Content class="overflow-x-auto">
				<Table.Root>
					<Table.Header>
						<Table.Row>
							<Table.Head>Timestamp</Table.Head>
							<Table.Head>Action</Table.Head>
							<Table.Head>Resource</Table.Head>
							<Table.Head>Org</Table.Head>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each data.recentActivity as event (event.id)}
							<Table.Row>
								<Table.Cell class="font-mono text-xs text-muted-foreground"
									>{formatDisplayDateTime(event.timestamp)}</Table.Cell
								>
								<Table.Cell><span class="font-mono text-xs">{event.action}</span></Table.Cell>
								<Table.Cell class="text-muted-foreground">
									{event.resourceType}{event.resourceId ? ` - ${event.resourceId.slice(0, 8)}...` : ''}
								</Table.Cell>
								<Table.Cell class="text-muted-foreground"
									>{event.orgId ? `${event.orgId.slice(0, 8)}...` : '-'}</Table.Cell
								>
							</Table.Row>
						{:else}
							<Table.Row>
								<Table.Cell colspan={4}>
									<Empty.Root class="border-0">No recent activity.</Empty.Root>
								</Table.Cell>
							</Table.Row>
						{/each}
					</Table.Body>
				</Table.Root>
			</Card.Content>
		</Card.Root>
	</div>
</PageShell.Root>

{#if canSuspend && showSuspendModal}
	<SuspendModal
		type="user"
		targetId={data.user.id}
		targetName={data.user.email}
		isSuspended={data.isSuspended}
		onClose={() => (showSuspendModal = false)}
		onComplete={handleSuspendComplete.bind(null, navigationLifetime)}
		onReload={reloadSuspension.bind(null, navigationLifetime)}
	/>
{/if}
