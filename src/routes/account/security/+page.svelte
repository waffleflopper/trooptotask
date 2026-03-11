<script lang="ts">
	import type { PageData } from './$types';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';

	const supabase = $derived($page.data.supabase);
	import Spinner from '$lib/components/ui/Spinner.svelte';

	let { data }: { data: PageData } = $props();

	let mfaEnabled = $state(false);

	$effect(() => {
		mfaEnabled = data.hasMFA;
	});
	let enrolling = $state(false);
	let qrCode = $state('');
	let factorId = $state('');
	let verifyCode = $state('');
	let error = $state('');
	let success = $state('');
	let loading = $state(false);
	let disabling = $state(false);

	async function startEnroll() {
		error = '';
		enrolling = true;
		loading = true;
		try {
			const { data: enrollData, error: enrollError } = await supabase.auth.mfa.enroll({
				factorType: 'totp'
			});

			if (enrollError) {
				error = enrollError.message;
				enrolling = false;
				return;
			}

			if (enrollData) {
				factorId = enrollData.id;
				qrCode = enrollData.totp.qr_code;
			}
		} catch (e: any) {
			error = e.message || 'Failed to start MFA enrollment';
			enrolling = false;
		} finally {
			loading = false;
		}
	}

	async function verifyEnrollment() {
		if (!verifyCode || verifyCode.length !== 6) {
			error = 'Please enter a 6-digit code';
			return;
		}

		error = '';
		loading = true;
		try {
			const { data: challengeData, error: challengeError } =
				await supabase.auth.mfa.challengeAndVerify({
					factorId,
					code: verifyCode
				});

			if (challengeError) {
				error = challengeError.message;
				return;
			}

			success = 'MFA has been enabled successfully.';
			mfaEnabled = true;
			enrolling = false;
			qrCode = '';
			verifyCode = '';
		} catch (e: any) {
			error = e.message || 'Verification failed';
		} finally {
			loading = false;
		}
	}

	async function cancelEnroll() {
		if (factorId) {
			await supabase.auth.mfa.unenroll({ factorId });
		}
		enrolling = false;
		qrCode = '';
		factorId = '';
		verifyCode = '';
		error = '';
	}

	async function disableMFA() {
		error = '';
		success = '';
		disabling = true;
		try {
			const { data: factors } = await supabase.auth.mfa.listFactors();
			const totpFactors = factors?.totp ?? [];
			const verifiedFactor = totpFactors.find((f: any) => f.status === 'verified');

			if (!verifiedFactor) {
				error = 'No verified MFA factor found';
				return;
			}

			const { error: unenrollError } = await supabase.auth.mfa.unenroll({
				factorId: verifiedFactor.id
			});

			if (unenrollError) {
				error = unenrollError.message;
				return;
			}

			success = 'MFA has been disabled.';
			mfaEnabled = false;
		} catch (e: any) {
			error = e.message || 'Failed to disable MFA';
		} finally {
			disabling = false;
		}
	}

	function handleCodeInput(e: Event) {
		const input = e.target as HTMLInputElement;
		verifyCode = input.value.replace(/\D/g, '').slice(0, 6);
	}
</script>

<svelte:head>
	<title>Account Security - Troop to Task</title>
</svelte:head>

