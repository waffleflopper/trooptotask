import type { SupabaseClient } from '@supabase/supabase-js';

export interface SignupAuthProvider {
	signUp(input: { email: string; password: string; options: { emailRedirectTo: string } }): Promise<{ error: unknown }>;
}

export function createSupabaseSignupAuthProvider(locals: { supabase: SupabaseClient }): SignupAuthProvider {
	return {
		async signUp(input) {
			const { error } = await locals.supabase.auth.signUp({
				email: input.email,
				password: input.password,
				options: {
					emailRedirectTo: input.options.emailRedirectTo
				}
			});

			return { error };
		}
	};
}
