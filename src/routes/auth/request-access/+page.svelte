<script lang="ts">
	import AuthNotice from '$lib/components/auth/AuthNotice.svelte';
	import AuthShell from '$lib/components/auth/AuthShell.svelte';
	import FormField from '$lib/components/ui/FormField.svelte';
	import Spinner from '$lib/components/ui/Spinner.svelte';

	let email = $state('');
	let name = $state('');
	let reason = $state('');
	let loading = $state(false);
	let submitted = $state(false);
	let errorMsg = $state('');

	async function handleSubmit(e: SubmitEvent) {
		e.preventDefault();
		if (loading) return;

		errorMsg = '';
		loading = true;

		try {
			const res = await fetch('/api/access-requests', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ email, name, reason: reason || undefined })
			});

			if (!res.ok) {
				const data = await res.json();
				errorMsg = data.message || 'Something went wrong. Please try again.';
				return;
			}

			submitted = true;
		} catch {
			errorMsg = 'Something went wrong. Please try again.';
		} finally {
			loading = false;
		}
	}
</script>

<svelte:head>
	<title>Request Access - Troop to Task</title>
</svelte:head>

<AuthShell
	eyebrow="Beta Access"
	title="Request access to the beta."
	description="This form is only for getting access to the beta."
	panelEyebrow="Beta request"
	panelTitle={submitted ? 'Request submitted' : 'Request beta access'}
	panelDescription={submitted ? 'Your beta request is in the queue.' : 'Tell us who you are and how to reach you.'}
	supportLabel="What this is for"
	supportTitle="Beta access only."
	supportDescription="If you already have an invite code, use Create Account instead. If you already have an account, sign in."
	supportPoints={[
		'This route is for beta access only.',
		'Approved users receive a setup link after review.',
		'That setup link expires after 24 hours for security.',
		'If you already have an account or invite code, use the other auth routes instead.'
	]}
>
	<div class="auth-stack">
		{#if submitted}
			<AuthNotice tone="success" title="We've got your request" centered>
				<p>We'll review your request and email <strong>{email}</strong> if access is approved.</p>
				<p>For security, that invite link will only work for 24 hours once it is sent.</p>
			</AuthNotice>

			<div class="auth-actions">
				<a href="/auth/login" class="btn btn-primary">Back to sign in</a>
			</div>
		{:else}
			{#if errorMsg}
				<AuthNotice tone="error" message={errorMsg} />
			{/if}

			<AuthNotice tone="warning" title="Important">
				<p>If your request is approved, the setup link in your email will only be valid for 24 hours.</p>
				<p>That short window is intentional for security, so plan to open it promptly.</p>
			</AuthNotice>

			<form onsubmit={handleSubmit} class="auth-stack">
				<FormField label="Full Name" id="name" bind:value={name} required placeholder="Your full name" />

				<FormField
					label="Email Address"
					id="email"
					type="email"
					bind:value={email}
					required
					placeholder="you@example.com"
				/>

				<FormField
					label="Unit or Reason"
					id="reason"
					inputElement="textarea"
					bind:value={reason}
					rows={4}
					placeholder="Tell us your unit, role, or why you want beta access"
					hint="Optional."
				/>

				<div class="auth-actions">
					<button type="submit" class="btn btn-primary" disabled={loading}>
						{#if loading}
							<Spinner />
							Submitting...
						{:else}
							Submit Request
						{/if}
					</button>
				</div>
			</form>

			<div class="auth-divider">
				<span>Other paths</span>
			</div>

			<div class="auth-link-list">
				<p>
					Have an invite code already? <a href="/auth/register">Create your account</a>.
				</p>
				<p>
					Already active? <a href="/auth/login">Sign in</a>.
				</p>
			</div>
		{/if}
	</div>
</AuthShell>
