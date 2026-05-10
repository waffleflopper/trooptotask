<script lang="ts">
	import { enhance } from '$app/forms';
	import AuthField from '$lib/components/auth/AuthField.svelte';
	import AuthNotice from '$lib/components/auth/AuthNotice.svelte';
	import AuthPasswordToggle from '$lib/components/auth/AuthPasswordToggle.svelte';
	import AuthShell from '$lib/components/auth/AuthShell.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { Spinner } from '$lib/components/ui/spinner';

	let { form, data } = $props();
	let loading = $state(false);
	let showPassword = $state(false);
	let showConfirmPassword = $state(false);

	const initialInviteCode = $derived(form?.inviteCode ?? data.inviteCode ?? '');
	const initialEmail = $derived(form?.email ?? data.email ?? '');
</script>

<svelte:head>
	<title>Create Account - Troop to Task</title>
</svelte:head>

<AuthShell
	eyebrow="Organization Invite"
	title="Create your account from an invite."
	description="Use the invite code from an organization invite to create your account and join that organization."
	panelEyebrow="New account"
	panelTitle={form?.confirmEmail ? 'Check your email' : 'Create your account'}
	panelDescription={form?.confirmEmail
		? 'One more step remains before you can sign in.'
		: 'Enter the invite code you received and choose a password that meets policy.'}
	supportLabel="Joining an organization"
	supportTitle="This page is for invited users."
	supportDescription="If an organization invited you by email, use the invite code from that email to create your account."
	supportPoints={[
		'Your account will be linked to the organization that invited you.',
		'Use the same email address the invite was sent to.',
		'If you already have an account, sign in instead of creating a new one.'
	]}
>
	<div class="flex flex-col gap-5">
		{#if form?.confirmEmail}
			<AuthNotice tone="success" title="Confirm your email" centered>
				<p>We sent a confirmation link to <strong>{form.email}</strong>.</p>
				<p>Open that message, confirm the account, then return here to sign in.</p>
			</AuthNotice>

			<div class="flex flex-col gap-3">
				<Button href="/auth/login" class="w-full">Back to sign in</Button>
				<Button href="/auth/register" variant="outline" class="w-full">Start over</Button>
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
					label="Invite Code"
					id="inviteCode"
					name="inviteCode"
					value={initialInviteCode}
					required
					placeholder="Enter your invite code"
					hint="Registration is by invitation only."
				/>

				<AuthField
					label="Email Address"
					id="email"
					name="email"
					type="email"
					value={initialEmail}
					required
					placeholder="you@example.com"
				/>

				<AuthField
					label="Password"
					id="password"
					name="password"
					type={showPassword ? 'text' : 'password'}
					required
					placeholder="At least 12 characters"
					hint="Use at least 12 characters with uppercase, lowercase, and a number."
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
					placeholder="Re-enter your password"
				>
					{#snippet action()}
						<AuthPasswordToggle
							visible={showConfirmPassword}
							onclick={() => (showConfirmPassword = !showConfirmPassword)}
						/>
					{/snippet}
				</AuthField>

				<div class="rounded-lg border bg-muted/35 p-4">
					<label class="flex items-start gap-3 text-sm leading-relaxed text-muted-foreground">
						<Checkbox name="agreeTerms" required class="mt-0.5" />
						<span>
							I have read and agree to the <a href="/terms" target="_blank" rel="noreferrer">Terms of Use</a> and
							<a href="/privacy" target="_blank" rel="noreferrer">Privacy Policy</a>.
						</span>
					</label>
				</div>

				<div class="flex flex-col gap-3">
					<Button type="submit" disabled={loading} class="w-full">
						{#if loading}
							<Spinner />
							Creating Account...
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
				<span class="whitespace-nowrap">Already registered?</span>
				<span class="h-px flex-1 bg-border"></span>
			</div>

			<div class="flex flex-col gap-2 text-sm leading-relaxed text-muted-foreground">
				<p>
					Already have an account? <a href="/auth/login">Sign in</a>.
				</p>
			</div>
		{/if}
	</div>
</AuthShell>
