<script lang="ts">
	import { onDestroy, tick } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import { invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Spinner } from '$lib/components/ui/spinner/index.js';
	import { toastStore } from '$lib/stores/toast.svelte';
	import { formatRelativeDate } from '$lib/utils/dates';
	import type { DeletionRequestApproval } from '$features/deletion-requests/contracts';

	let { orgId, approvalRequests }: { orgId: string; approvalRequests: DeletionRequestApproval[] } = $props();

	let denyingId = $state<string | null>(null);
	let denialReason = $state('');
	let processingApproval = $state<string | null>(null);
	let reviewError = $state<{ id: string; message: string } | null>(null);
	let heading = $state<HTMLHeadingElement | null>(null);
	const reviewedIds = new SvelteSet<string>();
	let active = true;
	onDestroy(() => {
		active = false;
	});

	const pendingApprovals = $derived(
		approvalRequests.filter((request) => request.status === 'pending' && !reviewedIds.has(request.id))
	);

	function requestName(request: DeletionRequestApproval) {
		return request.resource_description ?? request.resource_type;
	}

	async function focusById(id: string) {
		await tick();
		document.getElementById(id)?.focus();
	}

	function startDenial(id: string) {
		denyingId = id;
		denialReason = '';
		void focusById(`denial-reason-${id}`);
	}

	function cancelDenial(id: string) {
		denyingId = null;
		denialReason = '';
		void focusById(`deny-${id}`);
	}

	async function handleApprovalAction(id: string, action: 'approve' | 'deny', reason?: string) {
		if (!active || processingApproval || reviewedIds.has(id)) return;
		processingApproval = id;
		reviewError = null;
		const targetOrganization = orgId;
		const failureMessage = 'Unable to confirm the review. Refresh the page or try again.';
		try {
			const res = await fetch(`/org/${targetOrganization}/api/deletion-requests/review`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id, action, denialReason: reason ?? null })
			});
			if (!active) return;
			if (!res.ok) {
				const err: unknown = await res.json().catch(() => null);
				if (!active) return;
				const message =
					err !== null && typeof err === 'object' && 'message' in err && typeof err.message === 'string'
						? err.message.trim()
						: '';
				reviewError = { id, message: message || failureMessage };
				return;
			}
			// HTTP acknowledgment is separate from refreshing the current read model.
			reviewedIds.add(id);
			if (denyingId === id) {
				denyingId = null;
				denialReason = '';
			}
			await tick();
			heading?.focus();
			try {
				await invalidateAll();
			} catch {
				if (active) toastStore.warning('Review completed. Refresh the page to update the list.');
			}
		} catch {
			if (active) reviewError = { id, message: failureMessage };
		} finally {
			if (active) processingApproval = null;
		}
	}
</script>

<section
	class="grid gap-4 rounded-lg border bg-card p-4 text-card-foreground"
	aria-labelledby="approval-requests-heading"
>
	<div class="grid gap-1">
		<h2
			bind:this={heading}
			id="approval-requests-heading"
			tabindex="-1"
			class="font-heading text-lg font-semibold tracking-tight outline-none"
		>
			Approval Requests
		</h2>
		<p class="text-sm text-muted-foreground">{pendingApprovals.length} pending</p>
	</div>
	<div class="grid gap-3">
		{#each pendingApprovals as request (request.id)}
			<article class="grid gap-2 rounded-md border p-3">
				<header>
					<strong>{request.requested_by_email ?? 'Unknown requester'}</strong>
				</header>
				{#if request.resource_url}
					<a class="text-sm font-medium underline-offset-4 hover:underline" href={resolve(request.resource_url as '/')}>
						{requestName(request)}
					</a>
				{:else}
					<p class="text-sm font-medium">{requestName(request)}</p>
				{/if}
				<div class="grid gap-2">
					<span class="text-sm text-muted-foreground">{formatRelativeDate(request.created_at)} · Pending</span>
					{#if reviewError?.id === request.id}
						<Alert.Root variant="destructive">
							<Alert.Description>{reviewError.message}</Alert.Description>
						</Alert.Root>
					{/if}
					{#if denyingId === request.id}
						<div class="flex flex-wrap gap-2">
							<Input
								id="denial-reason-{request.id}"
								type="text"
								aria-label="Denial reason"
								placeholder="Reason"
								class="min-w-0 flex-1"
								bind:value={denialReason}
								disabled={processingApproval !== null}
								onkeydown={(event) => {
									if (processingApproval) return;
									if (event.key === 'Enter') handleApprovalAction(request.id, 'deny', denialReason);
									if (event.key === 'Escape') cancelDenial(request.id);
								}}
							/>
							<Button
								variant="destructive"
								size="sm"
								disabled={processingApproval !== null}
								onclick={() => handleApprovalAction(request.id, 'deny', denialReason)}
							>
								{#if processingApproval === request.id}<Spinner />{/if}
								Confirm
							</Button>
						</div>
					{:else}
						<div class="flex flex-wrap gap-2">
							<Button
								size="sm"
								disabled={processingApproval !== null}
								onclick={() => handleApprovalAction(request.id, 'approve')}
							>
								{#if processingApproval === request.id}<Spinner />{/if}
								Approve <span class="sr-only">{requestName(request)}</span>
							</Button>
							<Button
								id="deny-{request.id}"
								variant="outline"
								size="sm"
								disabled={processingApproval !== null}
								onclick={() => startDenial(request.id)}
							>
								Deny <span class="sr-only">{requestName(request)}</span>
							</Button>
						</div>
					{/if}
				</div>
			</article>
		{:else}
			<p class="text-sm text-muted-foreground">No pending requests.</p>
		{/each}
	</div>
</section>
