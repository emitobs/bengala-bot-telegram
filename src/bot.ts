import { Telegraf, Context } from 'telegraf';
import { message } from 'telegraf/filters';
import { config } from './config';
import { ApiClient, Product } from './api-client';
import axios from 'axios';

/** Per-user session state for the conversational flow */
interface UserSession {
  /** The product currently being edited */
  product: Product | null;
  /** How many images have been uploaded in this session */
  uploadedCount: number;
  /** Waiting for product code input? */
  awaitingSku: boolean;
}

export class BengalaBot {
  private bot: Telegraf;
  private api: ApiClient;
  private sessions: Map<number, UserSession> = new Map();

  constructor() {
    this.bot = new Telegraf(config.telegramToken);
    this.api = new ApiClient();
    this.setupHandlers();
  }

  private getSession(userId: number): UserSession {
    if (!this.sessions.has(userId)) {
      this.sessions.set(userId, { product: null, uploadedCount: 0, awaitingSku: false });
    }
    return this.sessions.get(userId)!;
  }

  private resetSession(userId: number): void {
    this.sessions.set(userId, { product: null, uploadedCount: 0, awaitingSku: false });
  }

  private isAuthorized(userId: number): boolean {
    if (config.allowedUserIds.length === 0) return true;
    return config.allowedUserIds.includes(userId);
  }

  private setupHandlers(): void {
    // ---- Authorization middleware ----
    this.bot.use(async (ctx, next) => {
      const userId = ctx.from?.id;
      if (!userId || !this.isAuthorized(userId)) {
        await ctx.reply('⛔ No tienes autorización para usar este bot.');
        return;
      }
      return next();
    });

    // ---- Commands ----
    this.bot.command('start', (ctx) => this.handleStart(ctx));
    this.bot.command('producto', (ctx) => this.handleProductoCommand(ctx));
    this.bot.command('estado', (ctx) => this.handleEstado(ctx));
    this.bot.command('listo', (ctx) => this.handleListo(ctx));
    this.bot.command('cancelar', (ctx) => this.handleCancelar(ctx));
    this.bot.command('ayuda', (ctx) => this.handleAyuda(ctx));

    // ---- Photo handler ----
    this.bot.on(message('photo'), (ctx) => this.handlePhoto(ctx));

    // ---- Document handler (for uncompressed images) ----
    this.bot.on(message('document'), (ctx) => this.handleDocument(ctx));

    // ---- Text handler (for SKU input) ----
    this.bot.on(message('text'), (ctx) => this.handleText(ctx));
  }

  // =================== Command handlers ===================

  private async handleStart(ctx: Context): Promise<void> {
    await ctx.reply(
      `🛍️ *Bengala Max — Bot de Imágenes*\n\n` +
        `Este bot te permite cargar imágenes para los productos.\n\n` +
        `*¿Cómo se usa?*\n` +
        `1️⃣  Enviá /producto o escribí el código SKU del producto\n` +
        `2️⃣  Mandá las fotos (una o varias)\n` +
        `3️⃣  Enviá /listo cuando termines\n\n` +
        `*Comandos:*\n` +
        `/producto — Seleccionar producto por código\n` +
        `/estado — Ver estado actual\n` +
        `/listo — Finalizar carga de imágenes\n` +
        `/cancelar — Cancelar operación actual\n` +
        `/ayuda — Ver esta ayuda`,
      { parse_mode: 'Markdown' },
    );
  }

  private async handleAyuda(ctx: Context): Promise<void> {
    await this.handleStart(ctx);
  }

  private async handleProductoCommand(ctx: Context): Promise<void> {
    const userId = ctx.from!.id;
    const session = this.getSession(userId);

    // Check if there's text after the command: /producto SKU123
    const text = (ctx.message as any)?.text || '';
    const parts = text.split(/\s+/);
    const sku = parts[1];

    if (sku) {
      await this.lookupProduct(ctx, userId, session, sku);
    } else {
      session.awaitingSku = true;
      await ctx.reply('📝 Escribí el código (SKU) del producto:');
    }
  }

