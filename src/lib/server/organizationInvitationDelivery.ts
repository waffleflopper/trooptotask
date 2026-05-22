import { env } from '$env/dynamic/private';
import type { SupabaseClient } from '@supabase/supabase-js';
import { makePublicAppUrl } from './publicAppOrigin';

const RESEND_EMAILS_URL = 'https://api.resend.com/emails';

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
}

export type OrganizationInvitationEmailSender = (input: SendOrganizationInvitationEmailInput) => Promise<void>;

export type SendOrganizationInvitationOutboxDeliveryResult =
	| { status: 'sent'; outbox: OrganizationInvitationEmailOutboxRecord }
	| { status: 'failed'; outbox: OrganizationInvitationEmailOutboxRecord; error: string };

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
	return message.replace(/https?:\/\/[^\s"'<>]+\/auth\/login\?next=[^\s"'<>]+/gi, '[redacted invitation url]');
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

export function makeOrganizationInvitationUrl(origin: string): string {
	return makePublicAppUrl('/auth/login?next=%2Fdashboard', { inboundOrigin: origin });
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
	const text = [
		`${inviter} to join ${input.organizationName} on TroopToTask.`,
		'',
		`Sign in to view and accept the organization invitation: ${input.inviteUrl}`,
		'',
		'This email does not grant membership by itself. Membership is created only after you sign in and accept the invitation.'
	].join('\n');
	const html = `
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

	const apiKey = env.RESEND_API_KEY;
	const from = env.RESEND_FROM_EMAIL;
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
			inviteUrl: input.inviteUrl
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

export function createSupabaseOrganizationInvitationEmailOutboxStore(
	client: SupabaseClient
): OrganizationInvitationEmailOutboxStore {
	return {
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
				.from('organization_invitation_email_outbox')
				.update({
					status: 'sent',
					attempt_count: 1,
					last_error: null,
					updated_at: sentAt.toISOString(),
					sent_at: sentAt.toISOString()
				})
				.eq('id', id)
				.select('*')
				.single();

			if (error) throw error;
			return mapOutboxRow(data as OrganizationInvitationEmailOutboxRow);
		},

		async markInvitationEmailDeliveryFailed(id, failedAt, lastError) {
			const { data, error } = await client
				.from('organization_invitation_email_outbox')
				.update({
					status: 'failed',
					attempt_count: 1,
					last_error: lastError,
					updated_at: failedAt.toISOString(),
					sent_at: null
				})
				.eq('id', id)
				.select('*')
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
		}) {
			return sendOrganizationInvitationOutboxDelivery(store, sendEmail, {
				organizationId: input.organizationId,
				invitationId: input.invitationId,
				email: input.email,
				organizationName: input.organizationName,
				invitedByEmail: input.invitedByEmail,
				inviteUrl: makeOrganizationInvitationUrl(input.origin)
			});
		}
	};
}
