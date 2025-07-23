import { SEED_USER } from "./constants";
import { RobustSupabaseClient } from "../utils/robust-supabase";
import { activateUserSubscription, checkUserSubscriptionStatus } from "./activate-subscription";

// Helper function to retry operations with exponential backoff
const retryWithBackoff = async <T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    baseDelay: number = 1000
): Promise<T> => {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await operation();
        } catch (error: any) {
            const isConnectionError = error.message?.includes('CONNECT_TIMEOUT') || 
                                    error.message?.includes('connection') ||
                                    error.code === 'ECONNRESET' ||
                                    error.code === 'ETIMEDOUT';
            
            if (attempt === maxRetries || !isConnectionError) {
                throw error;
            }
            
            const delay = baseDelay * Math.pow(2, attempt - 1);
            console.log(`Connection attempt ${attempt} failed, retrying in ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
    throw new Error('Max retries exceeded');
};

export const seedSupabaseUser = async () => {
    console.log('🌱 Seeding Supabase user...');

    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
        throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
    }

    // Cria cliente Supabase robusto com cache e fallback
    console.log('🚀 Iniciando cliente Supabase robusto...');
    const supabase = new RobustSupabaseClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    
    // Testa conectividade básica
    const isConnected = await supabase.testConnection();
    if (!isConnected) {
        console.warn('⚠️ Conectividade limitada - usando modo cache/fallback');
    } else {
        console.log('✅ Conexão Supabase estabelecida com sucesso');
    }

    try {
        // Check if user already exists with robust client
        const { data: { user: existingUser } } = await supabase.getUserById(SEED_USER.ID) as any;

        if (existingUser) {
            console.log('User already exists, skipping user creation');
            return existingUser;
        }

        // Create user with robust client
        const { data, error } = await supabase.createUser({
            id: SEED_USER.ID,
            email: SEED_USER.EMAIL,
            password: SEED_USER.PASSWORD,
            email_confirm: true,
            user_metadata: {
                first_name: SEED_USER.FIRST_NAME,
                last_name: SEED_USER.LAST_NAME,
                display_name: SEED_USER.DISPLAY_NAME,
                avatar_url: SEED_USER.AVATAR_URL,
            },
        }) as any;

        if (error) {
            console.error('Error seeding Supabase user:', error);
            throw error;
        }
        
        console.log('User seeded successfully!', data.user?.email);
        
        // Ativa subscription para o usuário
        try {
            console.log('🎯 Ativando subscription do usuário...');
            await activateUserSubscription();
            await checkUserSubscriptionStatus();
        } catch (subError: any) {
            console.warn('⚠️ Erro ao ativar subscription (continuando):', subError.message);
        }
        
        return data.user;
    } catch (error: any) {
        // Handle specific errors
        if (error.message?.includes('duplicate key value') || error.message?.includes('already exists')) {
            console.log('User already exists with this email, skipping user creation');
            return null;
        }
        
        if (error.message?.includes('CONNECT_TIMEOUT')) {
            console.error('❌ Connection timeout to Supabase. Please check your internet connection and Supabase status.');
        } else {
            console.error('❌ Error seeding Supabase user:', error.message || error);
        }
        
        throw error;
    }
};
