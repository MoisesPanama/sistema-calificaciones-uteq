# Casos de Prueba Manuales

> **Asignatura:** Verificación y Validación de Software — UTEQ
> **Método:** Pruebas funcionales manuales ejecutadas sobre la API y la interfaz web.
> **Entorno:** `localhost:3000` (API) · `localhost:5173` (frontend) · PostgreSQL 18 · Node 24.
> **Estado global:** 14/14 casos finalizados · 14 PASS · 0 FAIL.

---

## CP-01 — Login exitoso (administrador)

| Campo | Valor |
|---|---|
| Historia | HU-01 |
| Precondiciones | Usuario `admin@uteq.edu.ec` activo |
| Pasos | 1) Abrir `login.html`. 2) Ingresar correo y contraseña. 3) Enviar formulario. |
| Datos de prueba | `admin@uteq.edu.ec` / `UTEQ2026` |
| Resultado esperado | Redirección a `dashboard.html`, saludo "Bienvenido" y rol `administrador` |
| Resultado obtenido | Redirección correcta; `#bienvenida` = "Bienvenido"; `#rol` = administrador |
| Estado | ✅ PASS |
| Evidencia | `evidencias/playwright-01-login-admin.png` (CP-AUT-01) |

## CP-02 — Login con contraseña incorrecta

| Campo | Valor |
|---|---|
| Historia | HU-01 |
| Precondiciones | — |
| Pasos | 1) Abrir login. 2) Ingresar correo válido y contraseña inválida. 3) Enviar. |
| Datos de prueba | `admin@uteq.edu.ec` / `clave_equivocada` |
| Resultado esperado | Mensaje de error visible, sin sesión creada |
| Resultado obtenido | `#error` visible con mensaje de credenciales inválidas |
| Estado | ✅ PASS |
| Evidencia | `evidencias/playwright-02-login-fallido.png` (CP-AUT-02) |

## CP-03 — Registro de estudiante con cédula duplicada

| Campo | Valor |
|---|---|
| Historia | HU-02 |
| Precondiciones | Sesión de administrador; cédula `1250001111` ya registrada |
| Pasos | 1) Enviar `POST /api/estudiantes/` con la cédula duplicada. |
| Datos de prueba | `cedula=1250001111`, `nombres=Dup`, `apellidos=Test`, `fecha_nacimiento=2010-01-01`, `id_representante=1` |
| Resultado esperado | Respuesta 409 con mensaje "Ya existe un estudiante registrado con esa cedula." |
| Resultado obtenido | `HTTP 409` + mensaje exacto |
| Estado | ✅ PASS |
| Evidencia | salida de terminal (verificación manual API) |

## CP-04 — Búsqueda de estudiante por cédula

| Campo | Valor |
|---|---|
| Historia | HU-02 |
| Precondiciones | Sesión de administrador |
| Pasos | 1) Ir a `estudiantes.html`. 2) Escribir cédula en `#q`. 3) Clic en Buscar. |
| Datos de prueba | `q=1250001111` |
| Resultado esperado | Tabla con el estudiante "Ana García" y su cédula |
| Resultado obtenido | Fila con la cédula y el nombre esperado |
| Estado | ✅ PASS |
| Evidencia | `evidencias/playwright-04-buscar-estudiante.png` (CP-AUT-04) |

## CP-05 — Registro de calificaciones en el rango válido

| Campo | Valor |
|---|---|
| Historia | HU-03 |
| Precondiciones | Sesión de Elena Romero (profesora, materia "Ciencias Naturales"); periodo activo = 1 |
| Pasos | 1) Ir a `calificaciones.html`. 2) Seleccionar materia. 3) Ingresar nota 8.75. 4) Guardar todas. |
| Datos de prueba | Materia: Ciencias Naturales; nota: 8.75 |
| Resultado esperado | Mensaje de éxito "Se guardaron N calificaciones." |
| Resultado obtenido | `#ok` visible con mensaje de éxito |
| Estado | ✅ PASS |
| Evidencia | `evidencias/playwright-05-profesor-notas.png` (CP-AUT-05) |

## CP-06 — Nota fuera de rango (0–10) rechazada

| Campo | Valor |
|---|---|
| Historia | HU-03 (CA-2) |
| Precondiciones | Sesión de Elena Romero |
| Pasos | 1) Enviar `POST /api/calificaciones/` con valor 11. |
| Datos de prueba | `valor=11`, materia 3, periodo 1, estudiante 1, tipo 1 |
| Resultado esperado | HTTP 400: "La calificacion 11 esta fuera de rango (0 a 10)" |
| Resultado obtenido | `HTTP 400` + mensaje exacto |
| Estado | ✅ PASS |
| Evidencia | salida de terminal (validación en SP + trigger) |

## CP-07 — Profesor bloqueado para materia no asignada

| Campo | Valor |
|---|---|
| Historia | HU-03 (CA-5) |
| Precondiciones | Sesión de Elena Romero (solo tiene "Ciencias Naturales") |
| Pasos | 1) Enviar `POST /api/calificaciones/` intentando registrar en "Matemáticas" (id 1). |
| Datos de prueba | `id_materia=1`, periodo 1, valor 8.5 |
| Resultado esperado | HTTP 403: "No tiene asignada esta materia en el periodo" |
| Resultado obtenido | `HTTP 403` + mensaje exacto |
| Estado | ✅ PASS |
| Evidencia | salida de terminal |

