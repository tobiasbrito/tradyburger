# Tradi Burgerrr System

Sistema demo para hamburgueseria con pagina publica, panel administrador, base Supabase y bot demo/test.

## Rutas

- Web publica: `/`
- Panel administrador: `/admin`
- Bot demo/test: `/bot`
- API Netlify: `/api/*`

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

## Variables de entorno en Netlify

Configurar:

```txt
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
ADMIN_PASSWORD=una-clave-segura
```

No poner `SUPABASE_SERVICE_ROLE_KEY` en frontend. Solo se usa en Netlify Functions.

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

## Deploy

Publicar esta carpeta en Netlify. El sitio no necesita build; Netlify sirve archivos estaticos y funciones.

Build command: vacio.
Publish directory: `.`
Functions directory: `netlify/functions`.