  private async handleEstado(ctx: Context): Promise<void> {
    const userId = ctx.from!.id;
    const session = this.getSession(userId);

    if (!session.product) {
      await ctx.reply('ℹ️ No hay ningún producto seleccionado.\nUsá /producto para comenzar.');
      return;
    }

    const p = session.product;
    const totalImages = p.images.length + session.uploadedCount;

    await ctx.reply(
      `📦 *Producto actual:*\n` +
        `• Nombre: ${escapeMarkdown(p.name)}\n` +
        `• SKU: \`${p.sku}\`\n` +
        `• Precio: $${p.basePrice}\n` +
        `• Imágenes previas: ${p.images.length}\n` +
        `• Imágenes subidas ahora: ${session.uploadedCount}\n` +
        `• Total imágenes: ${totalImages}\n\n` +
        `📸 Enviá fotos para agregar más, o /listo para terminar.`,
      { parse_mode: 'Markdown' },
    );
  }

  private async handleListo(ctx: Context): Promise<void> {
    const userId = ctx.from!.id;
    const session = this.getSession(userId);

    if (!session.product) {
      await ctx.reply('ℹ️ No hay ningún producto seleccionado.');
      return;
    }

    if (session.uploadedCount === 0) {
      await ctx.reply('⚠️ No se subió ninguna imagen. Enviá fotos o usá /cancelar.');
      return;
    }

    await ctx.reply(
      `✅ *¡Listo!*\n\n` +
        `Se cargaron *${session.uploadedCount} imagen(es)* para:\n` +
        `📦 *${escapeMarkdown(session.product.name)}* (${session.product.sku})\n\n` +
        `Podés seleccionar otro producto con /producto.`,
      { parse_mode: 'Markdown' },
    );

    this.resetSession(userId);
  }

  private async handleCancelar(ctx: Context): Promise<void> {
    const userId = ctx.from!.id;
    this.resetSession(userId);
    await ctx.reply('❌ Operación cancelada. Usá /producto para empezar de nuevo.');
  }

  // =================== Message handlers ===================

  private async handleText(ctx: Context): Promise<void> {
    const userId = ctx.from!.id;
    const session = this.getSession(userId);
    const text = ((ctx.message as any)?.text || '').trim();

    if (!text) return;

    // If awaiting SKU input, or no product selected, treat text as SKU
    if (session.awaitingSku || !session.product) {
      session.awaitingSku = false;
      await this.lookupProduct(ctx, userId, session, text);
      return;
    }

    // If product is selected but user sends text, give hint
    await ctx.reply(
      '📸 Enviá las fotos del producto, o usá:\n' +
        '/listo — terminar\n' +
        '/cancelar — cancelar\n' +
        '/producto — cambiar de producto',
    );
  }

  private async handlePhoto(ctx: Context): Promise<void> {
    const userId = ctx.from!.id;
    const session = this.getSession(userId);

    if (!session.product) {
      await ctx.reply('⚠️ Primero seleccioná un producto con /producto o escribiendo el código SKU.');
      return;
    }

    try {
      // Get the highest resolution photo
      const photos = (ctx.message as any).photo;
      const photo = photos[photos.length - 1];
      const fileId = photo.file_id;

      await ctx.reply('⏳ Subiendo imagen...');

      // Download the photo from Telegram
      const fileLink = await ctx.telegram.getFileLink(fileId);
      const response = await axios.get(fileLink.href, { responseType: 'arraybuffer' });
      const buffer = Buffer.from(response.data);

      // Upload to backend
      const uploadResult = await this.api.uploadImage(buffer, `product-${session.product.sku}-${Date.now()}.jpg`);

      // Associate with product (first image = primary)
      const isPrimary = session.product.images.length === 0 && session.uploadedCount === 0;
      await this.api.addImageToProduct(session.product.id, uploadResult.original, {
        altText: session.product.name,
        isPrimary,
      });

      session.uploadedCount++;

      const emoji = isPrimary ? '⭐' : '✅';
      await ctx.reply(
        `${emoji} Imagen ${session.uploadedCount} subida${isPrimary ? ' (principal)' : ''}.\n` +
          `📸 Enviá más fotos o /listo para terminar.`,
      );
    } catch (error: any) {
      console.error('Error uploading photo:', error?.response?.data || error.message);
      await ctx.reply(`❌ Error al subir la imagen: ${error?.response?.data?.message || error.message}`);
    }
  }

