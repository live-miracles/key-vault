// Sign-in for the real site, and the backend that talks to Supabase as the signed-in person.
// Only the real build includes this file (and supabase-js with it); the demo has no sign-in.

import { createClient } from '@supabase/supabase-js';
import { ApiError } from '../../supabase/functions/_shared/types.ts';
import { createHttpBackend } from './api-client.ts';
import type { Backend, BackendConfig } from './api-client.ts';

export interface SignIn {
    backend: Backend;
    signIn(): Promise<void>;
    signOut(): Promise<void>;
}

// hidden and grid both set display, so the panel needs both toggled.
function showLogin(visible: boolean) {
    const panel = document.getElementById('login-panel');
    panel?.classList.toggle('hidden', !visible);
    panel?.classList.toggle('grid', visible);
}

// Starts Supabase's session. `signedIn` is false when nobody is signed in yet: the sign-in panel
// is shown and the app has nothing to load.
export async function startAuth(config: BackendConfig): Promise<SignIn & { signedIn: boolean }> {
    const client = createClient(config.supabaseUrl, config.publishableKey, {
        auth: { flowType: 'pkce', detectSessionInUrl: true, persistSession: true },
    });

    const { data } = await client.auth.getSession();
    showLogin(!data.session);
    client.auth.onAuthStateChange((event) => {
        if (event === 'SIGNED_OUT') window.location.reload();
    });

    const getToken = async () => {
        // getSession renews an access token that is about to expire.
        const { data: current } = await client.auth.getSession();
        if (!current.session) {
            showLogin(true);
            throw new ApiError('denied', 'Please sign in.');
        }
        return current.session.access_token;
    };

    return {
        signedIn: Boolean(data.session),
        backend: createHttpBackend(config, getToken),
        async signIn() {
            const { error } = await client.auth.signInWithOAuth({
                provider: 'google',
                options: { redirectTo: window.location.origin + window.location.pathname },
            });
            if (error) {
                const message = document.getElementById('login-message');
                if (message) message.textContent = error.message;
            }
        },
        async signOut() {
            await client.auth.signOut();
            window.location.reload();
        },
    };
}
