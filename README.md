# Bengala Max — Telegram Bot de Imágenes

Bot de Telegram para cargar imágenes de productos al backend de Bengala Max.

## Flujo de uso

1. Enviar el código SKU del producto (o usar `/producto SKU`)
2. El bot busca el producto y muestra la info
3. Enviar las fotos (comprimidas o como archivo)
4. Usar `/listo` cuando se termine

La primera imagen se marca automáticamente como **principal**. Las siguientes se agregan con orden incremental.

## Setup

### 1. Crear el bot en Telegram

1. Abrir [@BotFather](https://t.me/BotFather) en Telegram
2. Enviar `/newbot`
3. Elegir nombre: `Bengala Max Imágenes` (o similar)
4. Elegir username: `bengalamax_images_bot` (o similar)
5. Copiar el token que te da BotFather

### 2. Obtener tu User ID de Telegram

1. Abrir [@userinfobot](https://t.me/userinfobot) en Telegram
2. Enviar `/start`
3. Copiar tu ID numérico

### 3. Configurar el bot

```bash
cd telegram-bot
cp .env.example .env
```

Editar `.env`:

```env
TELEGRAM_BOT_TOKEN=123456:ABC-DEF...        # Token de BotFather
ALLOWED_USER_IDS=123456789                    # Tu ID (o varios separados por coma)
API_URL=http://localhost:3000/api             # URL del backend
ADMIN_EMAIL=admin@bengalamax.uy              # Email admin del backend
ADMIN_PASSWORD=admin123                       # Password admin
```

### 4. Instalar dependencias y correr

```bash
npm install
npm run dev
```

Para producción:

```bash
npm run build
npm start
```

## Comandos del Bot

| Comando      | Descripción                                    |
| ------------ | ---------------------------------------------- |
| `/start`     | Bienvenida y ayuda                             |
| `/producto`  | Seleccionar producto por código SKU            |
| `/estado`    | Ver producto actual y cantidad de imágenes     |
| `/listo`     | Finalizar carga de imágenes del producto       |
| `/cancelar`  | Cancelar y deseleccionar producto              |
| `/ayuda`     | Mostrar ayuda                                  |

## Cómo funciona internamente

```
[Telegram] → Bot descarga foto → POST /api/upload/image (backend)
                                        ↓
                              Devuelve URL de imagen
                                        ↓
                              POST /api/products/:id/images
                              (asocia imagen al producto)
```

1. El bot se autentica como admin en el backend (`POST /api/auth/login`)
2. Cuando recibe un SKU, busca el producto (`GET /api/products/by-sku/:sku`)
3. Por cada foto recibida:
   - Descarga el archivo de los servidores de Telegram
   - Lo sube al backend (`POST /api/upload/image`)
   - Crea el registro `ProductImage` asociándolo al producto (`POST /api/products/:id/images`)

## Seguridad

- Solo los Telegram User IDs en `ALLOWED_USER_IDS` pueden usar el bot
- El bot se autentica como admin y maneja refresh de tokens automáticamente
- Las imágenes se procesan en el backend (resize, conversión a WebP)

## Endpoints del Backend (agregados)

El backend se modificó para agregar estos endpoints:

| Método   | Ruta                              | Descripción                           |
| -------- | --------------------------------- | ------------------------------------- |
| `GET`    | `/api/products/by-sku/:sku`       | Buscar producto por SKU (admin)       |
| `POST`   | `/api/products/:id/images`        | Agregar imagen a producto (admin)     |
| `PATCH`  | `/api/products/:id/images/:imgId` | Actualizar imagen (admin)             |
| `DELETE` | `/api/products/:id/images/:imgId` | Eliminar imagen (admin)               |