<div class="security-page">
	<div class="security-container">
		<header class="page-header">
			<h1>Account Security</h1>
			<a href="/dashboard" class="btn btn-secondary">Back to Dashboard</a>
		</header>

		{#if error}
			<div class="alert alert-error">{error}</div>
		{/if}
		{#if success}
			<div class="alert alert-success">{success}</div>
		{/if}

		<section class="security-section">
			<h2>Two-Factor Authentication (MFA)</h2>
			<p class="section-description">
				Add an extra layer of security to your account by requiring a verification code from your
				authenticator app when signing in.
			</p>

			<div class="mfa-status">
				<div class="status-indicator" class:enabled={mfaEnabled}>
					<span class="status-dot"></span>
					{mfaEnabled ? 'Enabled' : 'Disabled'}
				</div>
			</div>

			{#if !mfaEnabled && !enrolling}
				<button class="btn btn-primary" onclick={startEnroll} disabled={loading}>
					{#if loading}<Spinner />{/if}
					Enable MFA
				</button>
			{/if}

			{#if enrolling && qrCode}
				<div class="enroll-section">
					<h3>Set up your authenticator</h3>
					<p class="enroll-instructions">
						Scan this QR code with your authenticator app (Google Authenticator, Authy, 1Password,
						etc.), then enter the 6-digit verification code below.
					</p>

					<div class="qr-container">
						<img src={qrCode} alt="MFA QR Code" class="qr-code" />
					</div>

					<form
						class="verify-form"
						onsubmit={(e) => {
							e.preventDefault();
							verifyEnrollment();
						}}
					>
						<div class="form-group">
							<label class="label" for="verify-code">Verification Code</label>
							<input
								id="verify-code"
								type="text"
								class="input code-input"
								value={verifyCode}
								oninput={handleCodeInput}
								placeholder="000000"
								maxlength="6"
								autocomplete="one-time-code"
								inputmode="numeric"
							/>
						</div>
						<div class="enroll-actions">
							<button type="button" class="btn btn-secondary" onclick={cancelEnroll}>
								Cancel
							</button>
							<button
								type="submit"
								class="btn btn-primary"
								disabled={loading || verifyCode.length !== 6}
							>
								{#if loading}<Spinner />{/if}
								Verify & Enable
							</button>
						</div>
					</form>
				</div>
			{/if}

			{#if mfaEnabled && !enrolling}
				<button class="btn btn-danger" onclick={disableMFA} disabled={disabling}>
					{#if disabling}<Spinner />{/if}
					Disable MFA
				</button>
			{/if}
		</section>
	</div>
</div>

<style>
	.security-page {
		min-height: 100vh;
		background: var(--color-bg);
		padding: var(--spacing-xl);
	}

	.security-container {
		max-width: 600px;
		margin: 0 auto;
	}

	.page-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: var(--spacing-xl);
	}

	.page-header h1 {
		font-size: 1.5rem;
		font-weight: 600;
		color: var(--color-text);
		margin: 0;
	}

	.security-section {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		padding: var(--spacing-lg);
	}

	.security-section h2 {
		font-size: var(--font-size-lg);
		font-weight: 600;
		color: var(--color-text);
		margin: 0 0 var(--spacing-sm) 0;
	}

	.section-description {
		color: var(--color-text-secondary);
		font-size: var(--font-size-sm);
		margin: 0 0 var(--spacing-md) 0;
		line-height: 1.5;
	}

	.mfa-status {
		margin-bottom: var(--spacing-md);
	}

	.status-indicator {
		display: inline-flex;
		align-items: center;
		gap: var(--spacing-sm);
		font-size: var(--font-size-sm);
		font-weight: 500;
		color: var(--color-text-secondary);
	}

	.status-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--color-text-muted);
	}

	.status-indicator.enabled .status-dot {
		background: var(--color-success);
	}

	.status-indicator.enabled {
		color: var(--color-success);
	}

	.alert {
		padding: var(--spacing-sm) var(--spacing-md);
		border-radius: var(--radius-md);
		font-size: var(--font-size-sm);
		margin-bottom: var(--spacing-md);
	}

	.alert-error {
		background: #fef2f2;
		border: 1px solid #fecaca;
		color: #dc2626;
	}

	.alert-success {
		background: #f0fdf4;
		border: 1px solid #bbf7d0;
		color: #16a34a;
	}

	:global([data-theme='dark']) .alert-error {
		background: #450a0a;
		border-color: #7f1d1d;
		color: #fca5a5;
	}

	:global([data-theme='dark']) .alert-success {
		background: #14532d;
		border-color: #166534;
		color: #4ade80;
	}

	.enroll-section {
		margin-top: var(--spacing-md);
		padding-top: var(--spacing-md);
		border-top: 1px solid var(--color-border);
	}

	.enroll-section h3 {
		font-size: var(--font-size-base);
		font-weight: 600;
		color: var(--color-text);
		margin: 0 0 var(--spacing-sm) 0;
	}

	.enroll-instructions {
		color: var(--color-text-secondary);
		font-size: var(--font-size-sm);
		margin: 0 0 var(--spacing-md) 0;
		line-height: 1.5;
	}

	.qr-container {
		display: flex;
		justify-content: center;
		margin-bottom: var(--spacing-lg);
	}

	.qr-code {
		width: 200px;
		height: 200px;
		border-radius: var(--radius-sm);
		border: 1px solid var(--color-border);
	}

	.verify-form {
		max-width: 300px;
	}

	.code-input {
		font-family: var(--font-mono);
		font-size: var(--font-size-lg);
		letter-spacing: 0.3em;
		text-align: center;
	}

	.enroll-actions {
		display: flex;
		gap: var(--spacing-sm);
		margin-top: var(--spacing-md);
	}
</style>
