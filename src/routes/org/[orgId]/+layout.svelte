<script lang="ts">
	import { AppShell } from '$features/app-shell';
	import { themeStore } from '$lib/stores/theme.svelte';
	import { Button } from '$lib/components/ui/button';
	let { children, data } = $props();
	const readyShell = $derived(data.shell.kind === 'ready' ? data.shell : null);
	const suspendedShell = $derived(data.shell.kind === 'suspended' ? data.shell : null);
</script>

{#if suspendedShell}
	<div class="flex min-h-screen items-center justify-center bg-background p-6 text-foreground">
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
	</div>
{:else if readyShell && data.identitySessionScope?.userId === readyShell.user.id}
	{#key `${readyShell.user.id}:${readyShell.org.id}:${data.identitySessionScope.sessionId}`}
		<AppShell shell={readyShell} {children} onToggleTheme={() => themeStore.toggle()} isDarkTheme={themeStore.isDark}>
			{#snippet feedback(props)}
				{#await import('$features/feedback') then { FeedbackModal }}
					<FeedbackModal {...props} />
				{/await}
			{/snippet}
		</AppShell>
	{/key}
{:else if readyShell}
	<p role="alert">Workspace session unavailable. Refresh or sign in again.</p>
{/if}
