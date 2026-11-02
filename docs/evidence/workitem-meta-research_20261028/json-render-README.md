# Dynamic UI source probes — 2026-10-28

These are isolated source-level probes, not an application integration, browser verification, real-model generation, a published-package installation, or an upstream test-suite run. No project files, data or services were changed.

## Fixed sources

- json-render: https://github.com/vercel-labs/json-render/tree/c6f73d7d5f69acb80fc89faefd12c0865c8603d1 (package manifests: core/react 0.21.3). Source downloaded from official codeload archive to `/tmp/flowcraft-json-render-research-20261028`.
- A2UI: https://github.com/a2ui-project/a2ui/tree/ccf5dc20d0b0ed041b03e3913d807420ff45e178 (source manifests: react/web_core 0.14.0). Targeted source/spec/test files downloaded from raw.githubusercontent.com to `/tmp/flowcraft-a2ui-targeted-20261028`; API tree and SHA retained there. A whole-repository codeload download was slow; no A2UI runtime experiment is claimed.
- JSON Forms: https://github.com/eclipsesource/jsonforms/tree/2c5fae62a8aace19970ac037d122fa6428cd0436. Targeted source/tests in `/tmp/flowcraft-jsonforms-targeted-20261028`. No runtime experiment.

Git clone initially failed because the machine rewrites GitHub to a mirror with a TLS handshake failure. The official API and codeload/raw endpoints were used instead.

## Environment and execution

- Node v25.4.0 (not project Node 22 acceptance).
- Existing workspace dependencies, read via symlinks: tsx 4.23.13, Zod 4.6.5, React 19.3.0, Ajv from project installation. Source json-render core declares Zod ^4.3.6; this is not an exact lockfile reproduction.
- No package installation or source changes. Temporary aliases under downloaded source's node_modules map `@json-render/core` to its source index/store-utils, and `@internal/react-state` to packages/react-state/src/index.tsx.
- Probe imports use the sibling fixed source directory. To relocate, adjust those paths or recreate the sibling source directory.

Commands run:

```
node /home/mike/projs/fork/dynamic-flow/node_modules/tsx/dist/cli.mjs /tmp/flowcraft-dynamic-ui-probe-20261028/probe.ts > /tmp/flowcraft-dynamic-ui-probe-20261028/output.json
node /home/mike/projs/fork/dynamic-flow/node_modules/tsx/dist/cli.mjs /tmp/flowcraft-dynamic-ui-probe-20261028/renderer-ajv.ts > /tmp/flowcraft-dynamic-ui-probe-20261028/renderer-ajv-output.json
```

Both final commands exited 0. Earlier environment setup failures were missing temporary source aliases, resolved before recording these results.

## Results

`probe.ts` imports actual unmodified upstream core/react implementations:

1. With two catalog components, catalog.validate accepts Text.content=123 and an unexpected prop. validateSpec also passes because it is structural. With only Text in the catalog the same invalid props are rejected.
2. catalog.validate(full).data strips top-level state and element on/watch. SSR of original is `<span>real</span>`; SSR of validated data is `<span>MISSING</span>` (initial state taken from the returned spec). Using the returned validation data would lose initial values and event wiring.
3. defineRegistry.executeAction sends malformed recordId=42 plus extra param to the handler; action schema is not automatically enforced.
4. Direct Renderer renders invalid props as `<span>123</span>`; no automatic catalog prop validation.
5. SpecStream buffers split lines but ignores malformed complete lines and drops a truncated final patch without error. Finishing the stream alone is not proof of a complete/valid spec.

`renderer-ajv.ts` uses plain ComponentRegistry + JSONUIProvider + Renderer, with one canonical JSON Schema compiled by Ajv in the component adapter. No defineCatalog, defineRegistry, or Zod props schema is used. A `$state` binding renders a real supplied value; malformed resolved props are rejected with the canonical Ajv error.

The Ajv adapter is only a minimal proof of API feasibility. Real adoption still needs whole-view structure/graph validation, binding-aware validation, action parameter/revision/source validation, error fallback, persisted view identity and integration/browser testing. These are not implemented by these probes.
