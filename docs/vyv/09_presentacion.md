# Estructura de la Presentación — Defensa del Proyecto

> **Materia:** Verificación y Validación de Software — UTEQ

15 "slides" alineadas con la guía del examen (estructura sugerida: portada + 13 temas + cierre de recursos). En `[]` se indica demo en vivo o evidencia a mostrar.

---

## 1. Portada
- Nombre del proyecto: Sistema de Registro de Calificaciones.
- Integrantes: Castro Espinoza Kevin Moisés · Vélez López Ricardo Elías.
- Docente: Ing. Cordero Bazurto José Steven, universidad, fecha.

## 2. Presentación del proyecto
- Problema (planillas físicas/Excel, sin trazabilidad).
- Objetivo y alcance.
- Arquitectura y tecnologías (Node/Express + PostgreSQL, esquema `colegio`).
- Roles: administrador, profesor, representante, psicóloga.
- **[Demo]** login e ingreso al dashboard como admin.

## 3. Técnica Personas
- Las 4 personas: Moisés (admin), Elena (docente), Fernando (representante), María (psicóloga).
- Tabla resumen: rol, objetivo, foco de pruebas.

## 4. Historias de usuario (HU-01…HU-09)
- Tabla de historias con su usuario.
- Ejemplos de criterios de aceptación de HU-03 (rango 0–10, guardado masivo, upsert auditado, 403).

## 5. Casos de prueba
- 14 casos manuales, 100% PASS.
- Mostrar matriz resumen CP-01…CP-14.
- **Ejemplo de validaciones de negocio:** cédula duplicada → 409, nota 11 → 400, materia no asignada → 403. **[Demo API o capturas]**.

## 6. Automatización (Playwright)
- Herramienta, base URL, config.
- 35 casos UI + 66 checks API = 101 PASS (repo actualizado a `origin/main`).
- **[Demo]** correr `npm test` (API) y `npm run test:e2e` (UI) en vivo o mostrar evidencias `e2e_test_repo_66.txt` y `playwright_repo_35.txt`.

## 7. Casos UAT
- 7 casos UAT; tabla historia → decisión **ACEPTADO**.
- Explicar UAT-04 (representante solo ve a sus hijos) como el más representativo.

## 8. Prueba Beta
- 6 participantes, 7 días, dispositivos (4 laptop + 2 móvil).
- Funcionalidades validadas.

## 9. Observaciones Beta
- 0 errores funcionales, 2 dificultades de uso, 6 sugerencias.
- Acciones tomadas y backlog priorizado.

## 10. Encuesta de satisfacción
- Diseño Google Forms, **20 preguntas**: 14 Likert 1–5 + 4 Sí/No + 2 abiertas. Aplicada a **30 usuarios**.

## 11. Resultados de la encuesta
- Satisfacción global **4.7/5 (94%)** (N=30); confiabilidad, precisión y seguridad 5.0; apariencia y mensajes de error 4.2.
- Sí/No: 112/120 favorables (93%); 0 errores bloqueantes.
- Interpretación y próximas mejoras.

## 12. Resumen de correcciones y mejoras (hallazgos V&V)
- Tabla H1–H15 con los bugs reales encontrados y corregidos (migraciones, SP, search_path, desalineación de profesores, representante sin enlazar, etc.).
- Cierre: todas las suites en verde.

## 13. Conclusiones
- 14/14 manuales, 101/101 automatizados, 7/7 UAT.
- Satisfacción 4.7/5 → listo para producción.
- Mejoras futuras (exportación, gráficos, móvil).
- **Cierre + ronda de preguntas.**

## 14. Demostración final
- Recorrido en vivo de ~5 min: login admin → planilla como Elena (ciclo/parcial) → guardar notas → auditoría con usuario → consulta de Fernando → rendimiento de María → correr `npm test` y `npm run test:e2e --prefix backend`.
- Preparado: backend en :3000, BD migraciones 01-20, 110 estudiantes.

## 15. Enlace de recursos
- Repositorio `github.com/MoisesPanama/sistema-calificaciones-uteq` · BD PostgreSQL 18 esquema `colegio` · evidencias en `docs/vyv/evidencias/` · documento técnico PDF/DOCX · suites `backend/e2e_test.js` y `backend/tests/`.

---

## Plan de demo en vivo (recomendado)

| Paso | Acción | Tiempo |
|---|---|---|
| 1 | `node app.js` (backend en :3000) | arranque |
| 2 | Login admin `admin@uteq.edu.ec / UTEQ2026` | 30 s |
| 3 | Registrar nota como Elena (Ciencias Naturales, ciclo/parcial) | 1 min |
| 4 | Consulta representante (Fernando → hijos con promedios) | 30 s |
| 5 | `npm test` (66 API) y `npm run test:e2e --prefix backend` (35 UI) | 1 min |
| 6 | Mostrar dashboard admin (movimientos, respaldos) | 30 s |
| 7 | Mostrar encuesta/resultados | 30 s |

Total ~5 min de demostración.