  private async handleDocument(ctx: Context): Promise<void> {
    const userId = ctx.from!.id;
    const session = this.getSession(userId);

    if (!session.product) {
      await ctx.reply('⚠️ Primero seleccioná un producto con /producto o escribiendo el código SKU.');
      return;
    }

    const doc = (ctx.message as any).document;
    if (!doc || !doc.mime_type?.startsWith('image/')) {
      await ctx.reply('⚠️ Solo se aceptan archivos de imagen (JPG, PNG, WebP…)');
      return;
    }

    try {
      await ctx.reply('⏳ Subiendo imagen...');

      const fileLink = await ctx.telegram.getFileLink(doc.file_id);
      const response = await axios.get(fileLink.href, { responseType: 'arraybuffer' });
      const buffer = Buffer.from(response.data);

      const uploadResult = await this.api.uploadImage(buffer, doc.file_name || `product-${Date.now()}.jpg`);

      const isPrimary = session.product.images.length === 0 && session.uploadedCount === 0;
      await this.api.addImageToProduct(session.product.id, uploadResult.original, {
        altText: session.product.name,
        isPrimary,
      });

      session.uploadedCount++;

      const emoji = isPrimary ? '⭐' : '✅';
      await ctx.reply(
        `${emoji} Imagen ${session.uploadedCount} subida${isPrimary ? ' (principal)' : ''}.\n` +
          `📸 Enviá más fotos o /listo para terminar.`,
      );
    } catch (error: any) {
      console.error('Error uploading document:', error?.response?.data || error.message);
      await ctx.reply(`❌ Error al subir la imagen: ${error?.response?.data?.message || error.message}`);
    }
  }

  // =================== Helpers ===================

  private async lookupProduct(ctx: Context, userId: number, session: UserSession, sku: string): Promise<void> {
    try {
      await ctx.reply(`🔍 Buscando producto *${escapeMarkdown(sku)}*...`, { parse_mode: 'Markdown' });

      const product = await this.api.findProductBySku(sku.toUpperCase());

      session.product = product;
      session.uploadedCount = 0;
      session.awaitingSku = false;

      const categories = product.categories.map((c) => c.name).join(', ') || 'Sin categoría';

      await ctx.reply(
        `✅ *Producto encontrado:*\n\n` +
          `📦 *${escapeMarkdown(product.name)}*\n` +
          `🏷️ SKU: \`${product.sku}\`\n` +
          `💰 Precio: $${product.basePrice}\n` +
          `📁 Categorías: ${escapeMarkdown(categories)}\n` +
          `🖼️ Imágenes actuales: ${product.images.length}\n` +
          `📊 Estado: ${product.isActive ? '✅ Activo' : '❌ Inactivo'}\n\n` +
          `📸 *Ahora enviá las fotos del producto.*\n` +
          `Podés enviar varias a la vez.`,
        { parse_mode: 'Markdown' },
      );
    } catch (error: any) {
      const status = error?.response?.status;
      if (status === 404) {
        await ctx.reply(`❌ No se encontró ningún producto con el código *${escapeMarkdown(sku)}*.`, {
          parse_mode: 'Markdown',
        });
      } else {
        console.error('Error looking up product:', error?.response?.data || error.message);
        await ctx.reply(`❌ Error al buscar el producto: ${error?.response?.data?.message || error.message}`);
      }
      session.awaitingSku = true;
    }
  }

  // =================== Lifecycle ===================

  async start(): Promise<void> {
    // Pre-authenticate with backend
    await this.api.authenticate();

    // Launch bot
    await this.bot.launch();
    console.log('🤖 Bengala Bot iniciado. Esperando mensajes...');
  }

  stop(signal?: string): void {
    this.bot.stop(signal);
  }
}

/** Escape special characters for Telegram MarkdownV1 */
function escapeMarkdown(text: string): string {
  return text.replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
}
