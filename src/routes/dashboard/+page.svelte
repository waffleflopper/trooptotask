<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import MoonIcon from '@lucide/svelte/icons/moon';
	import SunIcon from '@lucide/svelte/icons/sun';
	import * as Alert from '$lib/components/ui/alert';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { themeStore } from '$lib/stores/theme.svelte';
	import { formatRelativeDate } from '$lib/utils/dates';

	let { data, form } = $props();
	let loading = $state<string | null>(null);
	let successMessage = $state<string | null>(null);
	let orgFilter = $state('');
	let successTimer: ReturnType<typeof setTimeout>;

	function showSuccess(msg: string) {
		successMessage = msg;
		clearTimeout(successTimer);
		successTimer = setTimeout(() => (successMessage = null), 4000);
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

<div class="min-h-screen bg-background p-4 sm:p-6 lg:p-12">
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
				<h2 class="text-3xl leading-tight font-semibold tracking-tight text-foreground">Available workspaces</h2>
			</header>

			{#if form?.error}
				<Alert.Root variant="destructive">
					<Alert.Description>{form.error}</Alert.Description>
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
								</div>

								<div class="flex flex-wrap justify-end gap-2 max-sm:w-full">
									<form
										class="max-sm:flex-1"
										method="POST"
										action="?/acceptInvitation"
										use:enhance={() => {
											loading = invitation.id;
											return async ({ result, update }) => {
												loading = null;
												if (result.type === 'success') showSuccess(`Joined ${invitation.organizationName}.`);
												await update();
											};
										}}
									>
										<input type="hidden" name="invitationId" value={invitation.id} />
										<Button class="max-sm:w-full" type="submit" disabled={loading === invitation.id}>
											{loading === invitation.id ? 'Accepting...' : 'Accept'}
										</Button>
									</form>
									<form
										class="max-sm:flex-1"
										method="POST"
										action="?/declineInvitation"
										use:enhance={() => {
											loading = invitation.id;
											return async ({ result, update }) => {
												loading = null;
												if (result.type === 'success') showSuccess('Invitation declined.');
												await update();
											};
										}}
									>
										<input type="hidden" name="invitationId" value={invitation.id} />
										<Button class="max-sm:w-full" type="submit" variant="outline" disabled={loading === invitation.id}>
											Decline
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
					<Input
						type="search"
						placeholder="Filter organizations..."
						bind:value={orgFilter}
						aria-label="Filter organizations"
					/>
				{/if}

				{#if data.organizations.length > 0}
					<div class="flex flex-col gap-3">
						{#each filteredOrgs as org (org.id)}
							<a
								href={resolve(`/org/${org.urlSegment ?? org.id}` as `/org/${string}`)}
								class="flex items-center justify-between gap-4 rounded-lg border border-border bg-background p-4 text-foreground transition-colors hover:bg-muted max-sm:flex-col max-sm:items-start"
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
				<Button href="/auth/logout" variant="outline">Sign Out</Button>
			</div>
		</section>
	</div>
</div>
