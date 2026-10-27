<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { onDestroy } from 'svelte';
	import type { SubmitFunction } from '@sveltejs/kit';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import AuthNotice from '$features/identity/AuthNotice.svelte';
	import AuthShell from '$features/identity/AuthShell.svelte';
	import { Button } from '$lib/components/ui/button';
	import { WorkspaceToolbar } from '$lib/components/patterns/workspace-toolbar';
	import { cn } from '$lib/utils';
	import { formatRelativeDate } from '$lib/utils/dates';
	import { settleAction } from '$lib/utils/settleAction';

	let { data, form } = $props();
	let active = true;
	onDestroy(() => {
		active = false;
	});
	let loading = $state<string | null>(null);
	let respondedInvitationId = $state<string | null>(null);
	let requestError = $state<string | null>(null);
	// A new response supersedes the failure on screen; only a failure the server returns for it shows again.
	let supersededForm = $state.raw<typeof form | undefined>(undefined);
	const failure = $derived(form === supersededForm ? undefined : form?.error);
	let successMessage = $state<string | null>(null);
	// The service answers 400 or 404 when an invitation can no longer be answered (expired, revoked, already
	// answered), so that row keeps its message and loses its buttons.
	let closedInvitations = $state<Record<string, string>>({});
	let orgFilter = $state('');
	let listHeading = $state<HTMLElement | null>(null);

	const listHref = `${resolve('/dashboard')}?show=all`;

	function respondToInvitation(invitationId: string, successText: string): SubmitFunction {
		return ({ formElement, cancel }) => {
			if (loading) return cancel();
			loading = invitationId;
			respondedInvitationId = invitationId;
			requestError = null;
			successMessage = null;
			supersededForm = form;
			return async ({ result, update }) => {
				// Without show=all the reload would send someone left with one Organization straight into it.
				const stay =
					result.type === 'success' && page.url.searchParams.get('show') !== 'all'
						? () => goto(listHref, { replaceState: true, keepFocus: true, noScroll: true, invalidateAll: true })
						: update;
				// A resolved invitation leaves the list; a failed one keeps its row and button.
				await settleAction(
					{ result, update: stay },
					{
						isCurrent: () => active,
						settled: (error) => {
							requestError = error;
							loading = null;
							if (!error && result.type === 'success') successMessage = successText;
							if (result.type === 'failure' && (result.status === 400 || result.status === 404)) {
								closedInvitations[invitationId] = String(result.data?.error ?? '');
							}
						},
						focus: () => [
							formElement.querySelector('button'),
							document.getElementById(`invitation-${invitationId}-error`),
							listHeading
						]
					}
				);
			};
		};
	}

	function formatRole(role: string): string {
		const map: Record<string, string> = { admin: 'Administrator', member: 'Member' };
		return map[role.toLowerCase()] ?? role.charAt(0).toUpperCase() + role.slice(1);
	}

	const filteredOrgs = $derived(
		orgFilter.trim()
			? data.organizations.filter((org) => org.name.toLowerCase().includes(orgFilter.toLowerCase().trim()))
			: data.organizations
	);
	const sectionLabel = 'font-mono text-[11px] leading-[14px] font-medium tracking-[0.08em] uppercase';
</script>

<svelte:head>
	<title>Organizations - Troop to Task</title>
</svelte:head>

<AuthShell
	eyebrow="Your Organizations"
	headline={['Report in.', 'Pick your unit.']}
	lede="Every Organization you belong to, and every unit that has invited you. Your role is set per Organization."
	signedIn={{ account: true }}
	panelWidth="wide"
	panelEyebrow={data.userEmail ? `Signed in as ${data.userEmail}` : 'Your Organizations'}
	panelTitle="Organizations"
	panelDescription="Open one to work in it, or answer an invitation."
