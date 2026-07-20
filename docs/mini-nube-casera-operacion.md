# Mini nube casera FactuDarwin

Este documento deja el backend local funcionando como servidor temporal mientras el proyecto consigue ingresos para migrar a un VPS.

La idea es:

```text
api.factudarwin.com -> Cloudflare Tunnel -> PC local -> backend Node.js -> PostgreSQL local
```

No es la arquitectura final para produccion masiva, pero sirve para pilotos controlados si se cuida con backups y monitoreo.

## Objetivo

- No depender de abrir VS Code.
- Levantar backend al iniciar Windows.
- Levantar Cloudflare Tunnel al iniciar Windows.
- Revisar que `/health` responda cada pocos minutos.
- Ejecutar backup PostgreSQL diario.
- Tener logs para saber que fallo.

## Scripts creados

```text
scripts/start-backend-on-login.ps1
scripts/register-backend-startup-task.ps1
scripts/run-backend-health-check.ps1
scripts/run-postgres-backup.ps1
scripts/register-home-server-tasks.ps1
scripts/start-cloudflare-tunnel.ps1
scripts/register-cloudflare-tunnel-task.ps1
```

## 1. Verificar que PostgreSQL arranque solo

Abrir `Servicios` de Windows y revisar que el servicio PostgreSQL este en:

```text
Tipo de inicio: Automatico
Estado: En ejecucion
```

Si PostgreSQL no esta levantado, el backend puede iniciar pero la app no trabajara bien.

## 2. Registrar backend, monitor y backup

Abrir PowerShell como administrador:

```powershell
cd C:\app
powershell -ExecutionPolicy Bypass -File scripts\register-home-server-tasks.ps1
```

Esto crea:

```text
FactuDarwin Backend
FactuDarwin Backend Health Watch
FactuDarwin PostgreSQL Backup
```

## 3. Probar backend

```powershell
schtasks /Run /TN "FactuDarwin Backend"
curl.exe http://localhost:4000/health
```

Debe responder con:

```json
{"ok":true}
```

## 4. Registrar Cloudflare Tunnel

Primero confirmar el nombre real del tunnel. Si el tunnel se llama distinto a `FactuDarwin-API`, configurar variable de entorno o editar:

```text
scripts/start-cloudflare-tunnel.ps1
```

Linea:

```powershell
$tunnelName = "FactuDarwin-API"
```

Luego registrar tarea:

```powershell
cd C:\app
powershell -ExecutionPolicy Bypass -File scripts\register-cloudflare-tunnel-task.ps1
```

Probar:

```powershell
schtasks /Run /TN "FactuDarwin Cloudflare Tunnel"
curl.exe https://api.factudarwin.com/health
```

Debe responder `ok:true`.

## 5. Backup diario

La tarea `FactuDarwin PostgreSQL Backup` corre todos los dias a las `23:30`.

Probar manual:

```powershell
schtasks /Run /TN "FactuDarwin PostgreSQL Backup"
```

Los backups quedan segun la configuracion del backend:

```text
C:\app\backend\backups\postgres
```

Logs:

```text
C:\app\backend\logs\backup-postgres.log
```

## 6. Monitor de salud

La tarea `FactuDarwin Backend Health Watch` revisa:

```text
http://127.0.0.1:4000/health
```

Cada 5 minutos. Si falla, solicita reiniciar la tarea del backend.

Logs:

```text
C:\app\backend\logs\backend-health-watch.log
```

## 7. Logs importantes

```text
C:\app\backend\logs\backend-autostart.log
C:\app\backend\logs\backend-autostart.out.log
C:\app\backend\logs\backend-autostart.err.log
C:\app\backend\logs\cloudflared-autostart.log
C:\app\backend\logs\cloudflared.out.log
C:\app\backend\logs\cloudflared.err.log
C:\app\backend\logs\backup-postgres.log
C:\app\backend\logs\backend-health-watch.log
```

## 8. Prueba despues de reiniciar Windows

Despues de reiniciar:

```powershell
curl.exe http://localhost:4000/health
curl.exe https://api.factudarwin.com/health
```

Si ambas responden `ok:true`, la mini nube esta operativa.

## 9. Si el dominio no responde

Revisar en orden:

1. Internet de casa.
2. PostgreSQL en servicios de Windows.
3. Backend local:

```powershell
curl.exe http://localhost:4000/health
```

4. Cloudflare Tunnel:

```powershell
schtasks /Run /TN "FactuDarwin Cloudflare Tunnel"
```

5. Dominio publico:

```powershell
curl.exe https://api.factudarwin.com/health
```

## 10. Reglas de uso temporal

- No apagar la PC si hay testers activos.
- No cerrar sesion de Windows si las tareas estan configuradas solo `ONLOGON`.
- No borrar cache de PWA si hay documentos pendientes.
- No vender esto como infraestructura definitiva.
- Revisar backup diario.
- Copiar backups importantes a otro disco o nube.

## 11. Cuando lleguen ingresos

Migrar a:

```text
VPS -> backend Node.js -> PostgreSQL -> backups externos
```

Y mantener `api.factudarwin.com` apuntando al nuevo servidor.
