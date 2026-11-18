// Sign-in and transport for the real backend. Built as its own bundle (auth.js) and loaded
// before the app. Without window.KEY_VAULT_CONFIG (the demo site) it does nothing, and the
// app talks to its built-in mock instead.
import { createClient } from '@supabase/supabase-js';
import { callApi, type ApiAnswer, type BackendConfig } from './api-client.ts';

const config: BackendConfig | undefined = (window as any).KEY_VAULT_CONFIG;

if (config?.supabaseUrl && config.publishableKey) {
    const client = createClient(config.supabaseUrl, config.publishableKey, {
        auth: { flowType: 'pkce', detectSessionInUrl: true, persistSession: true },
    });

    // hidden and grid both set display, so the panel needs both toggled.
    const showLogin = (visible: boolean) => {
        const panel = document.getElementById('login-panel');
        panel?.classList.toggle('hidden', !visible);
        panel?.classList.toggle('grid', visible);
    };

    const signIn = async () => {
        const { error } = await client.auth.signInWithOAuth({
            provider: 'google',
            options: { redirectTo: window.location.origin + window.location.pathname },
        });
        if (error) {
            const message = document.getElementById('login-message');
            if (message) message.textContent = error.message;
        }
    };

    const signOut = async () => {
        await client.auth.signOut();
        window.location.reload();
    };

    (window as any).kvAuth = {
        // True when a user is signed in; otherwise the sign-in panel is shown.
        async start(): Promise<boolean> {
            const { data } = await client.auth.getSession();
            showLogin(!data.session);
            document.getElementById('sign-in-btn')?.addEventListener('click', () => void signIn());
            document
                .querySelectorAll('[data-action="sign-out"]')
                .forEach((button) => button.addEventListener('click', () => void signOut()));
            client.auth.onAuthStateChange((event) => {
                if (event === 'SIGNED_OUT') window.location.reload();
            });
            return Boolean(data.session);
        },
        async call(operation: string, args: unknown[]): Promise<ApiAnswer> {
            // getSession renews an access token that is about to expire.
            const { data } = await client.auth.getSession();
            if (!data.session) {
                showLogin(true);
                throw new Error('Please sign in.');
            }
            return callApi(fetch, config, data.session.access_token, operation, args);
        },
    };
}
