<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import AuthField from '$lib/components/auth/AuthField.svelte';
	import AuthNotice from '$lib/components/auth/AuthNotice.svelte';
	import AuthPasswordToggle from '$lib/components/auth/AuthPasswordToggle.svelte';
	import AuthShell from '$lib/components/auth/AuthShell.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Spinner } from '$lib/components/ui/spinner';

	let { form, data } = $props();
	let loading = $state(false);
	let showPassword = $state(false);
	let transportError = $state('');
</script>

<svelte:head>
	<title>Sign In - Troop to Task</title>
</svelte:head>

<AuthShell
	eyebrow="Account Access"
	title="Sign in to your account."
	description="Use the email address and password tied to your TroopToTask account."
	panelEyebrow="Existing account"
	panelTitle="Sign in"
	imageSrc="/auth/auth-login-command-desk.png"
	imageAlt="A military command-post desk with a map, notebook, compass, and rugged laptop."
	supportLabel="Need help?"
	supportTitle="Choose the right path."
	supportDescription="If you do not have an account yet, use your Account Setup Link, request a fresh setup link below, or request access."
	supportPoints={[
		'If you have an account but cannot sign in, reset your password before requesting new access.',
		'Account Setup Links expire. If yours is stale, request a fresh setup link from this page.',
		'Request Access is only for units that do not yet have access to TroopToTask.'
	]}
>
	<div class="flex flex-col gap-5">
		{#if data.authLinkError}
			<AuthNotice tone="error" message={data.authLinkError} />
		{/if}

		{#if data.reauth}
			<AuthNotice
				tone="info"
				message="Confirm your identity to continue. Re-enter your password, then we'll return you to billing."
			/>
		{/if}

		{#if transportError || form?.error}
			<AuthNotice tone="error" message={transportError || form?.error || ''} />
		{/if}

		<form
			method="POST"
			action="?/login"
			use:enhance={({ cancel }) => {
				if (loading) {
					cancel();
					return;
				}
				transportError = '';
				loading = true;
				return async ({ result, update }) => {
					try {
						if (result.type === 'error') {
							transportError = 'Unable to complete sign in. Please try again.';
							return;
						}
						await update({ reset: false });
					} catch {
						transportError = 'Unable to complete sign in. Please try again.';
					} finally {
						loading = false;
					}
				};
			}}
			class="flex flex-col gap-5"
		>
			<input type="hidden" name="next" value={data.nextPath ?? ''} />

			<AuthField
				label="Email Address"
				id="email"
				name="email"
				type="email"
				disabled={loading}
				value={form?.email ?? ''}
				required
				autocomplete="email"
				placeholder="you@example.com"
				data-testid="login-email"
			/>

			<AuthField
				label="Password"
				id="password"
				name="password"
				type={showPassword ? 'text' : 'password'}
				disabled={loading}
				required
				autocomplete="current-password"
				placeholder="Enter your password"
				data-testid="login-password"
			>
				{#snippet action()}
					<AuthPasswordToggle visible={showPassword} onclick={() => (showPassword = !showPassword)} />
				{/snippet}
			</AuthField>

			<p class="m-0 text-sm leading-relaxed text-muted-foreground">
				Forgot your password? <a href={resolve('/auth/forgot-password')}>Reset it here</a>.
			</p>

			<div class="flex flex-col gap-3">
				<Button type="submit" data-testid="login-submit" disabled={loading} class="w-full">
					{#if loading}
						<Spinner />
						Signing In...
					{:else}
						Sign In
					{/if}
				</Button>
			</div>
		</form>

		<div
			class="flex items-center gap-4 font-mono text-[0.6875rem] font-semibold tracking-[0.15em] text-muted-foreground uppercase"
		>
			<span class="h-px flex-1 bg-border"></span>
			<span class="whitespace-nowrap">Need access?</span>
			<span class="h-px flex-1 bg-border"></span>
		</div>

		<div class="flex flex-col gap-2 text-sm leading-relaxed text-muted-foreground">
			<p>Have an Account Setup Link? Open the newest setup email from TroopToTask.</p>
			<p>
				Need a fresh setup link? <a href={resolve('/auth/renew-invite')}>Request one</a>.
			</p>
			<p>
				Want access? <a href={resolve('/auth/request-access')}>Request access</a>.
			</p>
		</div>
	</div>
</AuthShell>
