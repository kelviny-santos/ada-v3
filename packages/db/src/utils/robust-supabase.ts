import { createClient } from "@supabase/supabase-js";

/**
 * Wrapper robusto para Supabase que lida com timeouts e problemas de conectividade
 */
export class RobustSupabaseClient {
    private client: any;
    private cache = new Map<string, { data: any; timestamp: number }>();
    private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutos

    constructor(url: string, serviceKey: string) {
        console.log('🔧 Criando cliente Supabase robusto...');
        
        this.client = createClient(url, serviceKey, {
            auth: {
                autoRefreshToken: false,
                persistSession: false,
                detectSessionInUrl: false
            },
            db: {
                schema: 'public'
            },
            global: {
                headers: {
                    'Connection': 'close', // Evita problemas de keep-alive
                    'Cache-Control': 'no-cache',
                    'User-Agent': 'onlook-app/1.0'
                }
            }
        });
    }

    /**
     * Executa operação com retry e fallback para cache
     */
    async executeWithFallback<T>(
        operation: () => Promise<T>,
        cacheKey?: string,
        useCache: boolean = true
    ): Promise<T> {
        // Tenta buscar do cache primeiro se disponível
        if (useCache && cacheKey) {
            const cached = this.getFromCache(cacheKey);
            if (cached) {
                console.log(`📦 Usando dados do cache para: ${cacheKey}`);
                return cached;
            }
        }

        // Tenta a operação com timeout agressivo
        try {
            console.log('🔄 Executando operação Supabase...');
            const result = await Promise.race([
                operation(),
                new Promise<never>((_, reject) => 
                    setTimeout(() => reject(new Error('Operation timeout')), this.timeout)
                )
            ]);

            // Salva no cache se bem-sucedido
            if (useCache && cacheKey && result) {
                this.saveToCache(cacheKey, result);
            }

            return result;
        } catch (error: any) {
            console.warn('⚠️ Operação Supabase falhou:', error.message);

            // Se temos cache, usa ele como fallback
            if (useCache && cacheKey) {
                const cached = this.getFromCache(cacheKey, true); // Ignora TTL
                if (cached) {
                    console.log(`🔄 Usando cache expirado como fallback para: ${cacheKey}`);
                    return cached;
                }
            }

            throw error;
        }
    }

    /**
     * Busca usuário por ID com cache e fallback
     */
    async getUserById(userId: string) {
        return this.executeWithFallback(
            () => this.client.auth.admin.getUserById(userId),
            `user_${userId}`,
            true
        );
    }

    /**
     * Cria usuário com retry
     */
    async createUser(userData: any) {
        return this.executeWithFallback(
            () => this.client.auth.admin.createUser(userData),
            undefined, // Não cacheia criação de usuário
            false
        );
    }

    /**
     * Lista usuários com cache
     */
    async listUsers(options: any = {}) {
        return this.executeWithFallback(
            () => this.client.auth.admin.listUsers(options),
            `users_list_${JSON.stringify(options)}`,
            true
        );
    }

    /**
     * Cria promise que falha após timeout
     */
    private createTimeoutPromise(ms: number): Promise<never> {
        return new Promise((_, reject) => {
            setTimeout(() => {
                reject(new Error(`Operação timeout após ${ms}ms`));
            }, ms);
        });
    }

    /**
     * Salva dados no cache
     */
    private saveToCache(key: string, data: any): void {
        this.cache.set(key, {
            data,
            timestamp: Date.now()
        });
    }

    /**
     * Busca dados do cache
     */
    private getFromCache(key: string, ignoreTTL: boolean = false): any | null {
        const cached = this.cache.get(key);
        if (!cached) return null;

        const isExpired = Date.now() - cached.timestamp > this.CACHE_TTL;
        if (isExpired && !ignoreTTL) return null;

        return cached.data;
    }

    /**
     * Limpa cache expirado
     */
    clearExpiredCache(): void {
        const now = Date.now();
        for (const [key, value] of this.cache.entries()) {
            if (now - value.timestamp > this.CACHE_TTL) {
                this.cache.delete(key);
            }
        }
    }

    /**
     * Testa conectividade básica
     */
    async testConnection(): Promise<boolean> {
        try {
            await this.executeWithFallback(
                () => this.client.auth.admin.listUsers({ page: 1, perPage: 1 }),
                undefined,
                false
            );
            return true;
        } catch (error) {
            return false;
        }
    }
}
