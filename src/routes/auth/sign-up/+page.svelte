<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import AuthField from '$lib/components/auth/AuthField.svelte';
	import AuthNotice from '$lib/components/auth/AuthNotice.svelte';
	import AuthPasswordToggle from '$lib/components/auth/AuthPasswordToggle.svelte';
	import AuthShell from '$lib/components/auth/AuthShell.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Spinner } from '$lib/components/ui/spinner';

	let { form } = $props();
	let loading = $state(false);
	let showPassword = $state(false);
	let showConfirmPassword = $state(false);
</script>

<svelte:head>
	<title>Create Account - Troop to Task</title>
</svelte:head>

<AuthShell
	eyebrow="Account Creation"
	title="Create your TroopToTask account."
	description="Confirm your email before continuing into organization setup."
	panelEyebrow="Self-service signup"
	panelTitle={form?.success ? 'Check your email' : 'Create account'}
	panelDescription={form?.success
		? 'Use the confirmation link we sent to continue.'
		: 'Start with your email and password.'}
	imageSrc="/auth/auth-login-command-desk.png"
	imageAlt="A military command-post desk with a map, notebook, compass, and rugged laptop."
	supportLabel="What happens next"
	supportTitle="Email confirmation comes first."
	supportDescription="Signup only creates the identity layer. Organization setup and billing happen after email confirmation."
	supportPoints={[
		'Use an email address you control.',
		'Confirm the email link before creating an Organization.',
		'Signup does not create Organization Membership or start checkout.',
		'If billing is not enabled, use Request Access instead.'
	]}
>
	<div class="flex flex-col gap-5">
		{#if form?.success}
			<AuthNotice tone="success" title="Confirmation email sent" centered>
				<p>{form.message}</p>
				<p>Open the newest email for <strong>{form.email}</strong> to confirm your account.</p>
			</AuthNotice>

			<div class="flex flex-col gap-3">
				<Button href={resolve('/auth/login')} class="w-full">Back to Sign In</Button>
			</div>
		{:else}
			{#if form?.error}
				<AuthNotice tone="error" message={form.error} />
			{/if}

			<form
				method="POST"
				use:enhance={() => {
					loading = true;
					return async ({ update }) => {
						loading = false;
						await update();
					};
				}}
				class="flex flex-col gap-5"
			>
				<AuthField
					label="Email Address"
					id="email"
					name="email"
					type="email"
					value={form?.email ?? ''}
					required
					autocomplete="email"
					placeholder="you@example.com"
					data-testid="signup-email"
				/>

				<AuthField
					label="Password"
					id="password"
					name="password"
					type={showPassword ? 'text' : 'password'}
					required
					autocomplete="new-password"
					placeholder="Create a password"
					hint="Use at least 12 characters with uppercase, lowercase, and a number."
					data-testid="signup-password"
				>
					{#snippet action()}
						<AuthPasswordToggle visible={showPassword} onclick={() => (showPassword = !showPassword)} />
					{/snippet}
				</AuthField>

				<AuthField
					label="Confirm Password"
					id="confirmPassword"
					name="confirmPassword"
					type={showConfirmPassword ? 'text' : 'password'}
					required
					autocomplete="new-password"
					placeholder="Repeat the password"
					data-testid="signup-confirm-password"
				>
					{#snippet action()}
						<AuthPasswordToggle
							visible={showConfirmPassword}
							onclick={() => (showConfirmPassword = !showConfirmPassword)}
						/>
					{/snippet}
				</AuthField>

				<div class="flex flex-col gap-3">
					<Button type="submit" disabled={loading} class="w-full" data-testid="signup-submit">
						{#if loading}
							<Spinner />
							Creating...
						{:else}
							Create Account
						{/if}
					</Button>
				</div>
			</form>

			<div
				class="flex items-center gap-4 font-mono text-[0.6875rem] font-semibold tracking-[0.15em] text-muted-foreground uppercase"
			>
				<span class="h-px flex-1 bg-border"></span>
				<span class="whitespace-nowrap">Other paths</span>
				<span class="h-px flex-1 bg-border"></span>
			</div>

			<div class="flex flex-col gap-2 text-sm leading-relaxed text-muted-foreground">
				<p>
					Already active? <a href={resolve('/auth/login')}>Sign in</a>.
				</p>
				<p>
					Billing not enabled? <a href={resolve('/auth/request-access')}>Request access</a>.
				</p>
			</div>
		{/if}
	</div>
</AuthShell>
