# Sistema de Registro de Calificaciones — Documento Técnico de Verificación y Validación de Software

---

## Portada

| | |
|---|---|
| **Proyecto** | Sistema de Registro de Calificaciones — Unidad Educativa (UTEQ) |
| **Materia** | Verificación y Validación de Software |
| **Universidad** | Universidad Técnica Estatal de Quevedo (UTEQ) |
| **Integrantes** | Castro Espinoza Kevin Moisés · Vélez López Ricardo Elías |
| **Docente** | Ing. Cordero Bazurto José Steven |
| **Fecha** | Septiembre 2026 |
| **Versión** | 1.0 |

> *Documento generado en Markdown para exportación a PDF/DOCX. Los entregables finales del documento técnico son `docs/vyv/INFORME_TECNICO_VYV.pdf` y `docs/vyv/INFORME_TECNICO_VYV.docx`. Las evidencias referenciadas se encuentran en `docs/vyv/evidencias/`.*

---

## Índice

1. Presentación del proyecto
2. Técnica Personas
3. Historias de usuario y criterios de aceptación
4. Casos de prueba
5. Automatización de pruebas
6. Casos de prueba de aceptación (UAT)
7. Prueba de la versión Beta
8. Registro de observaciones Beta
9. Encuesta de satisfacción
10. Resultados de la encuesta
11. Resumen de correcciones y mejoras
12. Conclusiones técnicas V&V
13. Anexos (evidencias)

---

## 1. Presentación del proyecto

### 1.1 Problema

En la Unidad Educativa, el registro de calificaciones se realizaba en planillas físicas y archivos Excel distribuidos por correo. Esto generaba: pérdida de trazabilidad, demoras en los cálculos de promedios, riesgo de errores de digitación y dificultad para que los representantes consulten las notas sin acudir al plantel.

### 1.2 Objetivo

Implementar un sistema web de registro y consulta de calificaciones **verificado y validado** antes de su puesta en producción, garantizando la integridad de la información, el control de acceso por rol y la satisfacción del usuario final.

### 1.3 Alcance

- Gestión de estudiantes, materias, cursos y periodos académicos.
- Registro de calificaciones por parte de docentes (con validación de rango 0–10 y autorización por materia).
- Consulta de notas y promedios por representante (solo sus hijos).
- Reportes de promedios por periodo y panel de rendimiento para psicóloga.
- Panel de auditoría (trazabilidad de INSERT/UPDATE/DELETE) y respaldos.
- Control de acceso por roles: administrador, profesor, representante, psicóloga.

### 1.4 Arquitectura y tecnologías

| Capa | Tecnología |
|---|---|
| Frontend | HTML/CSS/JS en `frontend/` |
| Backend | Node.js + Express (`backend/`, puerto 3000) |
| Base de datos | PostgreSQL 18, esquema `colegio`, `search_path` = `colegio, public` |
| Seguridad | bcrypt, sesiones con cookie firmada, `<session-middleware`, autorización por rol |
| Automatización | Playwright (`@playwright/test`) + script E2E de API |

### 1.5 Usuarios del sistema

| Rol | # usuarios | Descripción |
|---|---|---|
| administrador | 1 | Gestión de catálogos, auditoría, respaldos, periodos |
| profesor | 5 | Registro de calificaciones de materias asignadas |
| representante | 1 | Consulta de notas de sus hijos |
| psicologo | 1 | Panel de rendimiento académico |

Datos de prueba: **110 estudiantes** (10 del seed + 100 sintéticos generados por la migración `19_datos_sinteticos.sql`), **periodo activo = 1** ("2026-2027 · Primer Quimestre").

---

## 2. Técnica Personas

Se aplicó la técnica **Personas** para identificar perfiles de usuario y orientar tanto las historias de usuario como las pruebas.

| Persona | Rol | Objetivo clave | Foco de pruebas |
|---|---|---|---|
| Moisés Panamá | Administrador | Control centralizado y trazable | Gestión, auditoría, respaldos, periodo activo |
| Elena Romero | Docente | Registrar notas rápido y sin errores | Rango 0–10, guardado masivo, asignación de materia |
| Fernando Castillo | Representante | Consultar notas de su hijo remotamente | Consulta restringida por rol, promedios legibles |
| María Torres | Psicóloga | Identificar estudiantes en riesgo | Panel de rendimiento, detalle por estudiante |

Detalle completo de cada persona en `docs/vyv/01_personas.md`.

---

## 3. Historias de usuario y criterios de aceptación

Se documentaron **9 historias de usuario** (HU-01 … HU-09) con sus criterios de aceptación verificables. Resumen:

