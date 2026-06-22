import { env } from '$env/dynamic/private';
import type { SupabaseClient } from '@supabase/supabase-js';
import { isBillingEnabled } from '$lib/config/billing';
import { makePublicAppUrl } from './publicAppOrigin';

const RESEND_EMAILS_URL = 'https://api.resend.com/emails';
export const ORGANIZATION_INVITATION_EMAIL_MAX_ATTEMPTS = 3;

export type OrganizationInvitationDeliveryStatus = 'pending' | 'sent' | 'failed';

export interface OrganizationInvitationEmailOutboxRecord {
	id: string;
	organizationId: string;
	invitationId: string;
	recipient: string;
	status: OrganizationInvitationDeliveryStatus;
	attemptCount: number;
	lastError: string | null;
	createdAt: Date;
	updatedAt: Date;
	sentAt: Date | null;
}

export interface OrganizationInvitationEmailOutboxStore {
	getInvitationEmailDelivery(id: string): Promise<OrganizationInvitationEmailOutboxRecord | null>;
	insertInvitationEmailDelivery(input: {
		organizationId: string;
		invitationId: string;
		recipient: string;
		createdAt: Date;
	}): Promise<OrganizationInvitationEmailOutboxRecord>;
	markInvitationEmailDeliverySent(id: string, sentAt: Date): Promise<OrganizationInvitationEmailOutboxRecord>;
	markInvitationEmailDeliveryFailed(
		id: string,
		failedAt: Date,
		lastError: string
	): Promise<OrganizationInvitationEmailOutboxRecord>;
}

export interface SendOrganizationInvitationEmailInput {
	email: string;
	organizationName: string;
	invitedByEmail: string | null;
	inviteUrl: string;
	requiresAccountSetup: boolean;
	selfServiceSignupEnabled?: boolean;
}

export type OrganizationInvitationEmailSender = (input: SendOrganizationInvitationEmailInput) => Promise<void>;

export type SendOrganizationInvitationOutboxDeliveryResult =
	| { status: 'sent'; outbox: OrganizationInvitationEmailOutboxRecord }
	| { status: 'failed'; outbox: OrganizationInvitationEmailOutboxRecord; error: string };

export interface OrganizationInvitationRetryRecord {
	id: string;
	organizationId: string;
	email: string;
	status: 'pending' | 'accepted' | 'declined' | 'expired' | 'revoked' | 'blocked';
	requiresAccountSetup: boolean;
	expiresAt: Date;
}

interface OrganizationInvitationEmailOutboxRow {
	id: string;
	organization_id: string;
	invitation_id: string;
	recipient: string;
	status: OrganizationInvitationDeliveryStatus;
	attempt_count: number;
	last_error: string | null;
	created_at: string;
	updated_at: string;
	sent_at: string | null;
}

interface ResendEmailResponse {
	ok: boolean;
	status: number;
	text(): Promise<string>;
}

type ResendFetch = (input: string, init: RequestInit) => Promise<ResendEmailResponse>;

function normalizeEmail(email: string): string {
	return email.trim().toLowerCase();
}

