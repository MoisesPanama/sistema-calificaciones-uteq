# Prompts Playwright MCP (VS Code) — plan v2
Pega cada bloque en el chat con el servidor Playwright MCP activo.
Base: http://localhost:3000 (API + frontend mismo origen).
Usuarios: admin@uteq.edu.ec / elena.romero@uteq.edu.ec /
fernando.castillo@uteq.edu.ec / maria.torres@uteq.edu.ec (clave UTEQ2026).

## 1. Humo por rol
> Ve a http://localhost:3000/pages/login.html, inicia sesión como
> admin@uteq.edu.ec / UTEQ2026 y confirma que el sidebar muestra
> Catálogos, Auditoría y Respaldos. Cierra sesión (borra cookies),
> entra como elena.romero@uteq.edu.ec y confirma que ve Registrar Nota
> pero NO Catálogos.

## 2. Catálogos + regla 409
> Como admin, en http://localhost:3000/pages/catalogos.html crea un curso
> "MCP-A" en el periodo activo, intenta crearlo duplicado (debe fallar con
> 409) y luego bórralo. Crea un ciclo con peso formativa 0.5 y sumativa 0.4
> (debe fallar con 400) y otro válido 0.7/0.3 (debe avisar si Σ≠1).

## 3. Notas con parcial
> Como elena.romero@uteq.edu.ec, en calificaciones.html elige materia,
> ciclo y parcial, escribe una nota, usa Guardar del estudiante y confirma
> el mensaje de éxito.

## 4. Auditoría en bloques
> Como admin, en auditoria.html confirma las tarjetas por categoría,
> entra a Calificaciones, filtra por hoy y vuelve al resumen.

## 5. Respaldos
> Como admin, en respaldos.html crea un respaldo manual y confirma que
> aparece en la lista y en el historial como "manual" exitoso.