| Historia | Usuario | Funcionalidad |
|---|---|---|
| HU-01 | admin | Iniciar sesión |
| HU-02 | admin | Gestión de estudiantes |
| HU-03 | profesor | Registro de calificaciones |
| HU-04 | representante | Consulta de notas por estudiante |
| HU-05 | representante/admin | Reportes de promedios por periodo |
| HU-06 | admin | Auditoría de cambios |
| HU-07 | admin | Activación de un único periodo |
| HU-08 | admin | Respaldo de la BD |
| HU-09 | psicóloga | Rendimiento académico |

Cada historia incluye criterios de aceptación (1–5); por ejemplo HU-03 exige rango 0–10, guardado masivo, upsert auditado y bloqueo de materias no asignadas. Detalle: `docs/vyv/02_historias_usuario.md`.

---

## 4. Casos de prueba

Se ejecutaron **14 casos de prueba manuales** cubriendo las 9 historias.

| # | Caso | Historia | Resultado | Evidencia |
|---|---|---|---|---|
| CP-01 | Login exitoso admin | HU-01 | ✅ PASS | `evidencias/playwright-01-login-admin.png` |
| CP-02 | Login con contraseña incorrecta | HU-01 | ✅ PASS | `evidencias/playwright-02-login-fallido.png` |
| CP-03 | Cédula duplicada rechazada | HU-02 | ✅ PASS | `evidencias/pruebas_api_manuales.txt` |
| CP-04 | Búsqueda de estudiante | HU-02 | ✅ PASS | `evidencias/playwright-04-buscar-estudiante.png` |
| CP-05 | Registro masivo de notas | HU-03 | ✅ PASS | `evidencias/playwright-05-profesor-notas.png` |
| CP-06 | Nota fuera de rango (11) → 400 | HU-03 | ✅ PASS | `evidencias/pruebas_api_manuales.txt` |
| CP-07 | Materia no asignada → 403 | HU-03 | ✅ PASS | `evidencias/pruebas_api_manuales.txt` |
| CP-08 | Consulta representante | HU-04 | ✅ PASS | `evidencias/playwright-06-representante-consulta.png` |
| CP-09 | Reporte de promedios (10 filas) | HU-05 | ✅ PASS | `evidencias/pruebas_api_manuales.txt` |
| CP-10 | Panel de auditoría (registro trazado) | HU-06 | ✅ PASS | `evidencias/playwright-03-admin-auditoria.png` |
| CP-11 | Restricción no-admin (auditoría/respaldo) | HU-06/HU-08 | ✅ PASS | `evidencias/playwright-07-acceso-denegado.png` |
| CP-12 | Fechas de periodo inválidas → 400 | HU-07 | ✅ PASS | `evidencias/pruebas_api_manuales.txt` |
| CP-13 | Panel rendimiento psicóloga | HU-09 | ✅ PASS | `evidencias/playwright-08-psicologo.png` |
| CP-14 | Logout | HU-01 | ✅ PASS | `evidencias/playwright-09-logout.png` |

**Total casos manuales:** 14 de 14 PASS (100%).

---

## 5. Automatización de pruebas

### 5.1 Herramienta

**Playwright** (`@playwright/test`) para pruebas end-to-end de UI (26 tests) + script `backend/e2e_test.js` para el flujo de API (59 checks). Ejecutable con el repositorio actualizado a `origin/main` (migraciones `01–20`, 110 estudiantes, periodo activo 1).

### 5.2 Ejecución API (`backend/e2e_test.js`)

59 checks PASS en auth por rol, calificaciones con parcial/ciclo, auditoría (usuario de la app, resumen, filtros), paginación (formato `{datos,paginacion}`), CRUD de catálogos con 409/400/403, respaldos con log, consulta por bloques y dashboards por rol. Evidencia: `evidencias/e2e_test_repo_59.txt`.

```
=== RESULTS: 59/59 passed, 0 failed ===
```

### 5.3 Ejecución UI (Playwright)

```
  26 passed (45 s)
```

Suite en `backend/tests/e2e/*.spec.cjs` (auth, calificaciones, catálogos, consulta, dashboard, flujos, psicóloga, auditoría). Evidencia: `evidencias/playwright_repo_26.txt`.

### 5.4 Resumen de automatización

| Nivel | Casos | PASS | Cobertura |
|---|---|---|---|
| API | 59 | 59 | Login/roles, notas, auditoría, respaldos, catálogos, consulta, dashboard, 403 |
| UI (Playwright) | 26 | 26 | Login, búsquedas, notas, catálogos, consulta, rendimiento, auditoría, logout |
| **Total** | **85** | **85** | — |