function escapeHtmlAttribute(value: string): string {
	return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function assertSafeInvitationUrl(inviteUrl: string): void {
	const url = new URL(inviteUrl);
	const isLocalHttp =
		url.protocol === 'http:' &&
		(url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '::1');

	if (url.protocol !== 'https:' && !isLocalHttp) {
		throw new Error('Organization invitation email URL must use HTTPS outside local development');
	}
}

function redactInviteUrls(message: string): string {
	return message.replace(
		/https?:\/\/[^\s"'<>]+\/auth\/(?:login\?next=[^\s"'<>]+|request-access[^\s"'<>]*|sign-up\?next=[^\s"'<>]+)/gi,
		'[redacted invitation url]'
	);
}

function errorMessage(error: unknown): string {
	if (error instanceof Error && error.message) return redactInviteUrls(error.message);
	if (typeof error === 'object' && error && 'message' in error && typeof error.message === 'string') {
		return redactInviteUrls(error.message);
	}
	return 'Unknown organization invitation email delivery error';
}

function mapOutboxRow(row: OrganizationInvitationEmailOutboxRow): OrganizationInvitationEmailOutboxRecord {
	return {
		id: row.id,
		organizationId: row.organization_id,
		invitationId: row.invitation_id,
		recipient: row.recipient,
		status: row.status,
		attemptCount: row.attempt_count,
		lastError: row.last_error,
		createdAt: new Date(row.created_at),
		updatedAt: new Date(row.updated_at),
		sentAt: row.sent_at ? new Date(row.sent_at) : null
	};
}

export function makeOrganizationInvitationUrl(
	origin: string,
	options: { requiresAccountSetup?: boolean; selfServiceSignupEnabled?: boolean } = {}
): string {
	const path = !options.requiresAccountSetup
		? '/auth/login?next=%2Fdashboard'
		: options.selfServiceSignupEnabled
			? '/auth/sign-up?next=%2Fdashboard'
			: '/auth/request-access';

	return makePublicAppUrl(path, {
		inboundOrigin: origin
	});
}

function buildOrganizationInvitationEmail(input: SendOrganizationInvitationEmailInput): {
	subject: string;
	text: string;
	html: string;
} {
	assertSafeInvitationUrl(input.inviteUrl);
	const inviter = input.invitedByEmail ? `${input.invitedByEmail} invited you` : 'You have been invited';
	const subject = `Invitation to join ${input.organizationName} on TroopToTask`;
	const inviteUrlAttribute = escapeHtmlAttribute(input.inviteUrl);
	const text =
		input.requiresAccountSetup && input.selfServiceSignupEnabled
			? [
					`${inviter} to join ${input.organizationName} on TroopToTask.`,
					'',
					'Because you do not have a TroopToTask account yet, create your User Account and confirm your email first.',
					'',
					`Create your account here: ${input.inviteUrl}`,
					'',
					'After email confirmation, open your dashboard to accept this organization invitation.'
				].join('\n')
			: input.requiresAccountSetup
				? [
						`${inviter} to join ${input.organizationName} on TroopToTask.`,
						'',
						'Because you do not have a TroopToTask account yet, we submitted a platform access request for this email on your behalf.',
						'You do not need to submit another access request.',
						'',
						`You can review the request here: ${input.inviteUrl}`,
						'',
						'After platform approval, use the separate Account Setup Link email to create your account. Then sign in to accept this organization invitation from your dashboard.'
					].join('\n')
				: [
						`${inviter} to join ${input.organizationName} on TroopToTask.`,
						'',
						`Sign in to view and accept the organization invitation: ${input.inviteUrl}`,
						'',
						'This email does not grant membership by itself. Membership is created only after you sign in and accept the invitation.'
					].join('\n');
	const html =
		input.requiresAccountSetup && input.selfServiceSignupEnabled
			? `
		<p>${escapeHtmlAttribute(inviter)} to join ${escapeHtmlAttribute(input.organizationName)} on TroopToTask.</p>
		<p><a href="${inviteUrlAttribute}">Create your TroopToTask account</a></p>
		<p>Because you do not have a TroopToTask account yet, create your User Account and confirm your email first.</p>
		<p>After email confirmation, open your dashboard to accept this organization invitation.</p>
	`
			: input.requiresAccountSetup
				? `
		<p>${escapeHtmlAttribute(inviter)} to join ${escapeHtmlAttribute(input.organizationName)} on TroopToTask.</p>
		<p><a href="${inviteUrlAttribute}">Review your platform access setup</a></p>
		<p>Because you do not have a TroopToTask account yet, we submitted a platform access request for this email on your behalf.</p>
		<p>You do not need to submit another access request.</p>
		<p>After platform approval, use the separate Account Setup Link email to create your account. Then sign in to accept this organization invitation from your dashboard.</p>
	`
				: `
		<p>${escapeHtmlAttribute(inviter)} to join ${escapeHtmlAttribute(input.organizationName)} on TroopToTask.</p>
		<p><a href="${inviteUrlAttribute}">Sign in to view and accept the invitation</a></p>
		<p>This email does not grant membership by itself. Membership is created only after you sign in and accept the invitation.</p>
	`;

	return { subject, text, html };
}

async function sendOrganizationInvitationEmailToMailpit(input: SendOrganizationInvitationEmailInput): Promise<void> {
	const email = buildOrganizationInvitationEmail(input);
	const mailpitUrl = env.MAILPIT_URL ?? process.env.MAILPIT_URL ?? 'http://127.0.0.1:54324';
	const from = env.RESEND_FROM_EMAIL ?? process.env.RESEND_FROM_EMAIL ?? 'noreply@example.test';
	const response = await fetch(`${mailpitUrl}/api/v1/send`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			From: { Email: from },
			To: [{ Email: input.email }],
			Subject: email.subject,
			Text: email.text,
			HTML: email.html
		})
	});

	if (!response.ok) {
		const body = await response.text().catch(() => '');
		throw new Error(
			`Local Organization Invitation email delivery failed with status ${response.status}${body ? `: ${body}` : ''}`
		);
	}
}

