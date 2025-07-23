import { createClient } from "@supabase/supabase-js";

interface ConnectionAttempt {
    success: boolean;
    latency: number;
    error?: string;
}

/**
 * Implementa uma estratégia de fallback para conexões com Supabase
 * com múltiplas tentativas e configurações diferentes
 */
export class SupabaseConnectionManager {
    private static instance: SupabaseConnectionManager;
    private connectionHistory: ConnectionAttempt[] = [];
    private lastSuccessfulConfig: any = null;

    static getInstance(): SupabaseConnectionManager {
        if (!SupabaseConnectionManager.instance) {
            SupabaseConnectionManager.instance = new SupabaseConnectionManager();
        }
        return SupabaseConnectionManager.instance;
    }

    /**
     * Tenta conectar com diferentes configurações até encontrar uma que funcione
     */
    async getWorkingClient(url: string, serviceKey: string) {
        const configurations = [
            // Config 1: Timeout curto, sem keep-alive
            {
                name: "Fast timeout",
                config: {
                    auth: { autoRefreshToken: false, persistSession: false },
                    global: {
                        headers: { 'Connection': 'close' },
                        fetch: this.createTimeoutFetch(5000) as any
                    }
                }
            },
            // Config 2: Timeout médio, com keep-alive
            {
                name: "Medium timeout with keep-alive",
                config: {
                    auth: { autoRefreshToken: false, persistSession: false },
                    global: {
                        headers: { 'Connection': 'keep-alive' },
                        fetch: this.createTimeoutFetch(10000) as any
                    }
                }
            },
            // Config 3: Timeout longo, configuração básica
            {
                name: "Long timeout basic",
                config: {
                    auth: { autoRefreshToken: false, persistSession: false },
                    global: {
                        fetch: this.createTimeoutFetch(20000) as any
                    }
                }
            },
            // Config 4: Sem timeout customizado (padrão)
            {
                name: "Default configuration",
                config: {
                    auth: { autoRefreshToken: false, persistSession: false }
                }
            }
        ];

        // Se temos uma configuração que funcionou antes, tenta ela primeiro
        if (this.lastSuccessfulConfig) {
            console.log('🔄 Tentando configuração que funcionou anteriormente...');
            try {
                const client = createClient(url, serviceKey, this.lastSuccessfulConfig);
                await this.testConnection(client);
                console.log('✅ Configuração anterior ainda funciona');
                return client;
            } catch (error) {
                console.log('⚠️ Configuração anterior não funciona mais, tentando outras...');
            }
        }

        // Tenta cada configuração até encontrar uma que funcione
        for (const { name, config } of configurations) {
            console.log(`🔍 Tentando: ${name}...`);
            
            try {
                const client = createClient(url, serviceKey, config);
                await this.testConnection(client);
                
                console.log(`✅ Sucesso com: ${name}`);
                this.lastSuccessfulConfig = config;
                return client;
            } catch (error: any) {
                console.log(`❌ Falhou ${name}: ${error.message}`);
                this.recordAttempt(false, 0, error.message);
            }
        }

        throw new Error('❌ Todas as configurações de conexão falharam');
    }

    /**
     * Cria uma função fetch com timeout customizado
     */
    private createTimeoutFetch(timeoutMs: number) {
        return async (url: RequestInfo | URL, init?: RequestInit) => {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

            try {
                const response = await fetch(url, {
                    ...init,
                    signal: controller.signal
                });
                clearTimeout(timeoutId);
                return response;
            } catch (error) {
                clearTimeout(timeoutId);
                throw error;
            }
        };
    }

    /**
     * Testa a conexão com uma query simples
     */
    private async testConnection(client: any): Promise<void> {
        const startTime = Date.now();
        
        // Tenta uma operação simples de auth para testar a conexão
        const { error } = await client.auth.admin.listUsers({ page: 1, perPage: 1 });
        
        const latency = Date.now() - startTime;
        
        if (error && !error.message.includes('No users')) {
            throw error;
        }
        
        this.recordAttempt(true, latency);
    }

    /**
     * Registra tentativa de conexão para análise
     */
    private recordAttempt(success: boolean, latency: number, error?: string): void {
        this.connectionHistory.push({ success, latency, error });
        
        // Mantém apenas os últimos 10 registros
        if (this.connectionHistory.length > 10) {
            this.connectionHistory.shift();
        }
    }

    /**
     * Retorna estatísticas de conexão
     */
    getConnectionStats() {
        const total = this.connectionHistory.length;
        const successful = this.connectionHistory.filter(a => a.success).length;
        const avgLatency = this.connectionHistory
            .filter(a => a.success)
            .reduce((sum, a) => sum + a.latency, 0) / successful || 0;

        return {
            total,
            successful,
            successRate: total > 0 ? (successful / total) * 100 : 0,
            averageLatency: Math.round(avgLatency)
        };
    }
}