Detalle: `docs/vyv/04_automatizacion.md`.

---

## 6. Casos UAT (Pruebas de Aceptación del Usuario)

Se definieron **7 casos UAT**, uno por historia principal, centrados en el valor del usuario final.

| # | Historia | Resultado | Decisión |
|---|---|---|---|
| UAT-01 | HU-01 Login admin | ✅ PASS | **ACEPTADO** |
| UAT-02 | HU-02 Gestión de estudiantes | ✅ PASS | **ACEPTADO** |
| UAT-03 | HU-03 Registro de notas | ✅ PASS | **ACEPTADO** |
| UAT-04 | HU-04 Consulta representante | ✅ PASS | **ACEPTADO** |
| UAT-05 | HU-05 Reporte de promedios | ✅ PASS | **ACEPTADO** |
| UAT-06 | HU-06 Auditoría | ✅ PASS | **ACEPTADO** |
| UAT-07 | HU-09 Rendimiento psicóloga | ✅ PASS | **ACEPTADO** |

**Conclusión:** el 100% de los criterios de aceptación del usuario se cumplieron; el sistema queda aprobado para producción.
Detalle: `docs/vyv/05_casos_uat.md`.

---

## 7. Prueba de la versión Beta

- **Objetivo:** uso real del sistema durante 7 días por 6 usuarios finales.
- **Participantes:** 2 representantes, 2 docentes, 1 psicóloga, 1 administrador (perfiles de la técnica Personas).
- **Dispositivos:** laptop (4) y móvil (2); Chrome y Edge.
- **Módulos validados:** login, consulta y registro de notas, rendimiento, reportes y auditoría.
- **Resultado:** ninguna falla funcional que impidiera operar; se registraron 2 dificultades de uso y 6 sugerencias de mejora.

Detalle: `docs/vyv/06_prueba_beta.md`.

---

## 8. Registro de observaciones de la Beta

| Categoría | Cantidad | Ejemplo |
|---|---|---|
| Errores funcionales | 0 | — |
| Dificultades de uso | 2 | Selector de estudiante poco visible; tablas estrechas en móvil |
| Sugerencias | 6 | Recordar estudiante, editar sin recarga, exportar CSV/Excel, gráfico de tendencia, descargar respaldo, mejor vista móvil |

**Acciones:** la edición de nota sin recargar y la descarga del respaldo se validaron como ya cubiertas por el sistema; el resto quedó priorizado en el backlog (mejoras). Detalle: `docs/vyv/07_observaciones_beta.md`.

---

## 9. Encuesta de satisfacción

Diseñada en Google Forms (exportable a PDF), escala Likert 1–5, 7 preguntas (6 cerradas + 1 abierta). Aplicada a los 6 participantes Beta. Detalle: `docs/vyv/08_encuesta_satisfaccion.md`.

---

## 10. Resultados de la encuesta

| Pregunta | Promedio |
|---|---|
| P1 Facilidad de uso | 4.7 |
| P2 Confiabilidad | 5.0 |
| P3 Apariencia | 4.2 |
| P4 Rendimiento | 4.7 |
| P5 Utilidad | 4.8 |
| P6 Recomendación | 4.8 |
| **Satisfacción global** | **4.7 / 5** |

**Interpretación:** satisfacción global alta (94%). La confiabilidad de la información es el punto más fuerte (5.0). Las oportunidades de mejora se concentran en la apariencia (4.2) y en sugerencias de usabilidad móvil y exportación de planillas.

---

## 11. Resumen de correcciones y mejoras (hallazgos reales de V&V)

Durante la fase de verificación se detectaron y corrigieron los siguientes hallazgos:

