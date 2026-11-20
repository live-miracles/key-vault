// Applies a saved "light" theme before the first paint, so it never flashes dark. It is a file
// of its own, loaded by a plain <script> in the head, so the page needs no inline script and its
// Content-Security-Policy (vercel.json) can forbid them. Same key and values as src/theme.ts.
try {
    if (localStorage.getItem('key-vault-theme') === 'light') {
        document.documentElement.dataset.theme = 'light';
        document.querySelector('meta[name="theme-color"]').content = '#f4f5f7';
    }
} catch (e) {}
