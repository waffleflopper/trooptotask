<script lang="ts">
	import PublicContentSection from '$lib/components/public/PublicContentSection.svelte';
	import PublicPageHeader from '$lib/components/public/PublicPageHeader.svelte';
	import PublicShell from '$lib/components/public/PublicShell.svelte';

	let { data } = $props();

	const sections = [
		{ id: 'data-classification', num: '01', label: 'Classification' },
		{ id: 'encryption', num: '02', label: 'Encryption' },
		{ id: 'access-control', num: '03', label: 'Access' },
		{ id: 'audit-logging', num: '04', label: 'Audit' },
		{ id: 'infrastructure', num: '05', label: 'Infrastructure' },
		{ id: 'compliance', num: '06', label: 'Compliance' },
		{ id: 'disclosure', num: '07', label: 'Disclosure' }
	];
</script>

<svelte:head>
	<title>Security — Troop to Task</title>
	<meta name="description" content="Security practices and NIST 800-171 alignment information for Troop to Task." />
</svelte:head>

<PublicShell user={data.user} active="security">
	<PublicPageHeader label="Security">
		{#snippet title()}Your data, <em>protected.</em>{/snippet}
		<p>TroopToTask aligns with NIST SP 800-171 for the protection of Controlled Unclassified Information.</p>
		<p class="page-meta">Last reviewed: May 2026</p>
	</PublicPageHeader>

	<nav class="section-index" aria-label="On this page">
		<ul>
			{#each sections as section (section.id)}
				<li>
					<a href={`#${section.id}`}><span class="idx-num">{section.num}</span>{section.label}</a>
				</li>
			{/each}
		</ul>
	</nav>

	<PublicContentSection id="data-classification" label="01 // Data Classification">
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

	<PublicContentSection id="encryption" label="02 // Encryption" alternate>
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

	<PublicContentSection id="access-control" label="03 // Access Control">
		{#snippet title()}Every request is authorized.{/snippet}
		<p>
			Authentication is handled via Supabase Auth with support for email/password and multi-factor authentication
			(TOTP). Sessions are enforced with a 24-hour absolute timeout and secure cookie handling.
		</p>
		<p>
			Authorization uses a layered approach: role-based access control (RBAC) at the application level with admin,
			editor, and viewer roles, combined with PostgreSQL Row-Level Security (RLS) policies that enforce tenant isolation
			at the database layer. Every API endpoint validates organization membership and role permissions server-side
			before processing requests. Sensitive document uploads and downloads are mediated through application endpoints,
			with private storage access enforced by explicit policies and short-lived signed URLs.
		</p>
	</PublicContentSection>

	<PublicContentSection id="audit-logging" label="04 // Audit Logging" alternate>
		{#snippet title()}Security events leave a trail.{/snippet}
		<p>
			TroopToTask maintains structured audit logs for security-relevant events including authentication attempts,
			permission changes, data modifications, and administrative actions. Logs capture the actor, action, resource,
			timestamp, and limited contextual metadata needed for accountability and review.
		</p>
		<p>
			Audit records are retained for 1 year, with automated cleanup of expired entries. Audit details exclude full
			record contents and unnecessary sensitive fields while preserving the limited identifiers needed to answer who did
			what to which record.
		</p>
	</PublicContentSection>

	<PublicContentSection id="infrastructure" label="05 // Infrastructure">
		{#snippet title()}Built on proven platforms.{/snippet}
		<p>TroopToTask runs on infrastructure from providers with established security programs:</p>
		<ul>
			<li><strong>Vercel</strong> — Application hosting and edge delivery. SOC 2 Type II certified.</li>
			<li>
				<strong>Supabase</strong> — PostgreSQL database, authentication, and file storage. SOC 2 Type II certified. Hosted
				on AWS with isolated tenancy.
			</li>
		</ul>
		<p>All infrastructure is hosted within the United States.</p>
	</PublicContentSection>

	<PublicContentSection id="compliance" label="06 // Compliance & Use" alternate>
		{#snippet title()}Aligned with NIST, used with judgment.{/snippet}
		<p>TroopToTask's security controls align with the following NIST SP 800-171 Rev 2 control families:</p>
		<ul>
			<li><strong>Access Control (3.1)</strong> — RBAC, RLS, session management, least privilege</li>
			<li>
				<strong>Audit &amp; Accountability (3.3)</strong> — Structured logging, retention policies, and minimized audit details
			</li>
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
			TroopToTask is built for military leaders who need a practical, secure way to stay on top of personnel and
			readiness without creating more administrative drag.
		</p>
		<p>
			FedRAMP and formal federal procurement involve a separate, additional compliance review. That process does not, by
			itself, determine whether a commercial platform is useful, secure, and workable for leaders operating within their
			local policy, command guidance, and approval chain.
		</p>
		<p>
			Use TroopToTask in ways that match local policy and sound judgment: keep classified information, highly sensitive
			operational details, and anything your command or cybersecurity office has directed to remain in approved
			government systems out of the platform. Our aim is a secure, dependable tool leaders can trust today, while we
			continue to strengthen it for more demanding compliance environments.
		</p>
	</PublicContentSection>

	<PublicContentSection id="disclosure" label="07 // Responsible Disclosure">
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
			<a href="mailto:security@trooptotask.org?subject=Security%20vulnerability%20report">security@trooptotask.org</a>
		</div>
		<p>
			We ask that you provide a reasonable amount of time for us to address reported issues before public disclosure. We
			will acknowledge receipt within 48 hours and aim to provide a resolution timeline within 5 business days.
		</p>
	</PublicContentSection>
</PublicShell>

<style>
	.section-index {
		position: sticky;
		top: 56px;
		z-index: 40;
		background: var(--card);
		border-bottom: 1px solid var(--border);
	}

	.section-index ul {
		display: flex;
		gap: 0.25rem;
		align-items: stretch;
		max-width: 780px;
		margin: 0 auto;
		padding: 0 1rem;
		list-style: none;
		overflow-x: auto;
		scrollbar-width: thin;
	}

	.section-index a {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.7rem 0.65rem;
		white-space: nowrap;
		font-family: 'IBM Plex Mono', monospace;
		font-size: 0.6875rem;
		font-weight: 500;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		text-decoration: none;
		color: var(--muted-foreground);
		border-bottom: 2px solid transparent;
		transition:
			color var(--transition-fast),
			border-color var(--transition-fast);
	}

	.section-index a:hover {
		color: var(--brass-text);
		border-bottom-color: var(--brass);
	}

	.section-index a:focus-visible {
		outline: var(--focus-outline);
		outline-offset: -2px;
	}

	.idx-num {
		color: var(--brass-text);
		font-weight: 600;
	}

	@media (max-width: 640px) {
		.section-index ul {
			padding-inline: 0.5rem;
		}
	}
</style>
