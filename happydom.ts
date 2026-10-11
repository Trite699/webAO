import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register();

// Bun doesn't hoist jest.mock above static imports, so some tests end up
// loading the real client.ts, whose startup code calls alert() ("No connection
// string specified!"). Bun's native alert() blocks waiting for Enter on stdin,
// so make the dialogs no-ops under test,TLDR bun is ass.
globalThis.alert = () => {};
globalThis.confirm = () => true;
globalThis.prompt = () => null;
