import { PriceKey, ProductType, SubscriptionStatus } from '@onlook/stripe';
import { SEED_USER } from './constants';
import { v4 as uuidv4 } from 'uuid';
import { RobustSupabaseClient } from '../utils/robust-supabase';

/**
 * Ativa uma subscription PRO para o usuário seed usando API remota do Supabase
 */
export const activateUserSubscription = async () => {
    console.log('🎯 Ativando subscription para o usuário via API remota...');

    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
        throw new Error('SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY devem estar configurados');
    }

    const supabase = new RobustSupabaseClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    try {
        // Verifica se o usuário já tem uma subscription ativa
        console.log('🔍 Verificando subscription existente...');
        const { data: existingSubscriptions, error: subError } = await supabase.executeWithFallback(
            () => supabase.client.from('subscriptions')
                .select(`
                    *,
                    products(*),
                    prices(*)
                `)
                .eq('user_id', SEED_USER.ID)
                .eq('status', SubscriptionStatus.ACTIVE)
        );

        if (subError) {
            console.warn('⚠️ Erro ao verificar subscription existente:', subError.message);
        }

        if (existingSubscriptions && existingSubscriptions.length > 0) {
            console.log('✅ Usuário já possui subscription ativa:', existingSubscriptions[0].products?.name);
            return existingSubscriptions[0];
        }

        // Busca ou cria produto PRO
        console.log('📦 Buscando/criando produto PRO...');
        let { data: products, error: prodError } = await supabase.executeWithFallback(
            () => supabase.client.from('products')
                .select('*')
                .eq('type', ProductType.PRO)
                .limit(1)
        );

        let product;
        if (!products || products.length === 0) {
            console.log('📦 Criando produto PRO...');
            const productId = uuidv4();
            const { data: newProduct, error: createProdError } = await supabase.executeWithFallback(
                () => supabase.client.from('products')
                    .insert({
                        id: productId,
                        name: 'Onlook Pro',
                        type: ProductType.PRO,
                        stripe_product_id: `prod_dev_${Date.now()}`
                    })
                    .select()
                    .single()
            );
            
            if (createProdError) {
                throw new Error(`Erro ao criar produto: ${createProdError.message}`);
            }
            product = newProduct;
        } else {
            product = products[0];
        }

        // Busca ou cria preço PRO
        console.log('💰 Buscando/criando preço PRO...');
        let { data: prices, error: priceError } = await supabase.executeWithFallback(
            () => supabase.client.from('prices')
                .select('*')
                .eq('product_id', product.id)
                .limit(1)
        );

        let price;
        if (!prices || prices.length === 0) {
            console.log('💰 Criando preço PRO...');
            const priceId = uuidv4();
            const { data: newPrice, error: createPriceError } = await supabase.executeWithFallback(
                () => supabase.client.from('prices')
                    .insert({
                        id: priceId,
                        product_id: product.id,
                        key: PriceKey.PRO_MONTHLY_TIER_1,
                        monthly_message_limit: 1000,
                        stripe_price_id: `price_dev_${Date.now()}`
                    })
                    .select()
                    .single()
            );
            
            if (createPriceError) {
                throw new Error(`Erro ao criar preço: ${createPriceError.message}`);
            }
            price = newPrice;
        } else {
            price = prices[0];
        }

        // Cria nova subscription
        console.log('➕ Criando nova subscription...');
        const subscriptionId = uuidv4();
        const { data: newSubscription, error: createSubError } = await supabase.executeWithFallback(
            () => supabase.client.from('subscriptions')
                .insert({
                    id: subscriptionId,
                    user_id: SEED_USER.ID,
                    product_id: product.id,
                    price_id: price.id,
                    status: SubscriptionStatus.ACTIVE,
                    started_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                    stripe_customer_id: `cus_dev_${SEED_USER.ID}`,
                    stripe_subscription_id: `sub_dev_${Date.now()}`,
                    stripe_subscription_item_id: `si_dev_${Date.now()}`,
                    ended_at: null,
                    scheduled_action: null,
                    scheduled_price_id: null,
                    scheduled_change_at: null,
                    stripe_subscription_schedule_id: null
                })
                .select()
                .single()
        );

        if (createSubError) {
            throw new Error(`Erro ao criar subscription: ${createSubError.message}`);
        }

        console.log('✅ Nova subscription criada com sucesso!');
        return newSubscription;
    } catch (error: any) {
        console.error('❌ Erro ao ativar subscription:', error.message);
        throw error;
    }
};

/**
 * Verifica o status da subscription do usuário via API remota
 */
export const checkUserSubscriptionStatus = async () => {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
        console.error('❌ SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY devem estar configurados');
        return null;
    }

    const supabase = new RobustSupabaseClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    try {
        const { data: subscriptions, error } = await supabase.executeWithFallback(
            () => supabase.client.from('subscriptions')
                .select(`
                    *,
                    products(*),
                    prices(*)
                `)
                .eq('user_id', SEED_USER.ID)
                .limit(1)
        );

        if (error) {
            console.error('❌ Erro ao verificar subscription:', error.message);
            return null;
        }

        if (subscriptions && subscriptions.length > 0) {
            const subscription = subscriptions[0];
            console.log(`📊 Status da subscription: ${subscription.status}`);
            console.log(`📦 Produto: ${subscription.products?.name || 'N/A'}`);
            console.log(`💰 Limite mensal: ${subscription.prices?.monthly_message_limit || 'N/A'} mensagens`);
            return subscription;
        } else {
            console.log('❌ Nenhuma subscription encontrada para o usuário');
            return null;
        }
    } catch (error: any) {
        console.error('❌ Erro ao verificar subscription:', error.message);
        return null;
    }
};
