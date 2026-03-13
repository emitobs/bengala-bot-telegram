import axios, { AxiosInstance } from 'axios';
import FormData from 'form-data';
import { config } from './config';

export interface Product {
    id: string;
    name: string;
    sku: string;
    basePrice: number;
    isActive: boolean;
    images: ProductImage[];
    categories: { id: string; name: string; slug: string }[];
}

export interface ProductImage {
    id: string;
    productId: string;
    url: string;
    altText: string | null;
    sortOrder: number;
    isPrimary: boolean;
}

export interface UploadResult {
    original: string;
    thumbnail: string;
}

export class ApiClient {
    private client: AxiosInstance;
    private accessToken: string | null = null;
    private refreshToken: string | null = null;
    private tokenExpiresAt: number = 0;

    constructor() {
        this.client = axios.create({
            baseURL: config.apiUrl,
            timeout: 30000,
        });
    }

    /**
     * Login as admin and store tokens.
     */
    async authenticate(): Promise<void> {
        try {
            const response = await this.client.post('/auth/login', {
                email: config.adminEmail,
                password: config.adminPassword,
            });

            this.accessToken = response.data.accessToken;
            this.refreshToken = response.data.refreshToken;
            // Refresh 1 minute before expiry (tokens last 15 min)
            this.tokenExpiresAt = Date.now() + 14 * 60 * 1000;

            console.log('✅ Authenticated with backend API');
        } catch (error: any) {
            const msg = error?.response?.data?.message || error.message;
            throw new Error(`Failed to authenticate with backend: ${msg}`);
        }
    }

    /**
     * Ensure we have a valid token, refresh if needed.
     */
    private async ensureAuth(): Promise<void> {
        if (!this.accessToken || Date.now() >= this.tokenExpiresAt) {
            if (this.refreshToken) {
                try {
                    const response = await this.client.post('/auth/refresh', {
                        refreshToken: this.refreshToken,
                    });
                    this.accessToken = response.data.accessToken;
                    this.refreshToken = response.data.refreshToken;
                    this.tokenExpiresAt = Date.now() + 14 * 60 * 1000;
                    return;
                } catch {
                    // Refresh failed, re-login
                }
            }
            await this.authenticate();
        }
    }

    private async getHeaders(): Promise<Record<string, string>> {
        await this.ensureAuth();
        return {
            Authorization: `Bearer ${this.accessToken}`,
        };
    }

    /**
     * Find a product by its SKU code.
     */
    async findProductBySku(sku: string): Promise<Product> {
        const headers = await this.getHeaders();
        const response = await this.client.get(`/products/by-sku/${encodeURIComponent(sku)}`, { headers });
        return response.data;
    }

    /**
     * Upload an image file buffer to the backend.
     * Returns the original and thumbnail URLs.
     */
    async uploadImage(buffer: Buffer, filename: string): Promise<UploadResult> {
        const headers = await this.getHeaders();

        const form = new FormData();
        form.append('file', buffer, {
            filename,
            contentType: 'image/jpeg',
        });

        const response = await this.client.post('/upload/image', form, {
            headers: {
                ...headers,
                ...form.getHeaders(),
            },
            maxContentLength: 10 * 1024 * 1024,
            maxBodyLength: 10 * 1024 * 1024,
        });

        return response.data;
    }

    /**
     * Associate an uploaded image URL with a product.
     */
    async addImageToProduct(
        productId: string,
        url: string,
        options?: { altText?: string; isPrimary?: boolean; sortOrder?: number },
    ): Promise<ProductImage> {
        const headers = await this.getHeaders();
        const response = await this.client.post(
            `/products/${productId}/images`,
            {
                url,
                altText: options?.altText,
                isPrimary: options?.isPrimary,
                sortOrder: options?.sortOrder,
            },
            { headers },
        );
        return response.data;
    }

    /**
     * Get current images for a product (for status display).
     */
    async getProductImages(productId: string): Promise<ProductImage[]> {
        const headers = await this.getHeaders();
        const response = await this.client.get(`/products/by-sku/${productId}`, { headers });
        return response.data.images || [];
    }
}
