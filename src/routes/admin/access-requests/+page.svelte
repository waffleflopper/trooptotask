<script lang="ts">
	import { enhance } from '$app/forms';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { redirectToSensitiveActionStepUp } from '$lib/auth/sensitiveActionStepUp';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import * as Alert from '$lib/components/ui/alert';
	import * as Card from '$lib/components/ui/card';
	import * as Empty from '$lib/components/ui/empty';
	import * as PageShell from '$lib/components/ui/page-shell';
	import { Spinner } from '$lib/components/ui/spinner';
	import * as Tabs from '$lib/components/ui/tabs';
	import { formatDisplayDateTime } from '$lib/utils/dates';
	import { adminBadgeVariant, formatAdminLabel } from '$lib/components/admin/adminTheme';
	import type { BadgeVariant } from '$lib/components/ui/badge';
	import type { PageData } from './$types';

	type AccessRequestCard = PageData['pending'][number] | PageData['reviewed'][number];

	let { data, form } = $props();
	let activeTab = $state<'pending' | 'reviewed'>('pending');
	let loadingId = $state<string | null>(null);

	const stepUpEnhance = (id: string): SubmitFunction => {
		return () => {
			loadingId = id;
			return async ({ result, update }) => {
				loadingId = null;
				if (result.type === 'failure' && redirectToSensitiveActionStepUp(result.data)) return;
				await update();
			};
		};
	};

	function setupStateVariant(state: string): BadgeVariant {
		if (state === 'completed') return 'success';
		if (state === 'failed' || state === 'delivery_failed') return 'danger';
		if (state === 'expired') return 'warning';
		if (state === 'replaced' || state === 'claimed' || state === 'delivery_pending') return 'info';
		if (state === 'pending') return 'secondary';
		return 'outline';
	}

	function setupActionLabel(state: string): string {
		if (state === 'not_sent') return 'Send Setup';
		return 'Send Fresh Setup';
	}

	function canSendSetup(state: string): boolean {
		return state !== 'completed' && state !== 'delivery_pending';
	}

	function setupDeliverySummary(req: PageData['reviewed'][number]): string | null {
		if (!req.setup_delivery_status) return null;

		const outboxReference = req.setup_delivery_id ? ` (${req.setup_delivery_id})` : '';
		const attemptLabel = req.setup_delivery_attempt_count === 1 ? 'attempt' : 'attempts';

		return `Delivery ${req.setup_delivery_status}${outboxReference}, ${req.setup_delivery_attempt_count} ${attemptLabel}`;
	}

	function setupRevocationSummary(req: PageData['reviewed'][number]): string {
		const reason = req.setup_link_revocation_reason;
		const action = reason === 'replaced' ? 'replaced' : 'revoked';
		const reasonLabel = reason ? ` (${reason})` : '';

		return `Latest known setup link ${action}${reasonLabel} ${formatDisplayDateTime(req.setup_link_replaced_at)}`;
	}
</script>

<svelte:head>
	<title>Access Requests - Admin - Troop to Task</title>
</svelte:head>

