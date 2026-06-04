# Tradi Burgerrr System

Sistema demo para hamburgueseria con pagina publica, panel administrador, base Supabase y bot demo/test.

## Rutas

- Web publica: `/`
- Panel administrador: `/admin`
- Bot demo/test: `/bot`
- API: `/api/*`

## Supabase

1. Crear un proyecto en Supabase.
2. Abrir SQL Editor.
3. Ejecutar `supabase/schema.sql`.
4. Ejecutar `supabase/seed.sql`.

Tablas creadas:

- `products`
- `orders`
- `order_items`
- `settings`
- `bot_sessions`

## Hosting recomendado

Para produccion no conviene depender de un plan gratis con corte duro. Netlify Free puede pausar el sitio cuando llega al limite mensual, dejando tambien sin funcionar `/admin` y el webhook de WhatsApp.

Opciones:

- Rapido: pasar a Netlify pago y activar auto recharge para que no pause el sitio.
- Recomendado para este proyecto: desplegar tambien en Vercel o Cloudflare Workers/Pages con plan pago bajo y monitoreo.
- Mas robusto: VPS propio con Node + Supabase si el comercio ya maneja muchos pedidos y quiere costo fijo.

El proyecto queda compatible con Netlify y Vercel. En cualquier hosting, configurar las mismas variables de entorno.

## Variables de entorno

Configurar:

```txt
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
ADMIN_PASSWORD=una-clave-segura
WHATSAPP_VERIFY_TOKEN=un-token-privado-para-validar-webhook
WHATSAPP_ACCESS_TOKEN=token-de-meta-cloud-api
WHATSAPP_PHONE_NUMBER_ID=id-del-numero-de-whatsapp-en-meta
WHATSAPP_GRAPH_VERSION=v24.0
WHATSAPP_ADMIN_NUMBERS=5491162588633
WHATSAPP_LOCAL_NOTIFY_NUMBER=5491162588633
```

No poner `SUPABASE_SERVICE_ROLE_KEY` en frontend. Solo se usa en funciones serverless.
Tampoco exponer `WHATSAPP_ACCESS_TOKEN`: solo se usa en funciones serverless.

## Desarrollo local

Sin Supabase configurado, la app usa `data/menu-sample.json` como modo demo local. Esto permite probar el flujo y mostrar el sistema, pero produccion debe usar Supabase.

Con Netlify CLI:

```bash
npm install
npm run dev
```

## Prueba de fuente unica

1. Entrar a `/admin`.
2. Editar el precio de un producto.
3. Guardar.
4. Volver a `/` y recargar.
5. Abrir `/bot` o el bot de pedido de la web.

El precio actualizado sale de la misma fuente de datos.

## Endpoints de prueba

- `GET /api/products`: productos activos desde Supabase.
- `GET /api/orders`: pedidos, requiere header `x-admin-password`.
- `GET /api/bot/demo`: inicia una sesion demo del bot.
- `POST /api/bot/demo`: avanza conversacion demo del bot.
- `GET /api/whatsapp/webhook`: verificacion de webhook para Meta WhatsApp Cloud API.
- `POST /api/whatsapp/webhook`: recibe mensajes reales de WhatsApp.
- `POST /api/whatsapp/test`: prueba el mismo bot en modo WhatsApp sin enviar mensajes reales, requiere `x-admin-password`.

## WhatsApp Cloud API

El bot de WhatsApp usa el mismo motor que `/bot` y la misma base de datos Supabase:

- Lee productos activos desde `products`.
- Guarda pedidos en `orders` y `order_items`.
- Mantiene conversaciones por telefono en `bot_sessions`.
- Si un producto se desactiva desde `/admin`, deja de aparecer en la web y en WhatsApp.

Webhook para configurar en Meta:

```txt
https://TU-DOMINIO/api/whatsapp/webhook
```

El `Verify token` debe ser el mismo valor que `WHATSAPP_VERIFY_TOKEN` en Netlify.

Comandos internos de stock, solo para telefonos incluidos en `WHATSAPP_ADMIN_NUMBERS`:

```txt
sin stock chesse simple
desactivar coca 1.75
activar chesse simple
con stock nuggets
```

Esto cambia `is_active` del producto en Supabase, por lo que impacta automaticamente en web publica, panel admin y bot.

El bot tambien detecta mensajes de reclamo o problema en WhatsApp y notifica al local si `WHATSAPP_LOCAL_NOTIFY_NUMBER` esta configurado.

## Deploy

Publicar esta carpeta en Netlify. El sitio no necesita build; Netlify sirve archivos estaticos y funciones.

Build command: vacio.
Publish directory: `.`
Functions directory: `netlify/functions`.
