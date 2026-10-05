# Leonety AI provider adapters

The Assistant calls `src/lib/ai-provider.ts`, which is the server-only provider facade. Assistant routes, authorization, product knowledge, scope rules and workspace tools must not import a provider implementation directly.

## Current provider

Only OpenAI is registered. Its adapter is `src/lib/ai-providers/openai.ts` and preserves the Responses API integration, model selection, JSON/vision support, timeouts and conservative retry behavior.

Server configuration:

- `AI_PROVIDER=openai` (optional; OpenAI remains the default)
- `AI_MODEL` (optional; defaults to `gpt-5-mini`)
- `AI_API_KEY` or the existing `OPENAI_API_KEY` fallback

No AI credential may use a `NEXT_PUBLIC_*` variable.

## Adding a provider

1. Obtain and verify the provider's official server API documentation. Do not infer an OpenAI-compatible endpoint.
2. Extend `AiProviderName` in `src/lib/ai-provider-contract.ts`.
3. Add one server-only adapter under `src/lib/ai-providers/` implementing `AiProvider`:
   - `validateConfiguration()` reports local configuration readiness without returning secrets.
   - `healthCheck()` reports a normalized readiness result. It must not expose credentials or raw provider responses.
   - `generate()` maps Leonety's bounded text request to the provider's documented API.
   - `classify()` returns a bounded classification response when provider-backed classification is needed. Leonety's authorization and deterministic scope gate remain outside the provider.
   - `generateVisionJson()` is optional and must be omitted when unsupported.
4. Add the adapter to `providerRegistry` in `src/lib/ai-provider.ts`.
5. Add server-only environment parsing for that provider. Never reuse another provider's credential names and never expose keys to client code.
6. Normalize provider failures to `AiProviderError`: `configuration_missing`, `provider_auth_failed`, `rate_limited`, `quota_exhausted`, `provider_unavailable`, `invalid_model`, `request_timeout` or `invalid_response`.
7. Add tests for configuration, request/response mapping, timeout, 401/403, 429, 5xx and malformed responses.

Provider adapters receive only the already-authorized, minimized envelope produced by the Assistant route. They must not query Supabase, select a workspace, read cookies, access sessions, decrypt integration credentials or implement arbitrary SQL/tools.

