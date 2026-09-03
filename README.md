# Sistema de Registro de Calificaciones — UTEQ

Sistema web para la gestión de calificaciones de un colegio, desarrollado
como proyecto para la materia **Taller de Funciones**, Ingeniería en
Sistemas — Universidad Técnica Estatal de Quevedo (UTEQ).

El sistema permite administrar estudiantes, materias, periodos académicos
y calificaciones, calculando promedios mediante funciones y procedimientos
almacenados de PostgreSQL, con soporte de triggers de validación y
auditoría automática de cambios.

## Inicio rápido (un solo comando)

Requisitos previos (lo único a instalar a mano, una vez): Node.js 20+,
PostgreSQL 18 en ejecución, y Git.

```powershell
git clone https://github.com/MoisesPanama/sistema-calificaciones-uteq.git
cd sistema-calificaciones-uteq
powershell -ExecutionPolicy Bypass -File .\setup.ps1
```

Eso instala dependencias, crea el `.env`, el rol/base de datos, ejecuta las
migraciones `01..09`, asigna las passwords de prueba y levanta el servidor en
`http://localhost:3000`. El script es re-ejecutable: si la BD ya existe, la conserva.

> En VS Code también puedes usar la tarea **Setup y levantar proyecto**
> (Terminal → Run Task…). Si `psql` pide password de superusuario, es solo la
> primera vez (para crear rol/BD).

## Integrantes del equipo

- Moises Panama — Backend, base de datos, interfaces de gestión
- *(pendiente asignar)*
- *(pendiente asignar)*

## Stack tecnológico

| Componente         | Tecnología           |
|---------------------|-----------------------|
| Base de datos        | PostgreSQL 18          |
| Backend               | Node.js + Express 5     |
| Motor de vistas        | EJS (renderizado en servidor) |
| Autenticación           | express-session + connect-pg-simple + bcrypt |
| Control de versiones     | Git + GitHub |

## Características principales

- Autenticación con roles (administrador, profesor, representante).
- Gestión de estudiantes, materias y periodos académicos.
- Registro de calificaciones con validación de rango (0–10) mediante
  procedimiento almacenado.
- Cálculo automático de promedios por materia y promedio general, mediante
  funciones de base de datos (el promedio **nunca** se ingresa manualmente).
- Consulta de calificaciones por estudiante, con desglose por parcial.
- Reporte de promedios por periodo, generado con un **cursor explícito**
  en PostgreSQL, tolerante a estudiantes sin calificaciones.
- Panel de auditoría (solo administrador): historial de cambios en
  calificaciones, usuarios y matrículas, con datos antes/después en JSONB.
- Triggers de validación (defensa en profundidad) y auditoría genérica
  a nivel de base de datos.
- Roles de PostgreSQL diferenciados (lectura, profesor, administrador)
  además del control de roles a nivel de aplicación.

## Modelo de base de datos

Esquema `colegio`, normalizado (1FN–3FN), con las siguientes tablas:

`roles`, `usuarios`, `representantes`, `estudiantes`, `profesores`,
`materias`, `periodos_academicos`, `matriculas`,
`profesor_materia_periodo`, `tipos_evaluacion`, `calificaciones`,
`auditoria`, `sesiones`.

### Funciones y procedimientos

| Objeto | Tipo | Descripción |
|--------|------|-------------|
| `fn_promedio_materia` | Función | Promedio anual por materia con fórmula oficial (80% parciales + 20% examen por ciclo, ponderado por peso); con fallback ponderado legacy |
| `fn_promedio_general` | Función | Promedio general del estudiante en un periodo |
| `fn_promedio_parcial` / `fn_promedio_ciclo` | Funciones | Promedio de un parcial (insumos formativos) y de un ciclo/quimestre (80/20) |
| `fn_escala_cualitativa` | Función | Escala oficial (Domina/Alcanza/Próximo/No alcanza) |
| `fn_insumos_faltantes` | Función | Control de mínimo 2 insumos formativos por parcial |
| `sp_registrar_calificacion` | Procedimiento | Valida rango 0–10, matrícula y asignación docente; inserta/actualiza (upsert) con contexto parcial/ciclo |
| `sp_reporte_promedios_periodo` | Función (cursor) | Recorre estudiantes matriculados y devuelve su promedio, tolerando errores individuales |
| `sp_reporte_promedios_curso_materia` | Función (cursor) | Reporte filtrable por curso y materia, con promedio específico + general + escala |

### Triggers

- `trg_validar_calificacion` — valida rango 0–10 antes de insertar/actualizar.
- `trg_solo_un_periodo_activo` — garantiza un único periodo activo (periodo fijo).
- `trg_validar_profesor_materia` — un profesor solo califica sus materias asignadas.
- `trg_validar_matricula_calificacion` — exige matrícula previa (auto-crea el detalle).
- `trg_actualizar_promedio_matricula` — recalcula promedio/estado del detalle por materia.
- Auditoría genérica sobre `calificaciones`, `usuarios`, `matriculas`,
  `matricula_materias`, `profesor_materia_periodo`, `cursos` y `ciclos_evaluativos`
  (registra usuario de la app, operación, y datos antes/después).

## Modelo escalable (desde migración 07–09)

- **Periodo fijo:** solo un `periodos_academicos.activo = TRUE` (índice parcial +
  trigger). Todo opera sobre el activo; al activar otro, cursos/materias/promedios
  empiezan de cero porque todo filtra por periodo.
- **Cursos/paralelos** (`cursos`: nombre + paralelo + periodo + tutor).
- **Ciclos evaluativos configurables** (`ciclos_evaluativos`: nombre renombrable,
  tipo quimestre/trimestre/bimestre/semestre/otro, orden, peso) con
  **parciales de N variable** (`parciales`). Por defecto: 2 quimestres × 3 parciales.
