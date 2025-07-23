#!/usr/bin/env bun

/**
 * Script simples para ativar subscription usando apenas o banco remoto Supabase
 * Execute com: bun activate-subscription-remote.ts
 */

import { createClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import { config } from 'dotenv';
import { join } from 'path';

// Carregar variáveis de ambiente do arquivo .env
config({ path: join(process.cwd(), 'packages/db/.env') });
config({ path: join(process.cwd(), 'apps/web/client/.env') });
config({ path: join(process.cwd(), 'apps/backend/.env') });

// Constantes do usuário seed
const SEED_USER_ID = '929b4640-b356-4936-a2a0-b2aac77bb575';
const SEED_USER_EMAIL = 'test@onlook.dev';

// Tipos básicos
const ProductType = {
    PRO: 'pro'
} as const;

const SubscriptionStatus = {
    ACTIVE: 'active'
} as const;

const PriceKey = {
    PRO_MONTHLY_TIER_1: 'pro_monthly_tier_1'
} as const;

async function activateSubscriptionRemote() {
    console.log('🚀 Iniciando ativação de subscription via API remota...\n');

    // Verificar variáveis de ambiente
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
        console.error('❌ Variáveis de ambiente não encontradas:');
        console.error('   SUPABASE_URL:', supabaseUrl ? '✅' : '❌');
        console.error('   SUPABASE_SERVICE_ROLE_KEY:', supabaseKey ? '✅' : '❌');
        process.exit(1);
    }

    console.log('✅ Variáveis de ambiente configuradas');
    console.log('🔗 Conectando ao Supabase...');

    // Criar cliente Supabase
    const supabase = createClient(supabaseUrl, supabaseKey);

    try {
        // 1. Verificar se o usuário existe
        console.log('\n1️⃣ Verificando usuário seed...');
        const { data: users, error: userError } = await supabase
            .from('users')
            .select('*')
            .eq('id', SEED_USER_ID)
            .limit(1);

        if (userError) {
            console.error('❌ Erro ao buscar usuário:', userError.message);
            throw userError;
        }

        if (!users || users.length === 0) {
            console.log('⚠️ Usuário seed não encontrado, criando...');
            const { data: newUser, error: createUserError } = await supabase
                .from('users')
                .insert({
                    id: SEED_USER_ID,
                    email: SEED_USER_EMAIL,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                })
                .select()
                .single();

            if (createUserError) {
                console.error('❌ Erro ao criar usuário:', createUserError.message);
                throw createUserError;
            }
            console.log('✅ Usuário seed criado:', newUser.email);
        } else {
            console.log('✅ Usuário seed encontrado:', users[0].email);
        }

        // 2. Verificar subscription existente
        console.log('\n2️⃣ Verificando subscription existente...');
        const { data: existingSubscriptions, error: subError } = await supabase
            .from('subscriptions')
            .select('*')
            .eq('user_id', SEED_USER_ID)
            .eq('status', SubscriptionStatus.ACTIVE);

        if (subError) {
            console.warn('⚠️ Erro ao verificar subscription:', subError.message);
        }

        if (existingSubscriptions && existingSubscriptions.length > 0) {
            console.log('✅ Usuário já possui subscription ativa!');
            console.log('📊 Status:', existingSubscriptions[0].status);
            return existingSubscriptions[0];
        }

        // 3. Buscar ou criar produto PRO
        console.log('\n3️⃣ Configurando produto PRO...');
        let { data: products, error: prodError } = await supabase
            .from('products')
            .select('*')
            .eq('type', ProductType.PRO)
            .limit(1);

        if (prodError) {
            console.warn('⚠️ Erro ao buscar produto:', prodError.message);
        }

        let product;
        if (!products || products.length === 0) {
            console.log('📦 Criando produto PRO...');
            const { data: newProduct, error: createProdError } = await supabase
                .from('products')
                .insert({
                    id: uuidv4(),
                    name: 'Onlook Pro',
                    type: ProductType.PRO,
                    stripe_product_id: `prod_dev_${Date.now()}`
                })
                .select()
                .single();

            if (createProdError) {
                console.error('❌ Erro ao criar produto:', createProdError.message);
                throw createProdError;
            }
            product = newProduct;
            console.log('✅ Produto PRO criado:', product.name);
        } else {
            product = products[0];
            console.log('✅ Produto PRO encontrado:', product.name);
        }

        // 4. Buscar ou criar preço PRO
        console.log('\n4️⃣ Configurando preço PRO...');
        let { data: prices, error: priceError } = await supabase
            .from('prices')
            .select('*')
            .eq('product_id', product.id)
            .limit(1);

        if (priceError) {
            console.warn('⚠️ Erro ao buscar preço:', priceError.message);
        }

        let price;
        if (!prices || prices.length === 0) {
            console.log('💰 Criando preço PRO...');
            const { data: newPrice, error: createPriceError } = await supabase
                .from('prices')
                .insert({
                    id: uuidv4(),
                    product_id: product.id,
                    price_key: PriceKey.PRO_MONTHLY_TIER_1,
                    monthly_message_limit: 1000,
                    stripe_price_id: `price_dev_${Date.now()}`
                })
                .select()
                .single();

            if (createPriceError) {
                console.error('❌ Erro ao criar preço:', createPriceError.message);
                throw createPriceError;
            }
            price = newPrice;
            console.log('✅ Preço PRO criado: 1000 mensagens/mês');
        } else {
            price = prices[0];
            console.log('✅ Preço PRO encontrado:', price.monthly_message_limit, 'mensagens/mês');
        }

        // 5. Criar subscription ativa
        console.log('\n5️⃣ Criando subscription ativa...');
        const { data: newSubscription, error: createSubError } = await supabase
            .from('subscriptions')
            .insert({
                id: uuidv4(),
                user_id: SEED_USER_ID,
                product_id: product.id,
                price_id: price.id,
                status: SubscriptionStatus.ACTIVE,
                started_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                stripe_customer_id: `cus_dev_${SEED_USER_ID}`,
                stripe_subscription_id: `sub_dev_${Date.now()}`,
                stripe_subscription_item_id: `si_dev_${Date.now()}`,
                ended_at: null,
                scheduled_action: null,
                scheduled_price_id: null,
                scheduled_change_at: null,
                stripe_subscription_schedule_id: null
            })
            .select()
            .single();

        if (createSubError) {
            console.error('❌ Erro ao criar subscription:', createSubError.message);
            throw createSubError;
        }

        console.log('✅ Subscription criada com sucesso!');
        console.log('🎯 ID:', newSubscription.id);
        console.log('📊 Status:', newSubscription.status);

        // 6. Verificação final
        console.log('\n6️⃣ Verificação final...');
        const { data: finalCheck, error: finalError } = await supabase
            .from('subscriptions')
            .select('*')
            .eq('user_id', SEED_USER_ID)
            .eq('status', SubscriptionStatus.ACTIVE);

        if (finalError) {
            console.warn('⚠️ Erro na verificação final:', finalError.message);
        } else if (finalCheck && finalCheck.length > 0) {
            console.log('🎉 SUCESSO! Subscription ativa confirmada:');
            console.log('   👤 Usuário:', SEED_USER_EMAIL);
            console.log('   📊 Status:', finalCheck[0].status);
            console.log('   🆔 ID:', finalCheck[0].id);
        }

        return newSubscription;

    } catch (error: any) {
        console.error('\n❌ Erro geral:', error.message);
        console.error('🔍 Detalhes:', error);
        process.exit(1);
    }
}

// Executar se chamado diretamente
if (import.meta.main) {
    activateSubscriptionRemote()
        .then(() => {
            console.log('\n✨ Script concluído com sucesso!');
            process.exit(0);
        })
        .catch((error) => {
            console.error('\n💥 Script falhou:', error.message);
            process.exit(1);
        });
}
