<script lang="ts">
	import PublicContentSection from '$lib/components/public/PublicContentSection.svelte';
	import PublicPageHeader from '$lib/components/public/PublicPageHeader.svelte';
	import PublicShell from '$lib/components/public/PublicShell.svelte';

	let { data } = $props();
</script>

<svelte:head>
	<title>Security — Troop to Task</title>
	<meta name="description" content="Security practices and NIST 800-171 compliance information for Troop to Task." />
</svelte:head>

<PublicShell user={data.user} active="security" bodyClass="security-page">
	<PublicPageHeader label="Security">
		{#snippet title()}Your data, <em>protected.</em>{/snippet}
		<p>TroopToTask aligns with NIST SP 800-171 for the protection of Controlled Unclassified Information.</p>
	</PublicPageHeader>

	<PublicContentSection label="01 // Data Classification">
		{#snippet title()}What we handle, and how we treat it.{/snippet}
		<p>
			TroopToTask manages personnel readiness data that may include Controlled Unclassified Information (CUI). This
			includes names, ranks, unit assignments, training records, counseling notes, and availability statuses. We treat
			all customer data as CUI-equivalent and apply protections accordingly.
		</p>
		<p>
			We do not process, store, or transmit classified information at any level. TroopToTask is designed exclusively for
			unclassified environments.
		</p>
	</PublicContentSection>

	<PublicContentSection label="02 // Encryption" alternate>
		{#snippet title()}Encrypted in transit and at rest.{/snippet}
		<p>
			All data transmitted between your browser and our servers is encrypted with TLS 1.2 or higher, enforced via HTTP
			Strict Transport Security (HSTS) headers. Downgrade attacks and cleartext connections are blocked.
		</p>
		<p>
			Data at rest is encrypted with AES-256 by our infrastructure providers. Database backups, file storage, and all
			persistent data stores use server-side encryption with managed keys.
		</p>
	</PublicContentSection>

	<PublicContentSection label="03 // Access Control">
		{#snippet title()}Every request is authorized.{/snippet}
		<p>
			Authentication is handled via Supabase Auth with support for email/password and multi-factor authentication
			(TOTP). Sessions are enforced with a 24-hour absolute timeout and secure, HttpOnly cookies.
		</p>
		<p>
			Authorization uses a layered approach: role-based access control (RBAC) at the application level with admin,
			editor, and viewer roles, combined with PostgreSQL Row-Level Security (RLS) policies that enforce tenant isolation
			at the database layer. Every API endpoint validates organization membership and role permissions server-side
			before processing requests.
		</p>
	</PublicContentSection>

	<PublicContentSection label="04 // Audit Logging" alternate>
		{#snippet title()}Every action leaves a trail.{/snippet}
		<p>
			TroopToTask maintains structured audit logs for security-relevant events including authentication attempts,
			permission changes, data modifications, and administrative actions. Logs capture the actor, action, resource,
			timestamp, and contextual metadata.
		</p>
		<p>
			Audit records are retained for 90 days, with automated cleanup of expired entries. Personally identifiable
			information is filtered from log details to maintain data minimization principles.
		</p>
	</PublicContentSection>

	<PublicContentSection label="05 // Infrastructure">
		{#snippet title()}Built on proven platforms.{/snippet}
		<p>TroopToTask runs on infrastructure from providers with established security programs:</p>
		<ul>
			<li><strong>Vercel</strong> — Application hosting and edge delivery. SOC 2 Type II certified.</li>
			<li>
				<strong>Supabase</strong> — PostgreSQL database, authentication, and file storage. SOC 2 Type II certified. Hosted
				on AWS with isolated tenancy.
			</li>
			<li>
				<strong>Stripe</strong> — Payment processing. PCI DSS Level 1 certified. TroopToTask never stores credit card numbers
				or payment credentials.
			</li>
		</ul>
		<p>All infrastructure is hosted within the United States.</p>
	</PublicContentSection>

	<PublicContentSection label="06 // Compliance Alignment" alternate>
		{#snippet title()}Aligned with NIST SP 800-171.{/snippet}
		<p>TroopToTask's security controls align with the following NIST SP 800-171 Rev 2 control families:</p>
		<ul>
			<li><strong>Access Control (3.1)</strong> — RBAC, RLS, session management, least privilege</li>
			<li><strong>Audit &amp; Accountability (3.3)</strong> — Structured logging, retention policies, PII filtering</li>
			<li>
				<strong>Identification &amp; Authentication (3.5)</strong> — MFA support, password policies, session timeouts
			</li>
			<li><strong>System &amp; Communications Protection (3.13)</strong> — TLS 1.2+, AES-256, security headers, CSP</li>
			<li>
				<strong>System &amp; Information Integrity (3.14)</strong> — Input validation, rate limiting, error handling
			</li>
			<li><strong>Incident Response (3.6)</strong> — Documented response procedures, contact channels</li>
		</ul>
		<p>
			While we are not FedRAMP authorized, we continuously improve our posture to support organizations that handle CUI.
		</p>
	</PublicContentSection>

	<PublicContentSection label="07 // Responsible Disclosure">
		{#snippet title()}Report a vulnerability.{/snippet}
		<p>
			If you discover a security vulnerability in TroopToTask, we encourage responsible disclosure. Please report
			findings to:
		</p>
		<div class="contact-card">
			<svg
				viewBox="0 0 24 24"
				width="20"
				height="20"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
			>
				<path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
				<polyline points="22,6 12,13 2,6" />
			</svg>
			<a href="mailto:security@trooptotask.app">security@trooptotask.app</a>
		</div>
		<p>
			We ask that you provide a reasonable amount of time for us to address reported issues before public disclosure. We
			will acknowledge receipt within 48 hours and aim to provide a resolution timeline within 5 business days.
		</p>
	</PublicContentSection>
</PublicShell>
