# v120 — acceso por invitación e identidad anónima

## Resultado

Hanami deja de depender del correo integrado de Supabase para entrar en los
grupos de lectura.

La nueva entrada:

1. solicita un código privado y un nombre visible;
2. crea una identidad anónima de Supabase ligada al navegador;
3. consume una invitación válida de forma atómica;
4. añade al lector a la sala;
5. abre la sala mediante la máquina de estados central.

No se solicita correo ni contraseña.

## Invitaciones

La administración de una sala remota dispone de una subpantalla para:

- generar códigos de un solo uso;
- copiarlos cuando se crean;
- consultar terminación, caducidad y usos;
- revocar códigos activos.

Los códigos completos nunca se almacenan. Supabase conserva únicamente un
hash SHA-256 normalizado y los cuatro últimos caracteres como referencia.
Cada código creado por la interfaz caduca a los siete días y admite un uso.

El antiguo `reading_groups.invite_code` se conserva para compatibilidad de
datos, pero `join_reading_group(text)` pierde sus permisos públicos y deja de
ser una vía de acceso.

## Primera sala

Si el navegador todavía no tiene identidad, **Crear grupo** abre una
subpantalla que crea simultáneamente:

- la identidad anónima del propietario;
- su perfil visible;
- la primera sala remota.

## Persistencia y advertencia

La sesión anónima se conserva en el navegador mediante el mecanismo de sesión
existente. Borrar los datos de Hanami o usar **Olvidar** impide recuperar esa
identidad en esta versión. La interfaz lo advierte antes de cerrar sesión.

## Supabase

Después de los scripts de v117 y v118 debe ejecutarse:

```text
supabase/hanami-invite-access-v120.sql
```

También debe habilitarse:

```text
Authentication → Providers → Anonymous Sign-Ins
```

La migración crea `reading_group_invites` y las RPC:

- `create_reading_group_invite`;
- `list_reading_group_invites`;
- `revoke_reading_group_invite`;
- `redeem_reading_group_invite`.

## Navegación

Las nuevas superficies se integran con `HanamiScreens`:

- `reading-group-access`;
- `reading-group-invites`.

Tras consumir una invitación, la pantalla de acceso se reemplaza por
`reading-group`, evitando historiales paralelos.

## Entrega

- Versión: `5.8.53`
- Caché: `hanami-invite-only-anonymous-v120`
- Regresión: `tests/invite-only-anonymous-access-v120.test.mjs`
- Prueba móvil: `tests/invite-only-anonymous-mobile-v120.e2e.mjs`
- Viewport: 390 × 844