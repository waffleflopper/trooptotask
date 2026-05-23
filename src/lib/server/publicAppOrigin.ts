import { env } from '$env/dynamic/private';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

export interface PublicAppOriginInput {
	inboundOrigin: string;
}

function normalizeOrigin(origin: string | null | undefined): string | null {
	const trimmed = origin?.trim();
	if (!trimmed) return null;

	const url = new URL(trimmed);
	if (url.protocol !== 'https:' && !(url.protocol === 'http:' && LOCAL_HOSTS.has(url.hostname))) {
		throw new Error('Public app origin must use HTTPS outside local development');
	}

	return url.origin;
}

function configuredOfficialOrigin(): string | null {
	return (
		normalizeOrigin(env.APP_PUBLIC_ORIGIN) ??
		normalizeOrigin(process.env.APP_PUBLIC_ORIGIN) ??
		normalizeOrigin(env.PUBLIC_APP_ORIGIN) ??
		normalizeOrigin(process.env.PUBLIC_APP_ORIGIN) ??
		normalizeOrigin(env.PUBLIC_SITE_URL) ??
		normalizeOrigin(process.env.PUBLIC_SITE_URL)
	);
}

function configuredAllowedOrigins(): Set<string> {
	return new Set(
		([env.APP_PUBLIC_ORIGIN_ALLOWLIST, process.env.APP_PUBLIC_ORIGIN_ALLOWLIST].find((value) => value?.trim()) ?? '')
			.split(',')
			.map((origin) => normalizeOrigin(origin))
			.filter((origin): origin is string => !!origin)
	);
}

function isLocalOrigin(origin: string): boolean {
	return LOCAL_HOSTS.has(new URL(origin).hostname);
}

export function resolvePublicAppOrigin(input: PublicAppOriginInput): string {
	const inboundOrigin = normalizeOrigin(input.inboundOrigin);
	if (!inboundOrigin) {
		throw new Error('Inbound origin is required to resolve public app origin');
	}

	const officialOrigin = configuredOfficialOrigin();
	if (officialOrigin) {
		return officialOrigin;
	}

	if (configuredAllowedOrigins().has(inboundOrigin)) {
		return inboundOrigin;
	}

	if (isLocalOrigin(inboundOrigin)) {
		return inboundOrigin;
	}

	throw new Error('Official public app origin is not configured for this host');
}

export function makePublicAppUrl(path: string, input: PublicAppOriginInput): string {
	return new URL(path, resolvePublicAppOrigin(input)).toString();
}
