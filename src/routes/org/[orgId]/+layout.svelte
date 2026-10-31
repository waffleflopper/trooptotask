<script lang="ts">
	import { AppShell } from '$features/app-shell';
	import { themeStore } from '$lib/stores/theme.svelte';
	import { Button } from '$lib/components/ui/button';
	import { page } from '$app/state';
	import { invalidate } from '$app/navigation';
	import { findDisabledFeatureRoute } from '$lib/access/featureSwitches';
	import WorkspaceFeatureOff from './WorkspaceFeatureOff.svelte';
	let { children, data } = $props();
	const readyShell = $derived(data.shell.kind === 'ready' ? data.shell : null);
	const suspendedShell = $derived(data.shell.kind === 'suspended' ? data.shell : null);
	const featureOff = $derived(
		readyShell && (page.error?.featureOff ?? findDisabledFeatureRoute(page.route.id, readyShell.org.disabledFeatures))
	);

	// A route that found its feature turned off after this shell loaded refreshes the shell, so navigation drops the feature too.
	$effect(() => {
		if (featureOff && readyShell && !readyShell.org.disabledFeatures.includes(featureOff)) {
			void invalidate('app:org-core');
		}
	});
</script>

{#snippet featureOffState()}
	{#if readyShell && featureOff}
		<WorkspaceFeatureOff
			feature={featureOff}
			dashboardHref={`/org/${readyShell.org.urlSegment}`}
			settingsHref={readyShell.member.isOwner || readyShell.member.isAdmin
				? `/org/${readyShell.org.urlSegment}/settings/features`
				: null}
		/>
	{/if}
{/snippet}

{#if suspendedShell}
	<main class="flex min-h-screen items-center justify-center bg-background p-6 text-foreground">
		<div class="grid max-w-md gap-4 rounded-lg border bg-card p-8 text-center text-card-foreground">
			<h1
				class="[font-family:'Barlow Condensed', sans-serif] text-3xl leading-tight font-bold tracking-[0.04em] text-destructive uppercase"
			>
				Organization Suspended
			</h1>
			<p class="m-0 text-sm leading-relaxed text-muted-foreground">
				This organization ({suspendedShell.org.name}) has been suspended. If you believe this is an error, please
				contact support.
			</p>
			<p class="m-0 font-medium">support@trooptotask.org</p>
			<Button href="/dashboard?show=all" variant="outline">Back to Dashboard</Button>
		</div>
	</main>
{:else if readyShell && data.identitySessionScope?.userId === readyShell.user.id}
	{#key `${readyShell.user.id}:${readyShell.org.id}:${data.identitySessionScope.sessionId}`}
		<AppShell
			shell={readyShell}
			children={featureOff ? featureOffState : children}
			onToggleTheme={() => themeStore.toggle()}
			isDarkTheme={themeStore.isDark}
		>
			{#snippet headerActions()}
				{#if data.organizationSetup}
					{#await import('$features/organization') then { SetupResume }}
						<SetupResume
							orgId={readyShell.org.id}
							orgUrlSegment={readyShell.org.urlSegment}
							entry={data.organizationSetup}
						/>
					{/await}
				{/if}
			{/snippet}
			{#snippet feedback(props)}
				{#await import('$features/feedback') then { FeedbackModal }}
					<FeedbackModal {...props} />
				{/await}
			{/snippet}
		</AppShell>
	{/key}
{:else if readyShell}
	<main>
		<p role="alert">Workspace session unavailable. Refresh or sign in again.</p>
	</main>
{/if}
