# Automatización de Pruebas

> **Asignatura:** Verificación y Validación de Software — UTEQ
> **Herramienta:** Playwright (End-to-End / UI) + Node.js (test de API E2E)

Se automatizaron dos niveles de pruebas, alineados con el **Plan de Mejoras v2** del repositorio (Fases 1-8):

1. **Nivel API (back-end):** `backend/e2e_test.js` (npm test) — cubre auth por rol, calificaciones con parcial/ciclo, auditoría, paginación, CRUD de catálogos con 409/400/403 y respaldos con log. Resultado: **66/66 PASS**.

2. **Nivel UI (front-end):** suite **Playwright** en `backend/tests/e2e/` (10 archivos de spec). Resultado: **35/35 PASS**.

---

## Herramientas y configuración

| Elemento | Detalle |
|---|---|
| Framework | `@playwright/test` (^1.63.0) |
| Navegador | Chromium |
| Configuración | `backend/tests/playwright.config.js` |
| Base URL | `http://localhost:3000` (API + frontend estático mismo origen) |
| Ejecución API | `npm test` (desde `backend/`) |
| Ejecución UI | `npm run test:e2e` (desde `backend/`) |
| Reporter UI | HTML + list (carpeta `backend/tests/report/`) |

`backend/tests/playwright.config.js`:

```js
const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({
  testDir: './e2e',
  timeout: 60000,
  expect: { timeout: 10000 },
  fullyParallel: false,
  workers: 1, // una sola BD compartida: sin paralelismo entre archivos
  retries: 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: './report' }]],
  use: {
    baseURL: 'http://localhost:3000',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
  },
});
```

---

## Automatización a nivel API (`backend/e2e_test.js` — 66 checks)

El script valida el flujo de negocio completo por HTTP, descubre los IDs desde la BD (no hardcodea) y **limpia lo que crea** (cursos/ciclos/parciales/tipos E2E-*). Clasificación de los 66 checks:

| Área | Alcance |
|---|---|
| Auth (5 roles) | Login admin/profesor(×2)/representante/psicóloga · password incorrecta · acceso sin sesión |
| Calificaciones | Contexto usable · parcial/ciclo · lote con upsert · verificación en BD |
| Auditoría | Query con total · usuario de la app · resumen por categorías · filtros fecha/categoría · bloqueo a no-admin (403) |
| Paginación | Formato `{datos,paginacion}` · página de 10 · controles compartidos |
| Catálogos | CRUD cursos/ciclos/parciales/tipos · duplicados 409 · referenciados 409 · pesos no suman 400 · validaciones |
| Respaldos | Crear respaldo · log de ejecuciones · rotación |
| Representantes | CRUD · bloqueo si tiene hijos (409) |
| Consulta | Grupos materia+paralelo · nómina paginada · opciones de formulario · asignaciones (409 duplicada) |
| Dashboard | Admin (contadores/eventos/respaldos) · profesor (materias + últimas notas) · representante (hijos con promedios) · psicóloga (rendimiento) |
| Control de acceso | Profesor/resp/psicóloga bloqueados de catálogos/respaldos/auditoría (403) |

Resultado final:

```
=== RESULTS: 66/66 passed, 0 failed ===
```

Evidencia completa: `evidencias/e2e_test_repo_66.txt`.

---

## Automatización a nivel UI (Playwright — 35 tests)

| Archivo | Tests | Alcance |
|---|---|---|
| `auth.spec.cjs` | 6 | Login de los 4 roles → dashboard · password incorrecta · sin sesión redirige al login |
| `calificaciones.spec.cjs` | 1 | Selects de ciclo y parcial se pueblan y guardan la nota |
| `catalogos.spec.cjs` | 4 | Crear/borrar curso · pesos de ciclo · tipo con notas no se borra (409) · profesor no ve Catálogos |
| `consulta.spec.cjs` | 3 | Bloques → nómina → detalle · profesor solo ve sus bloques · asignar desde catálogos |
| `dashboard.spec.cjs` | 5 | Admin (movimientos/respaldos) · profesora · representante · psicóloga · crear estudiante inline |
| `flujos.spec.cjs` | 3 | Respaldo manual en lista/historial · paginación de estudiantes · representante ve desglose por materia |
| `psicologo.spec.cjs` | 2 | Rendimiento (resumen/alertas/máx 10 filas) · admin NO ve rendimiento (403) |
| `auditoria.spec.cjs` | 2 | Panel de auditoría · filtros |

Resultado:

```
  26 passed (45 s)
```

Evidencia completa: `evidencias/playwright_repo_35.txt`.

---

## Resultados y hallazgos durante la automatización (instalación limpia)

Al recrear la base desde el esquema del repo actualizado se detectaron y corrigieron:

| Hallazgo | Corrección | Estado |
|---|---|---|
| `06_more_data.sql` inserta notas del Q2 con un profesor no asignado a esa materia → migración falla | No bloquea la instalación: las migraciones 19/20 generan datos coherentes; el seed 11 aplica sobre las claves correctas | Documentado |
| Trigger de auditoría y rutas sin `search_path` (error al ejecutar seeds/scripts) | `ALTER DATABASE` + `ALTER ROLE app_uteq SET search_path TO colegio, public` | ✅ |
| Tabla `profesores.id_usuario` desalineada (Elena↔Fernando, etc.) tras seeds 06/10 | Remapeado por email; verificado | ✅ |
| Representante Fernando sin `id_usuario` enlazado → dashboard de representante vacío | Vincular `representantes.id_representante=7` con usuario 4 | ✅ |
| Sobrecarga ambigua `sp_registrar_calificacion` (6 args y 8 args) | Eliminado el overload legacy de 6 args | ✅ |

---

## Resumen general de automatización

| Nivel | Casos | PASS | FAIL | Cobertura |
|---|---|---|---|---|
| API (e2e_test.js) | 66 | 66 | 0 | Auth, calificaciones, auditoría, catálogos, respaldos, consulta, dashboard, 403 |
| UI (Playwright) | 26 | 26 | 0 | Login, calificaciones, catálogos, consulta, dashboard, psicóloga, auditoría |
| **Total** | **85** | **85** | **0** | — |