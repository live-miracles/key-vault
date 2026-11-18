// Registers the service worker (frontend/sw.js) so Chrome and other browsers can install the site
// as an app. The build turns it off for `npm run dev`, where a cached page would hide edits.

declare const __KEY_VAULT_SERVICE_WORKER__: boolean;

export function registerServiceWorker(): void {
    if (!__KEY_VAULT_SERVICE_WORKER__ || !('serviceWorker' in navigator)) return;
    const register = () =>
        navigator.serviceWorker
            .register('./sw.js')
            .catch((error) => console.warn('The app could not be made installable:', error));
    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });
}
