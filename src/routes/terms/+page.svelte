<script lang="ts">
	import { resolve } from '$app/paths';
	import PublicContactCard from '$lib/components/public/PublicContactCard.svelte';
	import PublicHero from '$lib/components/public/PublicHero.svelte';
	import PublicRow from '$lib/components/public/PublicRow.svelte';
	import PublicSection from '$lib/components/public/PublicSection.svelte';
	import PublicShell from '$lib/components/public/PublicShell.svelte';

	let { data } = $props();
</script>

<svelte:head>
	<title>Terms of Use — Troop to Task</title>
	<meta name="description" content="Terms of Use for TroopToTask, a military personnel management platform." />
</svelte:head>

<PublicShell signedIn={data.signedIn}>
	<PublicHero label="Terms of Use · Effective Date: March 8, 2026" lines={['Terms of', 'use.']}>
		Please read these terms carefully before using TroopToTask. By accessing or using the service, you agree to be bound
		by these terms.
	</PublicHero>

	<PublicSection>
		<div class="border-t-2 border-foreground">
			<PublicRow num="01" label="Acceptance of Terms" title="By using TroopToTask, you agree.">
				<p>
					By creating an account or using TroopToTask, you agree to these terms. If you do not agree, do not use the
					service. We may update these terms; continued use constitutes acceptance of changes.
				</p>
			</PublicRow>
			<PublicRow num="02" label="Description of Service" title="What TroopToTask provides.">
				<p>
					TroopToTask is a web-based personnel management platform for military unit leaders. It provides calendar
					management, training tracking, daily assignments, counseling records, in-processing checklists, and related
					tools.
				</p>
			</PublicRow>
			<PublicRow num="03" label="User Accounts & Responsibilities" title="Your account, your responsibility.">
				<p>
					You are responsible for maintaining the confidentiality of your account credentials. You must not share your
					account or grant access to unauthorized individuals. You are responsible for all activity under your account.
				</p>
				<p>
					You must provide accurate information and keep it current. Organization owners are responsible for managing
					member access and permissions within their organizations.
				</p>
			</PublicRow>
			<PublicRow num="04" label="Acceptable Use" title="Use the service responsibly.">
				<p>You agree to use TroopToTask only for lawful purposes related to military unit management. You must not:</p>
				<ul>
					<li>Attempt to gain unauthorized access to other accounts or systems</li>
					<li>Upload malicious code or content</li>
					<li>Use the service to store classified information</li>
					<li>Interfere with or disrupt the service</li>
					<li>Reverse engineer, decompile, or disassemble any part of the service</li>
					<li>Use the service for commercial purposes unrelated to military unit management</li>
				</ul>
			</PublicRow>
			<PublicRow num="05" label="Data & Privacy" title="Your data belongs to you.">
				<p>
					Your use of TroopToTask is also governed by our <a href={resolve('/privacy')}>Privacy Policy</a>. You retain
					ownership of all data you enter into the platform. We do not sell or monetize your data. We share data with
					service providers only to deliver the service, as described in our Privacy Policy. See our Privacy Policy for
					full details on data handling.
				</p>
			</PublicRow>
			<PublicRow num="06" label="Intellectual Property" title="Service ownership and your content.">
				<p>
					The TroopToTask service, including its design, code, and documentation, is the property of TroopToTask and
					protected by applicable intellectual property laws. Your data remains yours.
				</p>
			</PublicRow>
			<PublicRow num="07" label="Limitation of Liability" title="Provided &quot;as is&quot; without warranty.">
				<p>
					TroopToTask is provided "as is" without warranties of any kind, express or implied. To the maximum extent
					permitted by law, TroopToTask shall not be liable for any indirect, incidental, special, consequential, or
					punitive damages, including but not limited to loss of data, loss of profits, or business interruption,
					arising from your use of or inability to use the service.
				</p>
				<p>
					TroopToTask is not an official Department of Defense system and should not be used as the sole system of
					record for any official military purpose.
				</p>
			</PublicRow>
			<PublicRow id="termination" num="08" label="Termination" title="Access may be revoked.">
				<p>
					We may suspend or terminate your access to the service at any time for violation of these terms or for any
					other reason at our discretion. You may request deletion of your account and personal data at any time by
					emailing
					<a href="mailto:privacy@trooptotask.org">privacy@trooptotask.org</a>. Our team will assist with the request,
					subject to applicable audit-record retention described in our
					<a href={resolve('/privacy')}>Privacy Policy</a>. Upon termination, your right to use the service ceases
					immediately.
				</p>
			</PublicRow>
			<PublicRow num="09" label="Governing Law" title="Jurisdiction and disputes.">
				<p>
					These terms shall be governed by and construed in accordance with the laws of the United States. Any disputes
					arising under these terms shall be resolved in the appropriate federal or state courts.
				</p>
			</PublicRow>
			<PublicRow num="10" label="Contact" title="Questions about these terms?">
				<p>If you have questions about these terms, contact us at:</p>
				<PublicContactCard email="support@trooptotask.org" />
			</PublicRow>
		</div>
	</PublicSection>
</PublicShell>
