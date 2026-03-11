/**
 * Get the Supabase browser client from page data.
 *
 * The client is created in +layout.ts (standard Supabase SSR pattern)
 * and available on every page via $page.data.supabase.
 *
 * For components that can't easily access page data, use:
 *   import { page } from '$app/stores';
 *   const supabase = $page.data.supabase;
 */
export {};
