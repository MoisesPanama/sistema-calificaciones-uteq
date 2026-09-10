-- =========================================================
-- 13_permisos_minimos.sql — Plan v2 Fase 1 (seguridad)
-- Aplicar DESPUES de todos los scripts anteriores, UNA vez:
--   psql -h localhost -U postgres -d calificaciones_uteq -f database/13_permisos_minimos.sql
-- (requiere superusuario porque hace REVOKE/GRANT sobre roles).
--
-- PROBLEMA QUE CORRIGE: la app se conecta con UNA sola credencial
-- (app_uteq) que, por acumulacion de atajos, termino con poder
-- total sobre el esquema:
--   - 04_roles_permissions.sql le otorgo el rol rol_admin completo,
--   - fix_tables.sql le dio CREATE ON SCHEMA + GRANT ALL,
--   - 12_fix_permisos_hashes.sql repitio GRANT ALL.
-- Con eso, la separacion de roles (rol_lectura/profesor/admin) solo
-- existia en el papel: toda la seguridad dependia del codigo JS.
--
-- SOLUCION: quitarle el poder total y otorgar, tabla por tabla,
-- exactamente lo que el backend necesita (minimo privilegio).
-- Cada GRANT lleva su "por que" en comentarios. Si un flujo nuevo
-- falla con "permission denied", se agrega el GRANT especifico
-- que falte: NUNCA se vuelve a GRANT ALL como atajo.
-- =========================================================

SET search_path TO colegio;

-- ---------------------------------------------------------
-- 1. QUITAR EL PODER TOTAL (orden importa: primero revocar,
--    despues otorgar lo minimo).
-- ---------------------------------------------------------
-- 1a. app_uteq era miembro de rol_admin (= ALL PRIVILEGES en
--     todo el esquema via 04). Sin este REVOKE, todo lo demas
--     no sirve de nada. Bloque DO para que sea re-ejecutable
--     (REVOKE de una membresia inexistente daria error).
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_auth_members m
        JOIN pg_roles r ON r.oid = m.roleid
        JOIN pg_roles u ON u.oid = m.member
        WHERE r.rolname = 'rol_admin' AND u.rolname = 'app_uteq'
    ) THEN
        REVOKE rol_admin FROM app_uteq;
    END IF;
END $$;

-- 1b. Revocar los GRANT ALL directos de fix_tables.sql y 12.
REVOKE ALL ON ALL TABLES IN SCHEMA colegio FROM app_uteq;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA colegio FROM app_uteq;

-- 1c. El backend nunca ejecuta DDL en produccion (las
--     migraciones las corre un superusuario a mano), asi que
--     no necesita CREATE sobre el esquema.
REVOKE CREATE ON SCHEMA colegio FROM app_uteq;

-- El USAGE sobre el esquema si lo necesita (para calificar
-- los nombres colegio.tabla en cada query).
GRANT USAGE ON SCHEMA colegio TO app_uteq;

-- ---------------------------------------------------------
-- 2. TABLAS OPERATIVAS: SELECT, INSERT, UPDATE (sin DELETE).
--    El backend crea/edita estos registros desde la UI;
--    ningun flujo de la app borra filas de negocio
--    (los "borrados" son logicos o simplemente no existen).
-- ---------------------------------------------------------
-- Calificaciones: la escribe el profesor (lote e individual)
-- y la lee consulta/reportes/psicologo.
GRANT SELECT, INSERT, UPDATE ON calificaciones TO app_uteq;

-- Matriculas: la app matricula estudiantes por periodo y la
-- lee en calificaciones/consulta/reportes.
GRANT SELECT, INSERT, UPDATE ON matriculas TO app_uteq;

-- Detalle matricula-materia (promedios por materia): lo escribe
-- el trigger fn_actualizar_promedio_matricula, que corre SIN
-- SECURITY DEFINER, o sea con los privilegios del invocante
-- (app_uteq). Sin este GRANT, registrar una nota falla.
GRANT SELECT, INSERT, UPDATE ON matricula_materias TO app_uteq;

-- Estudiantes / representantes / profesores: CRUD basico
-- desde el panel (estudiantes.js) + lecturas por rol.
GRANT SELECT, INSERT, UPDATE ON estudiantes TO app_uteq;
GRANT SELECT, INSERT, UPDATE ON representantes TO app_uteq;
GRANT SELECT, INSERT, UPDATE ON profesores TO app_uteq;

