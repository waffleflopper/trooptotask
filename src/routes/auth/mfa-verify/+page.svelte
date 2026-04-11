<script lang="ts">
	import { goto } from '$app/navigation';
	import AuthNotice from '$lib/components/auth/AuthNotice.svelte';
	import AuthShell from '$lib/components/auth/AuthShell.svelte';
	import FormField from '$lib/components/ui/FormField.svelte';
	import Spinner from '$lib/components/ui/Spinner.svelte';

	let code = $state('');
	let error = $state('');
	let loading = $state(false);

	function handleCodeInput(e: Event) {
		const input = e.target as HTMLInputElement;
		code = input.value.replace(/\D/g, '').slice(0, 6);
	}

	async function handleVerify(e: Event) {
		e.preventDefault();

		if (!code || code.length !== 6) {
			error = 'Please enter a 6-digit code';
			return;
		}

		error = '';
		loading = true;
		try {
			const response = await fetch('/api/auth/mfa/verify', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ code })
			});

			if (!response.ok) {
				const payload = (await response.json()) as { error?: string };
				error = payload.error ?? 'Verification failed';
				return;
			}

			goto('/dashboard');
		} catch (e: unknown) {
			error = e instanceof Error ? e.message : 'Verification failed';
		} finally {
			loading = false;
		}
	}
</script>

<svelte:head>
	<title>Two-Factor Authentication - Troop to Task</title>
</svelte:head>

<AuthShell
	eyebrow="Second Factor"
	title="Verify the login before the session opens."
	description="Enter the current code from your authenticator app to finish signing in."
	panelEyebrow="Two-factor authentication"
	panelTitle="Verify your code"
	supportLabel="Authenticator code"
	supportTitle="Use the current 6-digit code."
	supportDescription="Open your authenticator app and enter the latest code for this account."
	supportPoints={[
		'Codes refresh automatically after a short time.',
		'Only a verified authenticator factor can be used here.',
		'If you no longer have access to your authenticator, contact your unit admin to have the requirement removed.'
	]}
>
	<div class="auth-stack">
		{#if error}
			<AuthNotice tone="error" message={error} />
		{/if}

		<form onsubmit={handleVerify} class="auth-stack">
			<FormField label="Verification Code" id="mfa-code" hint="Enter the current code from your authenticator app.">
				<input
					id="mfa-code"
					type="text"
					class="input auth-code-input"
					value={code}
					oninput={handleCodeInput}
					placeholder="000000"
					maxlength="6"
					autocomplete="one-time-code"
					inputmode="numeric"
					aria-describedby="mfa-code-hint"
				/>
			</FormField>

			<div class="auth-actions">
				<button type="submit" class="btn btn-primary" disabled={loading || code.length !== 6}>
					{#if loading}
						<Spinner />
						Verifying...
					{:else}
						Verify
					{/if}
				</button>
			</div>
		</form>

		<div class="auth-divider">
			<span>Wrong account?</span>
		</div>

		<div class="auth-link-list">
			<p>
				Leave this verification step and <a href="/auth/logout">sign out</a>.
			</p>
		</div>
	</div>
</AuthShell>
