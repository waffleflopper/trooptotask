<script lang="ts">
	import AuthButton from '$features/identity/AuthButton.svelte';
	import AuthField from '$features/identity/AuthField.svelte';
	import AuthNotice from '$features/identity/AuthNotice.svelte';
	import AuthPasswordToggle from '$features/identity/AuthPasswordToggle.svelte';
	import AuthShell from '$features/identity/AuthShell.svelte';
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';

	let { form, data } = $props();
	let loading = $state(false);
	let showPassword = $state(false);
	let transportError = $state('');
	// A browser keeps the visited fragment across the sign-in redirect but never sends it to the server.
	const carriedNext = $derived.by(() => {
		const nextPath = form?.nextPath ?? data.nextPath;
		if (!nextPath) return '';
		return nextPath.includes('#') ? nextPath : `${nextPath}${page.url.hash}`;
	});
</script>

<svelte:head>
	<title>Sign In - Troop to Task</title>
</svelte:head>

<AuthShell
	eyebrow="Account Access"
	headline={['Report in.', "See who's ready."]}
	lede="Your unit's availability, training and in-processing are waiting on the other side."
	panelEyebrow="Existing account"
	panelTitle="Sign in"
	panelDescription="Use the email and password tied to your account."
	alternatives={[
		{ prompt: 'Setup link expired?', label: 'Request a fresh one', href: resolve('/auth/renew-invite') },
		{ prompt: 'Unit not on TroopToTask?', label: 'Request access', href: resolve('/auth/request-access') }
	]}
>
	<div class="flex flex-col gap-5">
		{#if data.authLinkError}
			<AuthNotice tone="error" message={data.authLinkError} />
		{/if}

		{#if data.reauth}
			<AuthNotice tone="info" message="Re-enter your password to confirm your identity and continue." />
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
						await update({ reset: false, navigate: false });
					} catch {
						transportError = 'Unable to complete sign in. Please try again.';
					} finally {
						loading = false;
					}
				};
			}}
			class="flex flex-col gap-8"
		>
			<input type="hidden" name="next" value={carriedNext} />

			<div class="flex flex-col gap-5">
				<AuthField
					label="Email Address"
					id="email"
					name="email"
					type="email"
					disabled={loading}
					value={form?.email ?? ''}
					required
					autocomplete="email"
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
					data-testid="login-password"
				>
					{#snippet labelAction()}
						<a
							href={resolve('/auth/forgot-password')}
							class="text-sm leading-[18px] text-foreground underline decoration-1 underline-offset-[3px]"
						>
							Forgot password?
						</a>
					{/snippet}
					{#snippet action()}
						<AuthPasswordToggle visible={showPassword} onclick={() => (showPassword = !showPassword)} />
					{/snippet}
				</AuthField>
			</div>

			<AuthButton data-testid="login-submit" {loading} loadingLabel="Signing In...">Sign In</AuthButton>
		</form>
	</div>
</AuthShell>
