const MAILPIT_URL = process.env.MAILPIT_URL || 'http://127.0.0.1:56324';

interface MailpitAddress {
	Address: string;
}

interface MailpitMessageSummary {
	ID: string;
	Subject: string;
	To: MailpitAddress[];
}

interface MailpitListResponse {
	messages: MailpitMessageSummary[];
}

interface MailpitMessage {
	ID: string;
	Subject: string;
	Text?: string;
	HTML?: string;
	To: MailpitAddress[];
}

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
	const response = await fetch(`${MAILPIT_URL}${path}`, init);
	if (!response.ok) {
		throw new Error(`Mailpit request failed: ${response.status} ${response.statusText}`);
	}

	return (await response.json()) as T;
}

export async function clearMailbox(): Promise<void> {
	const response = await fetch(`${MAILPIT_URL}/api/v1/messages`, { method: 'DELETE' });
	if (!response.ok) {
		throw new Error(`Mailpit clear failed: ${response.status} ${response.statusText}`);
	}
}

export async function waitForMessage(
	to: string,
	subjectIncludes: string | string[],
	timeoutMs: number = 30000
): Promise<MailpitMessage> {
	const deadline = Date.now() + timeoutMs;
	const normalizedTo = to.toLowerCase();
	const normalizedSubjects = (Array.isArray(subjectIncludes) ? subjectIncludes : [subjectIncludes]).map((subject) =>
		subject.toLowerCase()
	);

	while (Date.now() < deadline) {
		const list = await fetchJson<MailpitListResponse>('/api/v1/messages');
		const match = list.messages.find(
			(message) =>
				normalizedSubjects.some((subject) => message.Subject.toLowerCase().includes(subject)) &&
				message.To.some((recipient) => recipient.Address.toLowerCase() === normalizedTo)
		);

		if (match) {
			return fetchJson<MailpitMessage>(`/api/v1/message/${match.ID}`);
		}

		await new Promise((resolve) => setTimeout(resolve, 250));
	}

	throw new Error(`Timed out waiting for "${normalizedSubjects.join(', ')}" email for ${to}`);
}

export function extractFirstLink(message: MailpitMessage): string {
	const body = `${message.Text ?? ''}\n${message.HTML ?? ''}`;
	const links = Array.from(body.matchAll(/https?:\/\/[^\s"')]+/g), (match) => match[0].replace(/&amp;/g, '&'));
	const authVerifyLink = links.find((link) => link.includes('/auth/v1/verify?'));
	const match = authVerifyLink ?? links[0];
	if (!match) {
		throw new Error(`No link found in Mailpit message "${message.Subject}"`);
	}

	return match;
}