>
	{#if successMessage}
		<AuthNotice tone="success" message={successMessage} />
	{/if}

	{#if respondedInvitationId === null && failure}
		<AuthNotice tone="error" message={String(failure)} />
	{/if}

	{#if data.pendingInvitations.length > 0}
		<section aria-labelledby="invitations-heading" class="flex flex-col gap-2">
			<div class="flex items-baseline justify-between pb-1">
				<h2 id="invitations-heading" class={cn(sectionLabel, 'text-accent-text')}>Invitations</h2>
				<p class={cn(sectionLabel, 'font-normal text-muted-foreground')}>
					{data.pendingInvitations.length} waiting
				</p>
			</div>
			<ul class="flex flex-col gap-2">
				{#each data.pendingInvitations as invitation (invitation.id)}
					{@const closed = closedInvitations[invitation.id]}
					{@const rowError = closed ?? (respondedInvitationId === invitation.id ? (requestError ?? failure) : null)}
					<li
						class={cn(
							'flex flex-col gap-2.5 rounded-md border-l-3 bg-card px-4 py-3.5',
							rowError ? 'border-l-destructive' : 'border-l-accent'
						)}
					>
						<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
							<div class="flex min-w-0 grow flex-col gap-0.5">
								<span class="text-base leading-[22px] font-medium">{invitation.organizationName}</span>
								<span class="font-mono text-[11px] leading-[14px] tracking-[0.04em] text-muted-foreground">
									Invited {formatRelativeDate(invitation.createdAt)}
								</span>
							</div>
							{#if closed === undefined}
								<div class="grid grid-cols-2 gap-2 sm:flex sm:shrink-0">
									<form
										method="POST"
										action="?/declineInvitation"
										use:enhance={respondToInvitation(
											invitation.id,
											`Declined the invitation to ${invitation.organizationName}.`
										)}
									>
										<input type="hidden" name="invitationId" value={invitation.id} />
										<!-- aria-disabled keeps focus on the pressed button while the response is pending. -->
										<Button
											class="w-full max-sm:h-11"
											type="submit"
											variant="outline"
											aria-disabled={loading === invitation.id ? 'true' : undefined}
											aria-busy={loading === invitation.id || undefined}
										>
											Decline <span class="sr-only">invitation to {invitation.organizationName}</span>
										</Button>
									</form>
									<form
										method="POST"
										action="?/acceptInvitation"
										use:enhance={respondToInvitation(
											invitation.id,
											`Joined ${invitation.organizationName}. It's now in your list.`
										)}
									>
										<input type="hidden" name="invitationId" value={invitation.id} />
										<Button
											class="w-full max-sm:h-11"
											type="submit"
											aria-disabled={loading === invitation.id ? 'true' : undefined}
											aria-busy={loading === invitation.id || undefined}
										>
											{loading === invitation.id ? 'Accepting...' : 'Accept'}
											<span class="sr-only">invitation to {invitation.organizationName}</span>
										</Button>
									</form>
								</div>
							{/if}
						</div>
						{#if rowError}
							<p
								id={`invitation-${invitation.id}-error`}
								role="alert"
								tabindex="-1"
								class="text-sm leading-5 text-destructive-text outline-none"
							>
								{rowError}
							</p>
						{/if}
					</li>
				{/each}
			</ul>
		</section>
	{/if}

	<section aria-labelledby="member-of-heading" class="flex flex-col gap-3">
		{#if data.organizations.length > 4}
			<WorkspaceToolbar
				ariaLabel="Organization controls"
				items={[]}
				search={{
					label: 'Filter organizations',
					placeholder: 'Filter organizations...',
					value: orgFilter,
					onValueChange: (value) => (orgFilter = value)
				}}
			/>
		{/if}
		<div>
			<div class="flex items-baseline justify-between border-b border-foreground pr-9 pb-1.5">
				<h2 id="member-of-heading" bind:this={listHeading} tabindex="-1" class={cn(sectionLabel, 'outline-none')}>
					Member of
				</h2>
				{#if data.organizations.length > 0}
					<span class={cn(sectionLabel, 'font-normal text-muted-foreground')}>Role</span>
				{/if}
			</div>
			{#if data.organizations.length > 0}
				<ul>
					{#each filteredOrgs as org (org.id)}
						<li class="border-b">
							<a
								href={resolve(`/org/${org.urlSegment ?? org.id}` as `/org/${string}`)}
								class="flex min-h-14 items-center gap-4 py-3 pr-1 text-foreground outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
							>
								<span class="min-w-0 grow text-base leading-[22px] font-medium">{org.name}</span>
								<span class="shrink-0 text-right font-mono text-[11px] leading-[14px] tracking-[0.08em] uppercase">
									{formatRole(org.role)}
								</span>
								<ChevronRightIcon class="size-4 shrink-0" aria-hidden="true" />
							</a>
						</li>
					{/each}
				</ul>
				{#if filteredOrgs.length === 0}
					<p class="py-3 font-mono text-xs tracking-[0.08em] text-muted-foreground uppercase">
						No organizations match "{orgFilter}"
					</p>
				{/if}
			{:else}
				<p class="border-b py-3.5 text-sm leading-5 text-muted-foreground">
					{#if data.pendingInvitations.length === 1}
						Nothing yet. Accept the invitation to join {data.pendingInvitations[0].organizationName}, or create your
						own.
					{:else if data.pendingInvitations.length > 1}
						Nothing yet. Accept an invitation, or create your own.
					{:else}
						Nothing yet. Create your own to get started.
					{/if}
				</p>
			{/if}
		</div>
	</section>

	<a
		href={resolve('/org/new')}
		class="flex items-center gap-4 rounded-lg border border-dashed border-input py-4 pr-2 pl-4 text-foreground outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
	>
		<span class="flex size-8 shrink-0 items-center justify-center rounded-md bg-foreground text-chrome-accent">
			<PlusIcon class="size-3.5" strokeWidth={2.25} aria-hidden="true" />
		</span>
		<span class="flex min-w-0 grow flex-col gap-0.5">
			<span class="text-[15px] leading-5 font-medium">Create organization</span>
			<span class="text-[13px] leading-[18px] text-muted-foreground">Stand up a new unit. You'll be its owner.</span>
		</span>
		<ChevronRightIcon class="size-4 shrink-0" aria-hidden="true" />
	</a>
</AuthShell>
