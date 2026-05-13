# Project Rules

## Core principles
- Make the smallest possible change that fixes the issue.
- Do not refactor unrelated code.
- Do not change copy, pricing, layout, styles, or business logic unless explicitly requested.
- Preserve existing architecture unless the bug requires a targeted structural fix.
- Prefer editing existing files over creating new abstractions.

## Debugging workflow
- First identify root cause.
- Then list of exact files involved.
- Then propose minimal fix.
- Then show: diff summary.
- Do not claim success without verifying import flow and runtime assumptions.

## Next.js rules
- Never import server-only modules into client components.
- Any file importing `next/headers`, `cookies`, server auth helpers, or server-only APIs must remain server-only.
- Separate browser and server clients when using Supabase or similar libraries.
- Do not add `"use client"` unless it is necessary.
- If a component uses hooks or browser APIs, isolate it to the smallest client component possible.

## React rules
- Context hooks must only be used under their matching provider.
- If fixing provider placement, change: provider boundary minimally.
- Do not move providers to global layout unless truly required by app structure.

## UI rules
- Preserve current design language.
- Maintain readable contrast:
  - dark background => light text
  - light background => dark text
- Reuse existing spacing, radius, and button patterns.
- Avoid introducing inconsistent colors.

## File safety
- Before editing, inspect all imports and exports related to: bug.
- Do not edit unrelated files in same task.
- If changing shared utilities, explain every downstream effect.

## Response format
For every non-trivial change, respond with:
1. Root cause
2. Files changed
3. What changed in each file
4. Risks / things to verify.