export async function sendOrganizationInvitationEmail(
	input: SendOrganizationInvitationEmailInput,
	fetchImpl: ResendFetch = fetch
): Promise<void> {
	if ((env.E2E_TESTING ?? process.env.E2E_TESTING) === 'true') {
		await sendOrganizationInvitationEmailToMailpit(input);
		return;
	}

	const apiKey = env.RESEND_API_KEY ?? process.env.RESEND_API_KEY;
	const from = env.RESEND_FROM_EMAIL ?? process.env.RESEND_FROM_EMAIL;
	if (!apiKey || !from) {
		throw new Error('Organization invitation email delivery is not configured');
	}

	const email = buildOrganizationInvitationEmail(input);
	const response = await fetchImpl(RESEND_EMAILS_URL, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${apiKey}`,
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({
			from,
			to: [input.email],
			subject: email.subject,
			text: email.text,
			html: email.html
		})
	});

	if (!response.ok) {
		const body = await response.text().catch(() => '');
		throw new Error(
			`Organization invitation email delivery failed with status ${response.status}${body ? `: ${body}` : ''}`
		);
	}
}

export async function sendOrganizationInvitationOutboxDelivery(
	store: OrganizationInvitationEmailOutboxStore,
	sendEmail: OrganizationInvitationEmailSender,
	input: {
		organizationId: string;
		invitationId: string;
		email: string;
		organizationName: string;
		invitedByEmail: string | null;
		inviteUrl: string;
		requiresAccountSetup: boolean;
		selfServiceSignupEnabled?: boolean;
		now?: Date;
	}
): Promise<SendOrganizationInvitationOutboxDeliveryResult> {
	const createdAt = input.now ?? new Date();
	const outbox = await store.insertInvitationEmailDelivery({
		organizationId: input.organizationId,
		invitationId: input.invitationId,
		recipient: normalizeEmail(input.email),
		createdAt
	});

	try {
		await sendEmail({
			email: normalizeEmail(input.email),
			organizationName: input.organizationName,
			invitedByEmail: input.invitedByEmail,
			inviteUrl: input.inviteUrl,
			requiresAccountSetup: input.requiresAccountSetup,
			...(input.selfServiceSignupEnabled === undefined
				? {}
				: { selfServiceSignupEnabled: input.selfServiceSignupEnabled })
		});
		return {
			status: 'sent',
			outbox: await store.markInvitationEmailDeliverySent(outbox.id, input.now ?? new Date())
		};
	} catch (error) {
		const message = errorMessage(error);
		return {
			status: 'failed',
			error: message,
			outbox: await store.markInvitationEmailDeliveryFailed(outbox.id, input.now ?? new Date(), message)
		};
	}
}

export type RetryOrganizationInvitationOutboxDeliveryResult =
	| { status: 'sent'; outbox: OrganizationInvitationEmailOutboxRecord }
	| { status: 'failed'; outbox: OrganizationInvitationEmailOutboxRecord; error: string }
	| { status: 'missing' | 'not-retryable' | 'expired' | 'max-attempts' };

export async function retryOrganizationInvitationOutboxDelivery(
	store: OrganizationInvitationEmailOutboxStore,
	sendEmail: OrganizationInvitationEmailSender,
	input: {
		outboxId: string;
		origin: string;
		invitation: OrganizationInvitationRetryRecord;
		organizationName: string;
		invitedByEmail: string | null;
		now?: Date;
	}
): Promise<RetryOrganizationInvitationOutboxDeliveryResult> {
	const outbox = await store.getInvitationEmailDelivery(input.outboxId);
	if (
		!outbox ||
		outbox.invitationId !== input.invitation.id ||
		outbox.organizationId !== input.invitation.organizationId
	) {
		return { status: 'missing' };
	}

	if (outbox.status !== 'pending' && outbox.status !== 'failed') {
		return { status: 'not-retryable' };
	}

	if (outbox.attemptCount >= ORGANIZATION_INVITATION_EMAIL_MAX_ATTEMPTS) {
		return { status: 'max-attempts' };
	}

	if (input.invitation.status !== 'pending') {
		return { status: 'not-retryable' };
	}

	const now = input.now ?? new Date();
	if (input.invitation.expiresAt <= now) {
		return { status: 'expired' };
	}

	try {
		await sendEmail({
			email: normalizeEmail(input.invitation.email),
			organizationName: input.organizationName,
			invitedByEmail: input.invitedByEmail,
			inviteUrl: makeOrganizationInvitationUrl(input.origin, {
				requiresAccountSetup: input.invitation.requiresAccountSetup,
				selfServiceSignupEnabled: isBillingEnabled
			}),
			requiresAccountSetup: input.invitation.requiresAccountSetup,
			...(input.invitation.requiresAccountSetup ? { selfServiceSignupEnabled: isBillingEnabled } : {})
		});
		return {
			status: 'sent',
			outbox: await store.markInvitationEmailDeliverySent(outbox.id, now)
		};
	} catch (error) {
		const message = errorMessage(error);
		return {
			status: 'failed',
			error: message,
			outbox: await store.markInvitationEmailDeliveryFailed(outbox.id, now, message)
		};
	}
}

export function createSupabaseOrganizationInvitationEmailOutboxStore(
	client: SupabaseClient
): OrganizationInvitationEmailOutboxStore {
	return {
		async getInvitationEmailDelivery(id) {
			const { data, error } = await client
				.from('organization_invitation_email_outbox')
				.select('*')
				.eq('id', id)
				.maybeSingle();

			if (error) throw error;
			return data ? mapOutboxRow(data as OrganizationInvitationEmailOutboxRow) : null;
		},

		async insertInvitationEmailDelivery(input) {
			const { data, error } = await client
				.from('organization_invitation_email_outbox')
				.insert({
					organization_id: input.organizationId,
					invitation_id: input.invitationId,
					recipient: normalizeEmail(input.recipient),
					purpose: 'organization_invitation',
					status: 'pending',
					attempt_count: 0,
					created_at: input.createdAt.toISOString(),
					updated_at: input.createdAt.toISOString()
				})
				.select('*')
				.single();

			if (error) throw error;
			return mapOutboxRow(data as OrganizationInvitationEmailOutboxRow);
		},

		async markInvitationEmailDeliverySent(id, sentAt) {
			const { data, error } = await client
				.rpc('mark_organization_invitation_email_outbox_delivery', {
					p_outbox_id: id,
					p_status: 'sent',
					p_marked_at: sentAt.toISOString(),
					p_last_error: null
				})
				.single();

			if (error) throw error;
			return mapOutboxRow(data as OrganizationInvitationEmailOutboxRow);
		},

		async markInvitationEmailDeliveryFailed(id, failedAt, lastError) {
			const { data, error } = await client
				.rpc('mark_organization_invitation_email_outbox_delivery', {
					p_outbox_id: id,
					p_status: 'failed',
					p_marked_at: failedAt.toISOString(),
					p_last_error: lastError
				})
				.single();

			if (error) throw error;
			return mapOutboxRow(data as OrganizationInvitationEmailOutboxRow);
		}
	};
}

export function createSupabaseOrganizationInvitationDeliveryPort(
	client: SupabaseClient,
	options: { sendEmail?: OrganizationInvitationEmailSender } = {}
) {
	const store = createSupabaseOrganizationInvitationEmailOutboxStore(client);
	const sendEmail = options.sendEmail ?? sendOrganizationInvitationEmail;

	return {
		async sendInvitationEmail(input: {
			organizationId: string;
			invitationId: string;
			email: string;
			organizationName: string;
			invitedByEmail: string | null;
			origin: string;
			requiresAccountSetup: boolean;
		}) {
			return sendOrganizationInvitationOutboxDelivery(store, sendEmail, {
				organizationId: input.organizationId,
				invitationId: input.invitationId,
				email: input.email,
				organizationName: input.organizationName,
				invitedByEmail: input.invitedByEmail,
				inviteUrl: makeOrganizationInvitationUrl(input.origin, {
					requiresAccountSetup: input.requiresAccountSetup,
					selfServiceSignupEnabled: isBillingEnabled
				}),
				requiresAccountSetup: input.requiresAccountSetup,
				selfServiceSignupEnabled: isBillingEnabled
			});
		}
	};
}
