<script lang="ts">
	import { resolve } from '$app/paths';
	import PublicContentSection from '$lib/components/public/PublicContentSection.svelte';
	import PublicPageHeader from '$lib/components/public/PublicPageHeader.svelte';
	import PublicShell from '$lib/components/public/PublicShell.svelte';

	let { data } = $props();
</script>

<svelte:head>
	<title>Terms of Use — Troop to Task</title>
	<meta name="description" content="Terms of Use for TroopToTask, a military personnel management platform." />
</svelte:head>

<PublicShell user={data.user} bodyClass="legal-page">
	<PublicPageHeader label="Terms of Use">
		{#snippet title()}Terms of <em>Use</em>{/snippet}
		<p>
			Please read these terms carefully before using TroopToTask. By accessing or using the service, you agree to be
			bound by these terms.
		</p>
		<p class="page-meta">Effective Date: March 8, 2026</p>
	</PublicPageHeader>

	<PublicContentSection label="01 // Acceptance of Terms">
		{#snippet title()}By using TroopToTask, you agree.{/snippet}
		<p>
			By creating an account or using TroopToTask, you agree to these terms. If you do not agree, do not use the
			service. We may update these terms; continued use constitutes acceptance of changes.
		</p>
	</PublicContentSection>

	<PublicContentSection label="02 // Description of Service" alternate>
		{#snippet title()}What TroopToTask provides.{/snippet}
		<p>
			TroopToTask is a web-based personnel management platform for military unit leaders. It provides calendar
			management, training tracking, duty assignments, counseling records, in-processing checklists, and related tools.
			Specific features such as Duty Rosters may still be labeled beta or evolving when they are supported but still
			changing.
		</p>
	</PublicContentSection>

	<PublicContentSection label="03 // User Accounts &amp; Responsibilities">
		{#snippet title()}Your account, your responsibility.{/snippet}
		<p>
			You are responsible for maintaining the confidentiality of your account credentials. You must not share your
			account or grant access to unauthorized individuals. You are responsible for all activity under your account.
		</p>
		<p>
			You must provide accurate information and keep it current. Organization owners are responsible for managing member
			access and permissions within their organizations.
		</p>
	</PublicContentSection>

	<PublicContentSection label="04 // Acceptable Use" alternate>
		{#snippet title()}Use the service responsibly.{/snippet}
		<p>You agree to use TroopToTask only for lawful purposes related to military unit management. You must not:</p>
		<ul>
			<li>Attempt to gain unauthorized access to other accounts or systems</li>
			<li>Upload malicious code or content</li>
			<li>Use the service to store classified information</li>
			<li>Interfere with or disrupt the service</li>
			<li>Reverse engineer, decompile, or disassemble any part of the service</li>
			<li>Use the service for commercial purposes unrelated to military unit management</li>
		</ul>
	</PublicContentSection>

	<PublicContentSection label="05 // Data &amp; Privacy">
		{#snippet title()}Your data belongs to you.{/snippet}
		<p>
			Your use of TroopToTask is also governed by our <a href={resolve('/privacy')}>Privacy Policy</a>. You retain
			ownership of all data you enter into the platform. We do not sell or monetize your data. We share data with
			service providers only to deliver the service, as described in our Privacy Policy. See our Privacy Policy for full
			details on data handling.
		</p>
	</PublicContentSection>

	<PublicContentSection label="06 // Intellectual Property">
		{#snippet title()}Service ownership and your content.{/snippet}
		<p>
			The TroopToTask service, including its design, code, and documentation, is the property of TroopToTask and
			protected by applicable intellectual property laws. Your data remains yours.
		</p>
	</PublicContentSection>

	<PublicContentSection label="07 // Limitation of Liability" alternate>
		{#snippet title()}Provided "as is" without warranty.{/snippet}
		<p>
			TroopToTask is provided "as is" without warranties of any kind, express or implied. To the maximum extent
			permitted by law, TroopToTask shall not be liable for any indirect, incidental, special, consequential, or
			punitive damages, including but not limited to loss of data, loss of profits, or business interruption, arising
			from your use of or inability to use the service.
		</p>
		<p>
			TroopToTask is not an official Department of Defense system and should not be used as the sole system of record
			for any official military purpose.
		</p>
	</PublicContentSection>

	<PublicContentSection label="08 // Termination">
		{#snippet title()}Access may be revoked.{/snippet}
		<p>
			We may suspend or terminate your access to the service at any time for violation of these terms or for any other
			reason at our discretion. You may delete your account and data at any time. Upon termination, your right to use
			the service ceases immediately.
		</p>
	</PublicContentSection>

	<PublicContentSection label="09 // Governing Law" alternate>
		{#snippet title()}Jurisdiction and disputes.{/snippet}
		<p>
			These terms shall be governed by and construed in accordance with the laws of the United States. Any disputes
			arising under these terms shall be resolved in the appropriate federal or state courts.
		</p>
	</PublicContentSection>

	<PublicContentSection label="10 // Contact">
		{#snippet title()}Questions about these terms?{/snippet}
		<p>If you have questions about these terms, contact us at:</p>
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
			<a href="mailto:support@trooptotask.org">support@trooptotask.org</a>
		</div>
	</PublicContentSection>
</PublicShell>