{#snippet invitationOriginContext(req: AccessRequestCard)}
	{#if req.invitation_origins.length > 0}
		<section class="grid gap-2 rounded-md border bg-muted/30 p-3" aria-label="Organization invitation origin context">
			<div class="flex flex-wrap items-start gap-2">
				<Badge variant="info">Organization Invitation</Badge>
				<p class="max-w-2xl text-xs leading-5 text-muted-foreground">
					Platform approval enables User Account setup only and does not create Organization Membership.
				</p>
			</div>
			<div class="grid gap-2">
				{#each req.invitation_origins as origin (origin.link_id)}
					<div class="grid gap-1 rounded-md border bg-background p-3 text-sm">
						<div class="flex min-w-0 flex-wrap items-center gap-2">
							<strong class="truncate">{origin.organization_name}</strong>
							<span class="text-xs text-muted-foreground">{origin.intended_access_label}</span>
						</div>
						<p class="text-xs text-muted-foreground">
							Invited by {origin.inviter_label} on {formatDisplayDateTime(origin.invited_at)}
						</p>
						<p class="text-xs text-muted-foreground">
							Membership Role: {origin.membership_role_label}{#if origin.member_preset_label}
								/ Member Preset: {origin.member_preset_label}{/if}
						</p>
					</div>
				{/each}
			</div>
		</section>
	{/if}
{/snippet}

<PageShell.Root width="content" density="compact">
	<PageShell.Header title="Access Requests" subtitle="Review inbound requests before users enter the platform." />

	<PageShell.FactGrid layout="two">
		<PageShell.Metric
			label="Pending"
			value={data.pending.length}
			detail="Requests waiting for approval or rejection."
		/>
		<PageShell.Metric label="Reviewed" value={data.reviewed.length} detail="Requests already processed and logged." />
	</PageShell.FactGrid>

	{#if form?.error}
		<Alert.Root variant="destructive">
			<Alert.Description>{form.error}</Alert.Description>
		</Alert.Root>
	{/if}

	<Tabs.Root bind:value={activeTab} class="grid gap-4">
		<Tabs.List class="w-full justify-start">
			<Tabs.Trigger value="pending">
				Pending
				{#if data.pending.length > 0}<Badge variant="secondary">{data.pending.length}</Badge>{/if}
			</Tabs.Trigger>
			<Tabs.Trigger value="reviewed">
				Reviewed
				{#if data.reviewed.length > 0}<Badge variant="secondary">{data.reviewed.length}</Badge>{/if}
			</Tabs.Trigger>
		</Tabs.List>

		<Tabs.Content value="pending" class="grid gap-3">
			{#if data.pending.length === 0}
				<Card.Root>
					<Card.Content>
						<Empty.Root>
							<Empty.Header>
								<Empty.Title>No pending requests.</Empty.Title>
							</Empty.Header>
						</Empty.Root>
					</Card.Content>
				</Card.Root>
			{:else}
				{#each data.pending as req (req.id)}
					<Card.Root>
						<Card.Content class="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
							<div class="grid min-w-0 gap-2">
								<div class="grid min-w-0 gap-1">
									<h2 class="truncate text-lg font-semibold tracking-tight">{req.name}</h2>
									<p class="truncate text-sm text-muted-foreground">{req.email}</p>
								</div>
								{#if req.reason}<p class="text-sm leading-6">{req.reason}</p>{/if}
								{#if req.heard_about_label}
									<p class="text-xs text-muted-foreground">
										Source: {req.heard_about_label}{req.heard_about_details ? ` - ${req.heard_about_details}` : ''}
									</p>
								{/if}
								{@render invitationOriginContext(req)}
								<p class="text-xs text-muted-foreground">Submitted {formatDisplayDateTime(req.created_at)}</p>
							</div>
							<div class="flex flex-wrap gap-2 md:justify-end">
								<form method="POST" action="?/approve" use:enhance={stepUpEnhance(`${req.id}-approve`)}>
									<input type="hidden" name="requestId" value={req.id} />
									<Button type="submit" disabled={loadingId !== null}>
										{#if loadingId === `${req.id}-approve`}<Spinner />{/if}
										Approve
									</Button>
								</form>
								<form method="POST" action="?/reject" use:enhance={stepUpEnhance(`${req.id}-reject`)}>
									<input type="hidden" name="requestId" value={req.id} />
									<Button type="submit" variant="destructive" disabled={loadingId !== null}>
										{#if loadingId === `${req.id}-reject`}<Spinner />{/if}
										Reject
									</Button>
								</form>
							</div>
						</Card.Content>
					</Card.Root>
				{/each}
			{/if}
		</Tabs.Content>

		<Tabs.Content value="reviewed" class="grid gap-3">
			{#if data.reviewed.length === 0}
				<Card.Root>
					<Card.Content>
						<Empty.Root>
							<Empty.Header>
								<Empty.Title>No reviewed requests yet.</Empty.Title>
							</Empty.Header>
						</Empty.Root>
					</Card.Content>
				</Card.Root>
			{:else}
				{#each data.reviewed as req (req.id)}
					<Card.Root>
						<Card.Content class="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
							<div class="grid min-w-0 gap-2">
								<div class="flex min-w-0 flex-wrap items-center gap-2">
									<h2 class="truncate text-lg font-semibold tracking-tight">{req.name}</h2>
									<Badge variant={adminBadgeVariant(req.status)}>{formatAdminLabel(req.status)}</Badge>
									{#if req.status === 'approved'}
										<Badge variant={setupStateVariant(req.setup_state)}>Setup {req.setup_state_label}</Badge>
									{/if}
								</div>
								<p class="truncate text-sm text-muted-foreground">{req.email}</p>
								{#if req.reason}<p class="text-sm leading-6">{req.reason}</p>{/if}
								{#if req.heard_about_label}
									<p class="text-xs text-muted-foreground">
										Source: {req.heard_about_label}{req.heard_about_details ? ` - ${req.heard_about_details}` : ''}
									</p>
								{/if}
								{@render invitationOriginContext(req)}
								<p class="text-xs text-muted-foreground">
									Submitted {formatDisplayDateTime(req.created_at)}
									{#if req.reviewed_at}
										/ Reviewed {formatDisplayDateTime(req.reviewed_at)}{/if}
								</p>
								{#if req.status === 'approved'}
									<div class="grid gap-1 text-xs text-muted-foreground">
										<p>{req.setup_state_detail}</p>
										{#if req.setup_link_id}
											<p>Setup link ID {req.setup_link_id}</p>
										{/if}
										{#if req.setup_link_claimed_at}
											<p>Claimed {formatDisplayDateTime(req.setup_link_claimed_at)}</p>
										{/if}
										{#if req.setup_link_failed_at}
											<p>
												Failed {formatDisplayDateTime(req.setup_link_failed_at)}
												{#if req.setup_link_failure_reason}
													({req.setup_link_failure_reason}){/if}
											</p>
										{/if}
										{#if req.setup_link_expires_at && req.setup_state !== 'completed'}
											<p>Current setup link expires {formatDisplayDateTime(req.setup_link_expires_at)}</p>
										{/if}
										{#if req.setup_link_replaced_at}
											<p>{setupRevocationSummary(req)}</p>
										{:else if req.has_replaced_setup_link}
											<p>Older setup links have been replaced.</p>
										{/if}
										{#if req.setup_delivery_status}
											<p>{setupDeliverySummary(req)}</p>
										{/if}
										{#if req.setup_delivery_sent_at}
											<p>Delivered {formatDisplayDateTime(req.setup_delivery_sent_at)}</p>
										{:else if req.setup_delivery_updated_at}
											<p>Delivery updated {formatDisplayDateTime(req.setup_delivery_updated_at)}</p>
										{/if}
										{#if req.setup_delivery_last_error}
											<p class="text-danger-foreground">Delivery error: {req.setup_delivery_last_error}</p>
										{/if}
									</div>
								{/if}
							</div>
							{#if req.status === 'approved' && canSendSetup(req.setup_state)}
								<form method="POST" action="?/resend" use:enhance={stepUpEnhance(`${req.id}-resend`)}>
									<input type="hidden" name="requestId" value={req.id} />
									<Button type="submit" variant="outline" disabled={loadingId !== null}>
										{#if loadingId === `${req.id}-resend`}<Spinner />{/if}
										{setupActionLabel(req.setup_state)}
									</Button>
								</form>
							{:else if req.status === 'approved' && req.setup_state === 'completed'}
								<p class="text-xs text-muted-foreground">
									Account setup completed
									{#if req.setup_completed_at_display}
										{formatDisplayDateTime(req.setup_completed_at_display)}
									{/if}
								</p>
							{/if}
						</Card.Content>
					</Card.Root>
				{/each}
			{/if}
		</Tabs.Content>
	</Tabs.Root>
</PageShell.Root>
