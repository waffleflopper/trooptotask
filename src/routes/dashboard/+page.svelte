<script lang="ts">
	import { enhance } from '$app/forms';
	import { onDestroy } from 'svelte';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { resolve } from '$app/paths';
	import MoonIcon from '@lucide/svelte/icons/moon';
	import SunIcon from '@lucide/svelte/icons/sun';
	import * as Alert from '$lib/components/ui/alert';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { WorkspaceToolbar } from '$lib/components/patterns/workspace-toolbar';
	import { themeStore } from '$lib/stores/theme.svelte';
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
	let orgFilter = $state('');
	let successTimer: ReturnType<typeof setTimeout>;
	let workspacesHeading = $state<HTMLHeadingElement | null>(null);

	function showSuccess(msg: string) {
		successMessage = msg;
		clearTimeout(successTimer);
		successTimer = setTimeout(() => (successMessage = null), 4000);
	}

	function respondToInvitation(invitationId: string, successText: string): SubmitFunction {
		return ({ formElement, cancel }) => {
			if (loading) return cancel();
			loading = invitationId;
			respondedInvitationId = invitationId;
			requestError = null;
			supersededForm = form;
			return async (outcome) => {
				// A resolved invitation leaves the list; a failed one keeps its row and button.
				await settleAction(outcome, {
					isCurrent: () => active,
					settled: (error) => {
						requestError = error;
						loading = null;
						if (!error && outcome.result.type === 'success') showSuccess(successText);
					},
					focus: () => [formElement.querySelector('button'), workspacesHeading]
				});
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
</script>

<svelte:head>
	<title>Dashboard - Troop to Task</title>
</svelte:head>

<main class="min-h-screen bg-background p-4 sm:p-6 lg:p-12">
	<Button
		class="fixed top-5 right-5 z-10"
		variant="outline"
		size="icon"
		onclick={() => themeStore.toggle()}
		aria-label="Toggle theme"
	>
		{#if themeStore.isDark}
			<SunIcon />
		{:else}
			<MoonIcon />
		{/if}
	</Button>

	<div
		class="mx-auto grid max-w-6xl items-start gap-8 pt-24 md:grid-cols-[minmax(0,0.9fr)_minmax(20rem,32rem)] lg:gap-16 lg:pt-32"
	>
		<section class="flex max-w-xl flex-col gap-5">
			<p class="font-mono text-xs font-semibold tracking-[0.08em] text-primary uppercase">Command Access</p>
			<h1 class="max-w-[10ch] text-5xl leading-none font-semibold tracking-tight text-foreground lg:text-7xl">
				Choose where to work.
			</h1>
			<p class="max-w-xl text-base leading-7 text-muted-foreground">
				Move into an organization, process pending invitations, or create a new workspace before the next handoff.
			</p>
		</section>

		<section
			class="flex flex-col gap-6 rounded-lg border border-border bg-card p-5 text-card-foreground shadow-sm lg:p-8"
		>
			<header class="flex flex-col">
				<h2
					bind:this={workspacesHeading}
					tabindex="-1"
					class="text-3xl leading-tight font-semibold tracking-tight text-foreground outline-none"
				>
					Available workspaces
				</h2>
			</header>

			{#if respondedInvitationId === null && failure}
				<Alert.Root variant="destructive">
					<Alert.Description>{failure}</Alert.Description>
				</Alert.Root>
			{/if}

			{#if successMessage}
				<Alert.Root role="status">
					<Alert.Description>{successMessage}</Alert.Description>
				</Alert.Root>
			{/if}

			{#if data.pendingInvitations.length > 0}
				<section class="flex flex-col gap-4">
					<div class="flex items-center justify-between gap-3 border-t border-border pt-4">
						<p class="font-mono text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">
							Pending Invitations
						</p>
						<Badge variant="secondary">{data.pendingInvitations.length}</Badge>
					</div>

					<div class="flex flex-col gap-3">
						{#each data.pendingInvitations as invitation (invitation.id)}
							<div
								class="flex items-start justify-between gap-4 rounded-lg border border-border bg-background p-4 max-sm:flex-col"
							>
								<div class="flex min-w-0 flex-col gap-1">
									<span class="truncate font-medium text-foreground">{invitation.organizationName}</span>
									<span class="text-sm text-muted-foreground">Invited {formatRelativeDate(invitation.createdAt)}</span>
									{#if respondedInvitationId === invitation.id && (requestError || failure)}
										<Alert.Root variant="destructive" class="mt-2">
											<Alert.Description>{requestError ?? failure}</Alert.Description>
										</Alert.Root>
									{/if}
								</div>

								<div class="flex flex-wrap justify-end gap-2 max-sm:w-full">
									<form
										class="max-sm:flex-1"
										method="POST"
										action="?/acceptInvitation"
										use:enhance={respondToInvitation(invitation.id, `Joined ${invitation.organizationName}.`)}
									>
										<input type="hidden" name="invitationId" value={invitation.id} />
										<!-- aria-disabled keeps focus on the pressed button while the response is pending. -->
										<Button
											class="max-sm:w-full"
											type="submit"
											aria-disabled={loading === invitation.id ? 'true' : undefined}
											aria-busy={loading === invitation.id || undefined}
										>
											{loading === invitation.id ? 'Accepting...' : 'Accept'}
											<span class="sr-only">invitation to {invitation.organizationName}</span>
										</Button>
									</form>
									<form
										class="max-sm:flex-1"
										method="POST"
										action="?/declineInvitation"
										use:enhance={respondToInvitation(invitation.id, 'Invitation declined.')}
									>
										<input type="hidden" name="invitationId" value={invitation.id} />
										<Button
											class="max-sm:w-full"
											type="submit"
											variant="outline"
											aria-disabled={loading === invitation.id ? 'true' : undefined}
											aria-busy={loading === invitation.id || undefined}
										>
											Decline <span class="sr-only">invitation to {invitation.organizationName}</span>
										</Button>
									</form>
								</div>
							</div>
						{/each}
					</div>
				</section>
			{/if}

			<section class="flex flex-col gap-4">
				<div class="flex items-center justify-between gap-3 border-t border-border pt-4">
					<p class="font-mono text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">Organizations</p>
					{#if data.organizations.length > 0}
						<Badge variant="secondary">{data.organizations.length}</Badge>
					{/if}
				</div>

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

				{#if data.organizations.length > 0}
					<div class="flex flex-col gap-3">
						{#each filteredOrgs as org (org.id)}
							<a
								href={resolve(`/org/${org.urlSegment ?? org.id}` as `/org/${string}`)}
								class="flex items-center justify-between gap-4 rounded-lg border border-border bg-background p-4 text-foreground transition-colors outline-none hover:bg-muted focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 max-sm:flex-col max-sm:items-start"
							>
								<div class="flex min-w-0 flex-col gap-1">
									<span class="truncate font-medium">{org.name}</span>
									<span class="font-mono text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">
										{formatRole(org.role)}
									</span>
								</div>
								<span
									class="shrink-0 font-mono text-xs font-semibold tracking-[0.08em] text-primary uppercase"
									aria-hidden="true"
								>
									Open
								</span>
							</a>
						{/each}
						{#if filteredOrgs.length === 0}
							<p class="px-4 py-3 font-mono text-xs tracking-[0.08em] text-muted-foreground uppercase">
								No organizations match "{orgFilter}"
							</p>
						{/if}
					</div>
				{:else}
					<div class="flex flex-col gap-1 rounded-lg border border-border bg-background p-4">
						<p class="font-medium text-foreground">You are not a member of any organizations yet.</p>
						<span class="text-sm leading-6 text-muted-foreground">
							Create a new organization below to start building the workspace.
						</span>
					</div>
				{/if}
			</section>

			<div class="flex flex-wrap gap-3 border-t border-border pt-4">
				<Button href="/org/new">Create Organization</Button>
				<form method="POST" action={resolve('/auth/logout')}>
					<Button type="submit" variant="outline">Sign Out</Button>
				</form>
			</div>
		</section>
	</div>
</main>
