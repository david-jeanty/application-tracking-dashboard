// `server-only` throws when imported outside a server bundle, which is exactly
// its job in the application. Unit tests import the repository directly to
// assert the queries it builds, so the marker is aliased to this empty module
// in `vitest.config.ts`.
export {};
