---
name: sync-migration
description: Estrategia de sincronización offline→online — dirty flag, orden de push, marcado post-sync, cobros sin remote_id, ausencia de pull y de idempotencia.
metadata:
  type: project
---

## Mecanismo actual
- Patrón dirty flag en SQLite: dirty=1 = pendiente de sync
- Push-only (no pull implementado): solo se envían datos locales al servidor
- Orden: productos → clientes → ventas → cobros (dependencias respetadas)
- Respuesta del servidor: { results: [{ local_id, remote_id, status }] }
- Tras respuesta exitosa: UPDATE tabla SET remote_id=?, dirty=0

## Función principal
sincronizarPendientesConPulse(accessToken) en src/api/pulseSync.ts
Retorna PulseSyncSummary: { productos, clientes, ventas, cobros, cobrosOmitidosSinClienteRemoto }

## initDb() en db.ts: marca dirty=1 a todos los registros sin remote_id en cada arranque
Esto garantiza que datos legacy (antes del backend) quedan pendientes de sync.

## Problemas conocidos
- Sin idempotencia client-side: no hay mutation_id ni Idempotency-Key header
- Sin pull: el cliente nunca descarga datos del servidor
- Sin reintentos automáticos: si falla a mitad del proceso, solo se marcan como sincronizados los que respondieron OK
- Sin transacción lógica: productos y clientes pueden sincronizarse pero ventas fallar; queda estado inconsistente
- Cobros sin remote_id del cliente se omiten silenciosamente (solo se reportan en el summary)
- Sin cola persistente de reintentos
- Sin manejo de conflictos: last-write-wins implícito con client_updated_at
