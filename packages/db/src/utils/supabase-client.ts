import { createClient } from "@supabase/supabase-js";

export const getOptimizedSupabaseClient = (
    url: string,
    serviceKey: string,
    options: {
        timeout?: number;
    } = {}
) => {
    const { timeout = 15000 } = options;

    console.log('🔧 Creating optimized Supabase client with', timeout, 'ms timeout...');
    
    return createClient(url, serviceKey, {
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
                'x-application-name': 'onlook-app',
                'Connection': 'keep-alive'
            }
        }
    });
};



/**
 * Test database connectivity with optimized settings
 */
export const testDatabaseConnection = async (
    url: string,
    serviceKey: string
): Promise<{ success: boolean; latency?: number; error?: string }> => {
    const startTime = Date.now();
    
    try {
        const client = getOptimizedSupabaseClient(url, serviceKey, {
            timeout: 5000
        });

        // Simple query to test connection
        const { error } = await client
            .from('users')
            .select('id')
            .limit(1)
            .single();

        const latency = Date.now() - startTime;

        if (error && !error.message.includes('No rows')) {
            throw error;
        }

        console.log(`✅ Database connection successful (${latency}ms)`);
        return { success: true, latency };
    } catch (error: any) {
        const latency = Date.now() - startTime;
        console.error(`❌ Database connection failed (${latency}ms):`, error.message);
        
        return { 
            success: false, 
            latency,
            error: error.message || 'Unknown database error'
        };
    }
};
