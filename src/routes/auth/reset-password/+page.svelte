<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import AuthNotice from '$lib/components/auth/AuthNotice.svelte';
	import AuthShell from '$lib/components/auth/AuthShell.svelte';
	import FormField from '$lib/components/ui/FormField.svelte';
	import Spinner from '$lib/components/ui/Spinner.svelte';
	import { onMount } from 'svelte';

	const supabase = $derived($page.data.supabase);

	let password = $state('');
	let confirmPassword = $state('');
	let loading = $state(false);
	let error = $state('');
	let success = $state(false);
	let sessionReady = $state(false);

	let authSubscription: { unsubscribe: () => void } | null = null;

	onMount(() => {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase auth getSession returns complex internal type
		supabase.auth.getSession().then(({ data: { session } }: any) => {
			if (session) {
				sessionReady = true;
			}
		});

		const {
			data: { subscription }
		} = supabase.auth.onAuthStateChange((event: string) => {
			if (event === 'PASSWORD_RECOVERY') {
				sessionReady = true;
			}
		});
		authSubscription = subscription;

		return () => authSubscription?.unsubscribe();
	});

	async function handleSubmit(e: Event) {
		e.preventDefault();
		error = '';

		if (password.length < 6) {
			error = 'Password must be at least 6 characters';
			return;
		}

		if (password !== confirmPassword) {
			error = 'Passwords do not match';
			return;
		}

		loading = true;
		try {
			const { error: updateError } = await supabase.auth.updateUser({ password });

			if (updateError) {
				error = updateError.message;
				return;
			}

			success = true;
			setTimeout(() => goto('/auth/login'), 3000);
		} finally {
			loading = false;
		}
	}
</script>

<svelte:head>
	<title>Reset Password - Troop to Task</title>
</svelte:head>

<AuthShell
	eyebrow="Credential Recovery"
	title="Set a new password and move on."
	description="Once the recovery link is verified, this screen should be the last stop before you're back inside the platform."
	panelEyebrow="Password reset"
	panelTitle={success ? 'Password updated' : sessionReady ? 'Choose a new password' : 'Verifying reset link'}
	panelDescription={success
		? "You'll be redirected to sign in shortly."
		: sessionReady
			? 'Enter the new password you want to use for future sign-ins.'
			: "We're confirming the recovery session before allowing a password change."}
	supportLabel="Reset session"
	supportTitle="Use the link, then set the password."
	supportDescription="You can only change the password here after the reset link has been verified."
	supportPoints={[
		'Choose the new password you want to use going forward.',
		'If the link is no longer valid, request a new reset email.',
		'After updating the password, sign in normally.'
	]}
>
	<div class="auth-stack">
		{#if success}
			<AuthNotice tone="success" title="Password updated" centered>
				<p>Your password has been reset successfully.</p>
				<p>Redirecting you to sign in now.</p>
			</AuthNotice>
		{:else if !sessionReady}
			<div class="auth-loading">
				<Spinner color="var(--amber)" />
				<p class="auth-note">Verifying reset link...</p>
			</div>
		{:else}
			{#if error}
				<AuthNotice tone="error" message={error} />
			{/if}

			<form onsubmit={handleSubmit} class="auth-stack">
				<FormField
					label="New Password"
					id="password"
					type="password"
					bind:value={password}
					required
					placeholder="At least 6 characters"
					hint="Use at least 6 characters for your new password."
				/>

				<FormField
					label="Confirm New Password"
					id="confirmPassword"
					type="password"
					bind:value={confirmPassword}
					required
					placeholder="Re-enter your password"
				/>

				<div class="auth-actions">
					<button type="submit" class="btn btn-primary" disabled={loading}>
						{#if loading}
							<Spinner />
							Updating Password...
						{:else}
							Update Password
						{/if}
					</button>
				</div>
			</form>
		{/if}

		<div class="auth-divider">
			<span>Need a different path?</span>
		</div>

		<div class="auth-link-list">
			<p>
				Back to <a href="/auth/login">sign in</a>.
			</p>
		</div>
	</div>
</AuthShell>
