<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import { formatDisplayDate, formatDisplayDateTime } from '$lib/utils/dates';
	import { Badge } from '$lib/components/ui/badge';
	import { Spinner } from '$lib/components/ui/spinner';
	import SuspendModal from '$lib/components/admin/SuspendModal.svelte';
	import { adminBadgeVariant, formatAdminLabel } from '$lib/components/admin/adminTheme';
	import * as Alert from '$lib/components/ui/alert';
	import * as Card from '$lib/components/ui/card';
	import * as Empty from '$lib/components/ui/empty';
	import * as PageShell from '$lib/components/ui/page-shell';
	import * as Table from '$lib/components/ui/table';

	let { data, form } = $props();

	let showSuspendModal = $state(false);
	let sendingReset = $state(false);
	let sendingInvite = $state(false);
	let toastMessage = $state<string | null>(null);
	let toastError = $state<string | null>(null);

	function showToast(message: string, isError = false) {
		if (isError) {
			toastError = message;
			toastMessage = null;
		} else {
			toastMessage = message;
			toastError = null;
		}
		setTimeout(() => {
			toastMessage = null;
			toastError = null;
		}, 4000);
	}

	const initials = $derived(data.user.email.slice(0, 2).toUpperCase());
	const formToastMessage = $derived(form?.success && form?.message ? `${form.message}` : null);
	const formToastError = $derived(form && 'error' in form && form.error ? `${form.error}` : null);
	const visibleToastMessage = $derived(toastMessage ?? formToastMessage);
	const visibleToastError = $derived(toastError ?? formToastError);
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
	{#if visibleToastMessage}
		<Alert.Root variant="success">
			<Alert.Description>{visibleToastMessage}</Alert.Description>
		</Alert.Root>
	{/if}
	{#if visibleToastError}
		<Alert.Root variant="destructive">
			<Alert.Description>{visibleToastError}</Alert.Description>
		</Alert.Root>
	{/if}

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
		{/snippet}
		{#snippet actions()}
			<div class="flex size-12 items-center justify-center rounded-full border bg-muted text-sm font-semibold">
				{initials}
			</div>
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

	<div class="flex flex-wrap gap-2">
		<form
			method="POST"
			action="?/resetPassword"
			use:enhance={() => {
				sendingReset = true;
				return async ({ update }) => {
					await update();
					sendingReset = false;
				};
			}}
		>
			<Button type="submit" variant="outline" disabled={sendingReset}>
				{#if sendingReset}<Spinner color="currentColor" />{/if}
				Send Password Reset
			</Button>
		</form>

		<form
			method="POST"
			action="?/resendInvite"
			use:enhance={() => {
				sendingInvite = true;
				return async ({ update }) => {
					await update();
					sendingInvite = false;
				};
			}}
		>
			<Button type="submit" variant="outline" disabled={sendingInvite}>
				{#if sendingInvite}<Spinner color="currentColor" />{/if}
				Resend Invite
			</Button>
		</form>

		<Button variant={data.isSuspended ? 'outline' : 'destructive'} onclick={() => (showSuspendModal = true)}>
			{data.isSuspended ? 'Unsuspend User' : 'Suspend User'}
		</Button>
	</div>

	<div class="grid gap-4 xl:grid-cols-2">
		<Card.Root>
			<Card.Header>
				<Card.Title>Organizations</Card.Title>
				<Card.Description>Memberships and plan context for this account.</Card.Description>
			</Card.Header>
			<Card.Content class="overflow-x-auto">
				<Table.Root>
					<Table.Header>
						<Table.Row>
							<Table.Head>Name</Table.Head>
							<Table.Head>Role</Table.Head>
							<Table.Head>Personnel</Table.Head>
							<Table.Head>Tier</Table.Head>
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
								<Table.Cell>
									<Badge variant={adminBadgeVariant(org.subscriptionTier)}
										>{formatAdminLabel(org.subscriptionTier)}</Badge
									>
								</Table.Cell>
							</Table.Row>
						{:else}
							<Table.Row>
								<Table.Cell colspan={4}>
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

{#if showSuspendModal}
	<SuspendModal
		type="user"
		targetId={data.user.id}
		targetName={data.user.email}
		isSuspended={data.isSuspended}
		onClose={() => (showSuspendModal = false)}
		onComplete={() => {
			showSuspendModal = false;
			showToast(data.isSuspended ? 'User unsuspended' : 'User suspended');
		}}
	/>
{/if}