## CP-08 — Consulta de notas (representante)

| Campo | Valor |
|---|---|
| Historia | HU-04 |
| Precondiciones | Sesión de Fernando Castillo (representante) |
| Pasos | 1) Ir a `consulta.html`. 2) Seleccionar estudiante. 3) Verificar notas y promedio. |
| Datos de prueba | Hijo: Isabella Castillo |
| Resultado esperado | Tablas de notas por materia y promedio general con escala |
| Resultado obtenido | Tabla con notas, "Promedio" visible |
| Estado | ✅ PASS |
| Evidencia | `evidencias/playwright-06-representante-consulta.png` (CP-AUT-06) |

## CP-09 — Reporte de promedios por periodo

| Campo | Valor |
|---|---|
| Historia | HU-05 |
| Precondiciones | Sesión con permisos (admin) |
| Pasos | 1) Enviar `GET /api/reportes/?id_periodo=3`. |
| Datos de prueba | `id_periodo=3` |
| Resultado esperado | 10 filas ordenadas por promedio descendente con escala cualitativa |
| Resultado obtenido | 10 filas; primer lugar Daniel García 9.45 "Domina los aprendizajes requeridos" |
| Estado | ✅ PASS |
| Evidencia | salida de terminal (JSON de respuesta) |

## CP-10 — Panel de auditoría (admin)

| Campo | Valor |
|---|---|
| Historia | HU-06 |
| Precondiciones | Sesión de administrador; hay actividad registrada |
| Pasos | 1) Ir a `auditoria.html`. 2) Verificar total, filtros y registros con datos JSON antes/después. |
| Datos de prueba | `page=1&limit=3` |
| Resultado esperado | Total > 0, registros con `datos_anteriores`/`datos_nuevos` y usuario de la app |
| Resultado obtenido | Total > 1000 registros, cada uno con JSONB (`datos_anteriores`/`datos_nuevos`) y usuario de la app |
| Estado | ✅ PASS |
| Evidencia | `evidencias/playwright-03-admin-auditoria.png` + `evidencias/e2e_test_repo_59.txt` |

## CP-11 — Restricción de acceso a auditoría/respaldos (no admin)

| Campo | Valor |
|---|---|
| Historia | HU-06 (CA-1), HU-08 |
| Precondiciones | Sesión de representante y de profesor |
| Pasos | 1) Verificar que el menú no muestra Auditoría/Respaldos. 2) Navegar directo por URL a `auditoria.html`. |
| Datos de prueba | Sesión de Fernando Castillo |
| Resultado esperado | Error "No tienes permiso para acceder a esta seccion." |
| Resultado obtenido | Mensaje de permiso denegado en `main .alert-error` |
| Estado | ✅ PASS |
| Evidencia | `evidencias/playwright-07-acceso-denegado.png` (CP-AUT-07) + e2e (403) |

## CP-12 — Creación de periodo con fechas inválidas rechazada

| Campo | Valor |
|---|---|
| Historia | HU-07 |
| Precondiciones | Sesión de administrador |
| Pasos | 1) Enviar `POST /api/periodos/` con fecha_fin anterior a fecha_inicio. |
| Datos de prueba | `nombre=Test`, inicio 2026-09-01, fin 2026-01-01 |
| Resultado esperado | HTTP 400: "La fecha de fin debe ser posterior a la fecha de inicio." |
| Resultado obtenido | `HTTP 400` + mensaje exacto |
| Estado | ✅ PASS |
| Evidencia | salida de terminal (CHECK en BD + validación en ruta) |

## CP-13 — Rendimiento académico (psicóloga)

| Campo | Valor |
|---|---|
| Historia | HU-09 |
| Precondiciones | Sesión de María Torres (psicóloga) |
| Pasos | 1) Ir a `psicologo.html`. 2) Ver resumen y detalle de estudiante. |
| Datos de prueba | Estudiantes del periodo activo |
| Resultado esperado | Resumen de tarjetas, alertas y detalle modal por estudiante |
| Resultado obtenido | `#resumen` visible; API `/psicologo/rendimiento` devuelve periodos y estudiantes |
| Estado | ✅ PASS |
| Evidencia | `evidencias/playwright-08-psicologo.png` (CP-AUT-08) |

## CP-14 — Cierre de sesión

| Campo | Valor |
|---|---|
| Historia | HU-01 |
| Precondiciones | Sesión iniciada |
| Pasos | 1) Clic en `#btn-logout`. |
| Resultado esperado | Redirección a `login.html`, sesión destruida |
| Resultado obtenido | Redirección correcta y formulario de login visible |
| Estado | ✅ PASS |
| Evidencia | `evidencias/playwright-09-logout.png` (CP-AUT-09) |

---

## Resumen de ejecución

| Total | PASS | FAIL | Evidencias |
|---|---|---|---|
| 14 | 14 | 0 | Capturas Playwright + checks de API + suites del repo (59 API + 26 UI) |