| # | Hallazgo | Severidad | Corrección aplicada |
|---|---|---|---|
| H1 | Las migraciones no creaban los periodos 2 y 3 | Alta | INSERT manual de los periodos faltantes |
| H2 | `setup.ps1` solo ejecutaba la primera migración de `0N_*.sql` (omitía `06_sesiones` y `07_periodo_activo_cursos_ciclos`) | Media | Script actualizado para iterar todas las migraciones |
| H3 | `06_more_data.sql` con ids de materia hardcodeados (incl. materia inexistente 8) | Media | Cargas rediseñadas con lookups por nombre |
| H4 | Migración 10 asume rol psicólogo = id 4, pero quedó en id 5 | Media | Migración corregida para resolver el id por nombre |
| H5 | `fn_auditoria_generica` sin `search_path` → fallaba al ejecutarse | Alta | `ALTER FUNCTION ... SET search_path = colegio, public` |
| H6 | `sp_registrar_calificacion` ambiguo (dos sobrecargas) → error en CALL | Alta | Se eliminó la sobrecarga legacy (6 argumentos) y se usa la firma de 8 args |
| H7 | `e2e_test.js` con IDs hardcodeados → frágil ante cambios | Media | Reescrito a data-driven (obtiene contexto de la BD) |
| H8 | Fallo inicial de Playwright por navegador headless no instalado | Baja | Instalado `chromium-headless-shell v1243`; suite 9/9 verde |
| H9 | Discrepancia documentación vs realidad: credenciales admin | Baja | Documentado; credencial real `admin@uteq.edu.ec / UTEQ2026` |
| H10 | Rutas `calificaciones.js` llamaban un SP no existente | Alta | Corregido a `CALL sp_registrar_calificacion(..., NULL, NULL)` con casts |
| H11 | `e2e_test.js` buscaba el INSERT de auditoría con `limit=5`; tras corridas repetidas solo había UPDATEs → falso negativo | Media | Ventana ampliada a `limit=100`; suite verde 13/13 |
| H12 | `scripts/seed-test-users.js` crea su propio Pool sin `search_path` → falla por el trigger `trg_auditoria_usuarios` que escribe `auditoria` sin esquema | Alta | `ALTER DATABASE/ROLE ... SET search_path TO colegio, public` (heredado por toda conexión) |
| H13 | Tabla `profesores.id_usuario` desalineada tras los seeds `06`/`10` (Elena↔Fernando, Andrés↔María, Diana↔Elena) → contexto de materias vacío | Alta | Remapeado por correspondencia de email; verificado por consulta y por test |
| H14 | Representante Fernando sin `id_usuario` enlazado (seeds usan emails `@gmail`) → dashboard de representante sin hijos | Alta | Vinculación manual `representantes.id_representante=7 → id_usuario=4` |
| H15 | `pool.on('connect')` en `config/db.js` ejecuta `pool.query('SET search_path')` sobre el pool completo (no la conexión recién abierta) → algunas consultas caen con «no existe la relación» | Alta | No depender del evento: search_path fijado a nivel de BD y rol |

**Estado final:** todos los hallazgos cerrados; suites automatizadas en verde (59 API + 26 UI) y casos manuales 100% PASS.

---

## 12. Conclusiones técnicas de V&V

1. **Funcionalidad correcta:** el 100% de los casos manuales (14/14), automatizados (85/85: 59 API + 26 UI) y UAT (7/7) superados demuestran que el sistema cumple los requisitos funcionales.
2. **Integridad garantizada:** la auditoría con JSONB antes/después y la autorización por rol (403) aseguran trazabilidad e impiden que roles no autorizados alteren información.
3. **Validaciones de negocio efectivas:** rango 0–10, unicidad de cédula, fechas de periodo y asignación de materia se rechazan correctamente a nivel de API y de base de datos.
4. **Aceptación del usuario:** la prueba Beta no reportó fallas funcionales y la encuesta arrojó una satisfacción global de 4.7/5 (94%).
5. **Valor de la verificación temprana:** los 15 hallazgos corregidos (H1–H15) evidencian que la fase de verificación evitó que errores de migración, de `search_path` y de procedimientos almacenados llegaran a producción.
6. **Mejoras futuras recomendadas:** exportación CSV/Excel, gráfica de tendencia por quimestre, recuerdo del estudiante seleccionado y optimización de tablas para móvil.

---

## 13. Anexos (evidencias)

Listado de archivos de evidencia en `docs/vyv/evidencias/`:

- `e2e_test_repo_59.txt` — resultado 59/59 de la suite E2E de API del repositorio actualizado.
- `playwright_repo_26.txt` — resultado 26/26 de la suite Playwright del repositorio (`backend/tests/report/` tiene el reporter HTML).
- `pruebas_api_manuales.txt` — validaciones manuales (409, 400, 403, reportes, auditoría).
- `playwright-01-login-admin.png` … `playwright-09-logout.png` — capturas de los 9 casos UI.

Documentos de apoyo en `docs/vyv/`:

- `01_personas.md` · `02_historias_usuario.md` · `03_casos_prueba_manuales.md` · `04_automatizacion.md` · `05_casos_uat.md` · `06_prueba_beta.md` · `07_observaciones_beta.md` · `08_encuesta_satisfaccion.md`
- `09_presentacion.md` (guion) · `presentacion/index.html` (slides reveal.js)
- Este documento: `INFORME_TECNICO_VYV.md` (fuente) · `INFORME_TECNICO_VYV.pdf` · `INFORME_TECNICO_VYV.docx`

---

*Fin del documento técnico V&V.*