-- =========================================================
-- 12_fix_permisos_hashes.sql
-- Aplicar DESPUES de todos los scripts anteriores.
-- Corregir permisos de app_uteq y passwords de usuarios nuevos.
-- =========================================================

-- 1. Permisos completos para app_uteq (necesario para triggers
--    que escriben en matricula_materias, sesiones, etc.)
--    DEPRECADO (Plan v2 Fase 1): el GRANT ALL era un atajo que
--    contradice el diseno de roles. La migracion 13_permisos_minimos.sql
--    lo revierte y otorga privilegios minimos tabla por tabla.
--    Se deja este bloque intacto solo por historial; en instalaciones
--    nuevas aplicar la 13 despues de esta.
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA colegio TO app_uteq;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA colegio TO app_uteq;

-- 2. Passwords correctas para usuarios nuevos (UTEQ2026)
--    NOTA (Plan v2 Fase 1): para instalaciones nuevas, preferir
--    `npm run seed:test-users` (backend/scripts/seed-test-users.js),
--    que genera el hash desde TEST_USER_PASSWORD en vez de
--    commitear un hash fijo. Este UPDATE se conserva por
--    compatibilidad con BDs que ya corrieron las migraciones 10/11.
--    El hash anterior era invalido. Estos hashes se generaron con bcrypt 10.
--    Si cambias la contrasena, genera un nuevo hash con:
--    node -e "require('bcrypt').hash('NUEVA_PASS',10).then(h=>console.log(h))"
-- Hash verificado con bcrypt 10 para password "UTEQ2026"
UPDATE colegio.usuarios SET password_hash = '$2b$10$aN3On1M0roKSvyfVx5NaauXYJJ3AB0pczwU7mGQGty1S6K9EEKrbC' WHERE id_usuario IN (1, 4, 5, 6, 7, 8);
