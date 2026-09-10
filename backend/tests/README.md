# Tests — 3 vías (plan v2, meta: 0 fallos)

## Requisitos previos (una vez)
1. Docker Desktop encendido.
2. `docker compose -f docker-compose.test.yml up -d` (Postgres 18 en `:5433`).
3. Migraciones en orden: `01..17` (ver README principal) + `ALTER DATABASE
   ... SET search_path TO colegio, public` antes de la `10`.
4. `npm install --prefix backend --prefix frontend` (una vez).
5. `backend/.env` apuntando a la BD de pruebas (puerto 5433).
6. Seeds: `node scripts/seed-passwords.js && npm run seed:test-users` (desde `backend/`).
7. API: `npm run dev --prefix backend` (:3000, sirve también el frontend).
8. Primera vez Playwright: `npx playwright install chromium` (desde `backend/`).

## Las 3 vías
| Vía | Comando (desde `backend/`) | Qué hace |
|---|---|---|
| 3 API sin navegador | `npm test` | 38 checks HTTP: auth×5, CRUD+409/400/403, resumen, paginación, respaldo+log |
| 2 Headless | `npm run test:e2e` | 16 tests UI en Chromium sin ventana (~15 s) |
| 1 Headed | `npm run test:e2e:headed` | Los mismos 16 con navegador visible + video/screenshot si falla |

## Notas
- La suite comparte UNA BD: `workers: 1` en `tests/playwright.config.js`
  (sin paralelismo entre archivos). Nombres E2E-* únicos por timestamp.
- Página por defecto: **10 registros** (`?page=&limit=`, formato único
  `{datos,paginacion}`) en estudiantes, reportes, auditoría, historial
  de respaldos y psicólogo. Psicólogo además devuelve `resumen` global
  y top 10 `alertas` fuera de la paginación.
- `backend/.env` actual apunta a la BD Docker de pruebas. Para desarrollo
  normal, ajusta `DB_PORT`/`DB_NAME` a tu Postgres local.
- Los respaldos de prueba van a `backend/backups-test/` (`RESPALDOS_DIR`
  en `.env`, ignorado por git) para no mezclar ni rotar los reales.
- Limpieza: los E2E-* sin notas se borran solos; si una corrida muere a
  medias, borra restos con `DELETE FROM colegio.<tabla> WHERE nombre LIKE 'E2E-%'`.
- `tests/mcp-prompts.md`: prompts listos para el Playwright MCP de VS Code.
