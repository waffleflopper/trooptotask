import { expect, type Page } from '@playwright/test';
import { appBaseUrl } from './app';

const authConfirmDestinations = {
	invite: '/auth/accept-invite',
	recovery: '/auth/reset-password'
} as const;

export type AuthConfirmType = keyof typeof authConfirmDestinations;

export function buildAuthConfirmRedirectTo(type: AuthConfirmType): string {
	const confirmUrl = new URL('/auth/confirm', appBaseUrl);
	confirmUrl.searchParams.set('type', type);
	confirmUrl.searchParams.set('next', authConfirmDestinations[type]);
	return confirmUrl.toString();
}

export function expectAuthConfirmLink(link: string, type: AuthConfirmType): void {
	const parsed = new URL(link);

	expect(`${parsed.origin}${parsed.pathname}`).toBe(`${appBaseUrl}/auth/confirm`);
	expect(parsed.searchParams.get('type')).toBe(type);
	expect(parsed.searchParams.get('next')).toBe(authConfirmDestinations[type]);
	expect(parsed.searchParams.get('token_hash')).toBeTruthy();
	expect(link).not.toContain('/auth/v1/verify');
}

export async function continueFromAuthConfirm(page: Page, link: string, type: AuthConfirmType): Promise<void> {
	await page.goto(link);
	await expect(page).toHaveURL(/\/auth\/confirm/);
	await page
		.getByRole('button', {
			name: type === 'invite' ? 'Continue to Invite Setup' : 'Continue to Password Reset'
		})
		.click();
	await expect(page).toHaveURL(new RegExp(type === 'invite' ? '/auth/accept-invite' : '/auth/reset-password'));
}
