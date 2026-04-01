<script lang="ts">
	// Server-side guard ensures only suspended users see this
</script>

<div class="suspended-container">
	<div class="suspended-card">
		<p class="eyebrow">Access Restricted</p>
		<h1>Account Suspended</h1>
		<p class="message">
			This account is currently suspended. If you believe that is incorrect, contact support so we can review it.
		</p>
		<div class="contact-panel">
			<p class="contact-label">Support</p>
			<p class="contact">support@trooptotask.com</p>
		</div>
		<a href="/auth/login" class="btn btn-secondary">Back to Login</a>
	</div>
</div>

<style>
	.suspended-container {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 100vh;
		background: var(--surface-page);
		padding: var(--sp-6);
	}

	.suspended-card {
		display: flex;
		flex-direction: column;
		gap: var(--sp-4);
		max-width: 480px;
		background: var(--surface-panel);
		border: var(--border-thin);
		border-radius: var(--radius-lg);
		padding: var(--sp-6);
		box-shadow: var(--shadow-lg);
	}

	.eyebrow,
	.contact-label {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--amber);
		margin: 0;
	}

	h1 {
		font-family: var(--font-display);
		font-size: clamp(2.3rem, 5vw, 3.2rem);
		line-height: 0.94;
		font-weight: 800;
		text-transform: uppercase;
		color: var(--danger);
		margin: 0;
	}

	.message {
		color: var(--text-secondary);
		margin: 0;
		line-height: 1.6;
	}

	.contact-panel {
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
		padding: var(--sp-4);
		border: var(--border-thin);
		border-radius: var(--radius-md);
		background: color-mix(in srgb, var(--surface-subtle) 72%, var(--surface-panel) 28%);
	}

	.contact {
		margin: 0;
		font-size: var(--text-base);
		font-weight: 600;
		color: var(--text-strong);
	}

	@media (max-width: 640px) {
		.suspended-container {
			padding: var(--sp-4);
		}

		.suspended-card {
			padding: var(--sp-5);
		}
	}
</style>
