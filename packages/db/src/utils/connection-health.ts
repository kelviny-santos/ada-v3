import { createClient } from "@supabase/supabase-js";

export interface ConnectionHealth {
    isHealthy: boolean;
    latency?: number;
    error?: string;
}

/**
 * Check Supabase connection health with timeout
 */
export const checkSupabaseHealth = async (
    url: string,
    serviceKey: string,
    timeoutMs: number = 5000
): Promise<ConnectionHealth> => {
    const startTime = Date.now();
    
    try {
        const supabase = createClient(url, serviceKey, {
            auth: {
                autoRefreshToken: false,
                persistSession: false
            }
        });

        // Create a promise that rejects after timeout
        const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error('Connection timeout')), timeoutMs);
        });

        // Race between the health check and timeout
        await Promise.race([
            supabase.from('users').select('count', { count: 'exact', head: true }),
            timeoutPromise
        ]);

        const latency = Date.now() - startTime;
        
        return {
            isHealthy: true,
            latency
        };
    } catch (error: any) {
        const latency = Date.now() - startTime;
        
        return {
            isHealthy: false,
            latency,
            error: error.message || 'Unknown connection error'
        };
    }
};

/**
 * Wait for Supabase to be available with exponential backoff
 */
export const waitForSupabaseConnection = async (
    url: string,
    serviceKey: string,
    maxRetries: number = 5,
    baseDelay: number = 1000
): Promise<void> => {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        console.log(`🔍 Checking Supabase connection (attempt ${attempt}/${maxRetries})...`);
        
        const health = await checkSupabaseHealth(url, serviceKey);
        
        if (health.isHealthy) {
            console.log(`✅ Supabase connection established (${health.latency}ms)`);
            return;
        }
        
        if (attempt === maxRetries) {
            throw new Error(`❌ Failed to connect to Supabase after ${maxRetries} attempts: ${health.error}`);
        }
        
        const delay = baseDelay * Math.pow(2, attempt - 1);
        console.log(`⏳ Connection failed (${health.error}), retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
    }
};
