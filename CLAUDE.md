# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev       # Start dev server with HMR
npm run build     # Type-check then bundle for production (tsc -b && vite build)
npm run lint      # Run ESLint across the project
npm run preview   # Serve the production build locally
```

No test suite is configured yet.

## Environment

Requires a `.env` file at the project root with:

```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

The Supabase client (`src/supabaseClient.ts`) reads these via `import.meta.env` and will log an error (but not throw) if they are missing.

## Architecture

This is a React 19 + TypeScript + Vite single-page app that renders a restaurant menu by fetching data from a Supabase Postgres backend.

**Data flow:**
- `src/supabaseClient.ts` — creates and exports the singleton Supabase client.
- `src/types.ts` — defines the `Platillo` interface that mirrors the `platillos` table schema (columns use camelCase with a `platillo` prefix, e.g. `platilloId`, `platilloNombre`).
- `src/components/Menu.tsx` — the only component; on mount it queries `platillos` filtered by `platilloDisponible = true`, then renders a CSS-grid card list.
- `src/App.tsx` — thin root component that renders `<Menu />` inside `<main>`.

**Supabase table: `platillos`**
| Field | Type |
|---|---|
| `platilloId` | string (PK) |
| `platilloNombre` | string |
| `platilloDescripcion` | string \| null |
| `platilloPrecio` | number |
| `platilloCategoria` | string |
| `platilloImagenUrl` | string \| null |
| `platilloDisponible` | boolean |
| `platilloCreadoEn` | string (timestamp) |

All styling is done with inline styles — there is no CSS framework or design system.
