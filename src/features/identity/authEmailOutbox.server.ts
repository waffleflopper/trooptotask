import type { SupabaseClient } from '@supabase/supabase-js';

export type AuthEmailPurpose = 'account_setup';
export type AuthEmailOutboxStatus = 'pending' | 'sent' | 'failed';

export interface AuthEmailOutboxRecord {
	id: string;
	accessRequestId: string;
	setupLinkId: string;
	recipient: string;
	purpose: AuthEmailPurpose;
	status: AuthEmailOutboxStatus;
	attemptCount: number;
	lastError: string | null;
	createdAt: Date;
	updatedAt: Date;
	sentAt: Date | null;
}

export interface CreateSetupEmailOutboxInput {
	accessRequestId: string;
	setupLinkId: string;
	recipient: string;
	createdAt: Date;
}

export interface AuthEmailOutboxStore {
	insertSetupEmailDelivery(input: CreateSetupEmailOutboxInput): Promise<AuthEmailOutboxRecord>;
	markSetupEmailDeliverySent(id: string, sentAt: Date): Promise<AuthEmailOutboxRecord>;
	markSetupEmailDeliveryFailed(id: string, failedAt: Date, lastError: string): Promise<AuthEmailOutboxRecord>;
}

interface SendSetupEmailInput {
	email: string;
	setupUrl: string;
	expiresAt: Date;
}

type SetupEmailSender = (input: SendSetupEmailInput) => Promise<void>;

interface AuthEmailOutboxRow {
	id: string;
	access_request_id: string;
	setup_link_id: string;
	recipient: string;
	purpose: AuthEmailPurpose;
	status: AuthEmailOutboxStatus;
	attempt_count: number;
	last_error: string | null;
	created_at: string;
	updated_at: string;
	sent_at: string | null;
}

function normalizeEmail(email: string): string {
	return email.trim().toLowerCase();
}

function redactSetupSecrets(message: string): string {
	return message
		.replace(/https?:\/\/[^\s"'<>]+\/auth\/setup-account\?token=[^\s"'<>]+/gi, '[redacted setup url]')
		.replace(/\btoken=[^&\s"'<>]+/gi, 'token=[redacted]')
		.replace(/\b[A-Fa-f0-9]{64}\b/g, '[redacted hash]');
}

function errorMessage(error: unknown): string {
	if (error instanceof Error && error.message) return redactSetupSecrets(error.message);
	if (typeof error === 'object' && error && 'message' in error && typeof error.message === 'string') {
		return redactSetupSecrets(error.message);
	}
	return 'Unknown setup email delivery error';
}

function mapOutboxRow(row: AuthEmailOutboxRow): AuthEmailOutboxRecord {
	return {
		id: row.id,
		accessRequestId: row.access_request_id,
		setupLinkId: row.setup_link_id,
		recipient: row.recipient,
		purpose: row.purpose,
		status: row.status,
		attemptCount: row.attempt_count,
		lastError: row.last_error,
		createdAt: new Date(row.created_at),
		updatedAt: new Date(row.updated_at),
		sentAt: row.sent_at ? new Date(row.sent_at) : null
	};
}

export type SendAccountSetupOutboxDeliveryResult =
	| { status: 'sent'; outbox: AuthEmailOutboxRecord }
	| { status: 'failed'; outbox: AuthEmailOutboxRecord; error: string };

export async function sendAccountSetupOutboxDelivery(
	store: AuthEmailOutboxStore,
	sendSetupEmail: SetupEmailSender,
	input: {
		accessRequestId: string;
		setupLinkId: string;
		email: string;
		setupUrl: string;
		expiresAt: Date;
		now?: Date;
	}
): Promise<SendAccountSetupOutboxDeliveryResult> {
	const createdAt = input.now ?? new Date();
	const outbox = await store.insertSetupEmailDelivery({
		accessRequestId: input.accessRequestId,
		setupLinkId: input.setupLinkId,
		recipient: normalizeEmail(input.email),
		createdAt
	});

	try {
		await sendSetupEmail({
			email: normalizeEmail(input.email),
			setupUrl: input.setupUrl,
			expiresAt: input.expiresAt
		});
		return {
			status: 'sent',
			outbox: await store.markSetupEmailDeliverySent(outbox.id, input.now ?? new Date())
		};
	} catch (error) {
		const message = errorMessage(error);
		return {
			status: 'failed',
			error: message,
			outbox: await store.markSetupEmailDeliveryFailed(outbox.id, input.now ?? new Date(), message)
		};
	}
}

export function createSupabaseAuthEmailOutboxStore(client: SupabaseClient): AuthEmailOutboxStore {
	return {
		async insertSetupEmailDelivery(input) {
			const { data, error } = await client
				.from('auth_email_outbox')
				.insert({
					access_request_id: input.accessRequestId,
					setup_link_id: input.setupLinkId,
					recipient: normalizeEmail(input.recipient),
					purpose: 'account_setup',
					status: 'pending',
					attempt_count: 0,
					created_at: input.createdAt.toISOString(),
					updated_at: input.createdAt.toISOString()
				})
				.select('*')
				.single();

			if (error) throw error;
			return mapOutboxRow(data as AuthEmailOutboxRow);
		},

		async markSetupEmailDeliverySent(id, sentAt) {
			const { data, error } = await client
				.from('auth_email_outbox')
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
			return mapOutboxRow(data as AuthEmailOutboxRow);
		},

		async markSetupEmailDeliveryFailed(id, failedAt, lastError) {
			const { data, error } = await client
				.from('auth_email_outbox')
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
			return mapOutboxRow(data as AuthEmailOutboxRow);
		}
	};
}
