// Which event and input are open, kept in the address (?event=...&input=...) so a link opens
// the same view. Changing it tells the listener, which draws the page again.

type Params = Record<string, string | null>;

let listener: () => void = () => {};

// `render` is called after every change of the address made through `go`.
export function onRouteChange(render: () => void) {
    listener = render;
}

export function param(name: string): string | null {
    return new URL(window.location.href).searchParams.get(name);
}

function write(params: Params, push: boolean) {
    const url = new URL(window.location.href);
    for (const [name, value] of Object.entries(params)) {
        if (value === null) url.searchParams.delete(name);
        else url.searchParams.set(name, value);
    }
    if (push) window.history.pushState({}, '', url);
    else window.history.replaceState({}, '', url);
}

export const route = {
    event: () => param('event'),
    input: () => param('input'),
    // Opens another view and draws it. Each call is one step of the browser's history.
    go(params: Params) {
        write(params, true);
        listener();
    },
    // Draws the page again without changing the address.
    refresh() {
        listener();
    },
    // Corrects the address without drawing or adding a step (the event in it is gone).
    fix(params: Params) {
        write(params, false);
    },
};