-- Maestros de datos (Fase 5 les dara CRUD admin en la UI):
-- materias, periodos, cursos, ciclos, parciales, tipos y la
-- asignacion profesor-materia-periodo.
GRANT SELECT, INSERT, UPDATE ON materias TO app_uteq;
GRANT SELECT, INSERT, UPDATE ON periodos_academicos TO app_uteq;
GRANT SELECT, INSERT, UPDATE ON cursos TO app_uteq;
GRANT SELECT, INSERT, UPDATE ON ciclos_evaluativos TO app_uteq;
GRANT SELECT, INSERT, UPDATE ON parciales TO app_uteq;
GRANT SELECT, INSERT, UPDATE ON tipos_evaluacion TO app_uteq;
GRANT SELECT, INSERT, UPDATE ON profesor_materia_periodo TO app_uteq;

-- Usuarios: SELECT para el login (join con roles) + INSERT y
-- UPDATE para los scripts de seed (seed-passwords.js y
-- seed-test-users.js actualizan password_hash) y futura
-- gestion de usuarios. Sin DELETE: un usuario nunca se borra,
-- se desactiva (columna activo).
GRANT SELECT, INSERT, UPDATE ON usuarios TO app_uteq;

-- Roles: solo lectura (ningun flujo crea roles).
GRANT SELECT ON roles TO app_uteq;

-- ---------------------------------------------------------
-- 3. AUDITORIA: append-only incluso para la propia app.
--    SELECT para el panel del admin, INSERT para los triggers.
--    JAMAS UPDATE ni DELETE: si una fila de auditoria necesita
--    "corregirse", eso ya es sospechoso y debe investigarse.
-- ---------------------------------------------------------
GRANT SELECT, INSERT ON auditoria TO app_uteq;

-- ---------------------------------------------------------
-- 4. SESIONES: la gestiona connect-pg-simple, que necesita
--    SELECT/INSERT/UPDATE/DELETE (limpia sesiones expiradas).
--    Se listan explicitos (no ALL) para no otorgar de paso
--    TRUNCATE/TRIGGER, que la app jamas usa.
-- ---------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON sesiones TO app_uteq;

-- ---------------------------------------------------------
-- 5. SECUENCIAS: USAGE + SELECT en TODAS.
--    Sin esto, cualquier INSERT en una tabla con SERIAL falla
--    con "permission denied for sequence ..." (esta fue la
--    causa mas probable del error original que motivo el
--    GRANT ALL como atajo). Las secuencias solo generan
--    numeros, no exponen datos: otorgarlas en bloque es seguro.
-- ---------------------------------------------------------
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA colegio TO app_uteq;

-- ---------------------------------------------------------
-- 6. RUTINAS: EXECUTE en funciones y procedimientos.
--    El backend invoca CALL sp_registrar_calificacion(...) y
--    SELECT fn_promedio_*, fn_escala_cualitativa(...),
--    fn_insumos_faltantes(...). Sin EXECUTE, todo el flujo de
--    notas falla tras el REVOKE del punto 1.
-- ---------------------------------------------------------
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA colegio TO app_uteq;
GRANT EXECUTE ON ALL PROCEDURES IN SCHEMA colegio TO app_uteq;

-- Que las funciones/procedimientos que se creen a futuro
-- (el dueno habitual de los objetos es app_uteq o postgres
-- segun quien corra las migraciones) tambien queden usables:
ALTER DEFAULT PRIVILEGES FOR ROLE app_uteq IN SCHEMA colegio
    GRANT EXECUTE ON FUNCTIONS TO app_uteq;
ALTER DEFAULT PRIVILEGES FOR ROLE app_uteq IN SCHEMA colegio
    GRANT EXECUTE ON PROCEDURES TO app_uteq;
-- NOTA: si las migraciones futuras se corren como 'postgres',
-- repetir esas dos lineas con FOR ROLE postgres, o re-ejecutar
-- la seccion 6 de este archivo.

-- ---------------------------------------------------------
-- 7. LO QUE DELIBERADAMENTE NO SE OTORGA (documentado para
--    que nadie lo "arregle" por accidente):
--    - DELETE en tablas de negocio y auditoria.
--    - TRUNCATE / DROP / CREATE / ALTER (solo superusuario).
--    - GRANT ALL en bloque (el atajo que origino este archivo).
-- ---------------------------------------------------------

-- Verificacion rapida (ejecutar como app_uteq deberia mostrar
-- solo los privilegios de arriba, sin ALL ni rol_admin):
--   SELECT grantee, privilege_type, table_name
--   FROM information_schema.role_table_grants
--   WHERE grantee = 'app_uteq' AND table_schema = 'colegio'
--   ORDER BY table_name, privilege_type;