- **Tipos de evaluación** con `categoria` (diagnóstica/formativa/sumativa),
  `es_examen` (examen quimestral = 20%), `cuenta_para_promedio` y parcial asociado.
  Mínimo **2 insumos formativos por parcial** (`fn_insumos_faltantes`).
- **Matrícula por materia** (`matricula_materias`: matrícula, materia, promedio
  calculado por trigger, estado cursando/aprobado/sin_notas).
- **Una materia en un curso/periodo = un solo profesor** (índice único +
  validación en SP y trigger; el admin puede todo).
- **Fórmula oficial Ecuador:** parcial = promedio de insumos; quimestre = 80%
  parciales + 20% examen; anual = promedio de ciclos; aprueba con 7 (escala incluida).

## Requisitos previos

- [PostgreSQL 18](https://www.postgresql.org/download/) instalado y en ejecución.
- [Node.js](https://nodejs.org/) v20 o superior.
- Git.

## Instalación y configuración

### 1. Clonar el repositorio

```bash
git clone https://github.com/MoisesPanama/sistema-calificaciones-uteq.git
cd sistema-calificaciones-uteq
```

### 2. Crear la base de datos

Conéctate a PostgreSQL y crea la base de datos:

```sql
CREATE DATABASE calificaciones_uteq;
```

### 3. Ejecutar los scripts SQL, en este orden exacto

```bash
psql -U postgres -d calificaciones_uteq -f database/01_schema.sql
psql -U postgres -d calificaciones_uteq -f database/02_functions_procedures.sql
psql -U postgres -d calificaciones_uteq -f database/03_triggers_audit.sql
psql -U postgres -d calificaciones_uteq -f database/04_roles_permissions.sql
psql -U postgres -d calificaciones_uteq -f database/05_seed_data.sql
psql -U postgres -d calificaciones_uteq -f database/06_sesiones.sql
psql -U postgres -d calificaciones_uteq -f database/07_periodo_activo_cursos_ciclos.sql
psql -U postgres -d calificaciones_uteq -f database/08_tipos_matricula_detalle.sql
psql -U postgres -d calificaciones_uteq -f database/09_funciones_formula_oficial.sql
```

> **Nota:** `04_roles_permissions.sql` crea el usuario de conexión
> `app_uteq`. Revisa el archivo y ajusta la contraseña según tu entorno
> antes de ejecutarlo.

### 3.1. Configurar el search_path a nivel de base de datos

Este paso es obligatorio y no está incluido en los scripts anteriores.
Sin él, el sistema falla con errores de "no existe la relación" al
intentar usarlo:

```bash
psql -U postgres -d calificaciones_uteq -c "ALTER DATABASE calificaciones_uteq SET search_path TO colegio, public;"
```

> **Nota:** `04_roles_permissions.sql` crea el usuario de conexión
> `app_uteq`. Revisa el archivo y ajusta la contraseña según tu entorno
> antes de ejecutarlo.

### 4. Configurar variables de entorno

```bash
cd backend
cp .env.example .env
```

Edita `.env` con tus datos reales de conexión:

```
DB_HOST=localhost
DB_PORT=5432
DB_NAME=calificaciones_uteq
DB_USER=app_uteq
DB_PASSWORD=tu_password
PORT=3000
SESSION_SECRET=una_clave_secreta_cualquiera
```

### 5. Instalar dependencias

```bash
npm install
```

### 6. Ejecutar el servidor

```bash
npm run dev
```

El sistema estará disponible en `http://localhost:3000`.

## Usuarios de prueba

| Email | Contraseña | Rol |
|-------|------------|-----|
| admin@uteq.edu.ec | admin123 | Administrador |
| carla.vera@uteq.edu.ec | profesor123 | Profesor |
| jorge.mendoza@uteq.edu.ec | profesor123 | Profesor |

## Estructura del proyecto

```
sistema-calificaciones-uteq/
├── database/
│   ├── 01_schema.sql
│   ├── 02_functions_procedures.sql
│   ├── 03_triggers_audit.sql
│   ├── 04_roles_permissions.sql
│   ├── 05_seed_data.sql
│   └── 06_sesiones.sql
└── backend/
    ├── app.js
    ├── config/
    │   └── db.js
    ├── middleware/
    │   └── auth.js
    ├── routes/
    │   ├── auth.js
    │   ├── dashboard.js
    │   ├── estudiantes.js
    │   ├── materias.js
    │   ├── periodos.js
    │   ├── calificaciones.js
    │   ├── consulta.js
    │   ├── reportes.js
    │   └── auditoria.js
    ├── views/
    └── public/
        └── css/
            └── style.css
```

## Interfaces del sistema

1. Login
2. Dashboard (resumen general)
3. Gestión de estudiantes (listado, búsqueda, crear/editar)
4. Gestión de materias
5. Gestión de periodos académicos
6. Registro de calificaciones
7. Consulta de calificaciones por estudiante
8. Reporte de promedios por periodo
9. Panel de auditoría (solo administrador)

## Notas de diseño

- El promedio/nota final **nunca se ingresa manualmente**; siempre se
  calcula mediante funciones de base de datos a partir de calificaciones
  parciales.
- La tabla `auditoria` no tiene claves foráneas hacia otras tablas de
  forma intencional, para poder auditar cambios incluso sobre registros
  que ya fueron eliminados.
- La gestión de representantes no está incluida como interfaz
  independiente en esta entrega; el modelo ya soporta múltiples
  representantes por diseño (relación uno a muchos con estudiantes).

## Licencia

Proyecto académico desarrollado para la materia Taller de Funciones,
UTEQ — 2026. Uso educativo.