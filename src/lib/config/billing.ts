import { PUBLIC_BILLING_ENABLED } from '$env/static/public';

/**
 * Check if billing features are enabled.
 * When disabled, all users are treated as having unlimited free tier access.
 */
export const isBillingEnabled = PUBLIC_BILLING_ENABLED === 'true';
