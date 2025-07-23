#!/usr/bin/env node

/**
 * Script para resolver problemas de conectividade e ativar subscription
 * Execute com: node fix-connection-and-subscription.js
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🚀 Iniciando correção de conectividade e subscription...\n');

// 1. Verificar conectividade DNS
console.log('1️⃣ Testando conectividade DNS...');
try {
    execSync('nslookup db.spxlbemmqfpwzgbovoks.supabase.co', { stdio: 'inherit' });
    console.log('✅ DNS funcionando\n');
} catch (error) {
    console.log('❌ Problema de DNS detectado');
    console.log('💡 Tentando resolver com flush DNS...');
    
    try {
        // Flush DNS no macOS
        execSync('sudo dscacheutil -flushcache', { stdio: 'inherit' });
        execSync('sudo killall -HUP mDNSResponder', { stdio: 'inherit' });
        console.log('✅ DNS cache limpo\n');
    } catch (flushError) {
        console.log('⚠️ Não foi possível limpar DNS cache (pode precisar de sudo)\n');
    }
}

// 2. Verificar conectividade com Supabase
console.log('2️⃣ Testando conectividade com Supabase...');
try {
    execSync('curl -I https://spxlbemmqfpwzgbovoks.supabase.co --max-time 10', { stdio: 'inherit' });
    console.log('✅ Supabase acessível\n');
} catch (error) {
    console.log('❌ Problema de conectividade com Supabase');
    console.log('💡 Verificando configurações de rede...\n');
}

// 3. Executar seed com subscription
console.log('3️⃣ Executando seed do usuário e ativando subscription...');
try {
    // Executa o seed do Supabase que agora inclui ativação de subscription
    execSync('bun run packages/db/src/seed/index.ts', { 
        stdio: 'inherit',
        cwd: process.cwd()
    });
    console.log('✅ Seed executado com sucesso\n');
} catch (error) {
    console.log('❌ Erro no seed:', error.message);
    console.log('💡 Tentando seed alternativo...\n');
    
    try {
        // Tenta executar diretamente o arquivo de seed
        execSync('cd packages/db && bun src/seed/index.ts', { stdio: 'inherit' });
        console.log('✅ Seed alternativo executado\n');
    } catch (altError) {
        console.log('❌ Seed alternativo também falhou\n');
    }
}

// 4. Verificar se o usuário tem subscription ativa
console.log('4️⃣ Verificando status da subscription...');

// Cria um script temporário para verificar subscription
const checkScript = `
import { db } from '@onlook/db/src/client';
import { subscriptions } from '@onlook/db/src/schema';
import { eq } from 'drizzle-orm';

const SEED_USER_ID = '929b4640-b356-4936-a2a0-b2aac77bb575';

async function checkSubscription() {
    try {
        const subscription = await db.query.subscriptions.findFirst({
            where: eq(subscriptions.userId, SEED_USER_ID),
            with: {
                product: true,
                price: true
            }
        });

        if (subscription) {
            console.log('✅ Subscription encontrada:');
            console.log('📦 Produto:', subscription.product.name);
            console.log('📊 Status:', subscription.status);
            console.log('💰 Limite mensal:', subscription.price.monthlyMessageLimit, 'mensagens');
        } else {
            console.log('❌ Nenhuma subscription encontrada para o usuário');
        }
    } catch (error) {
        console.log('❌ Erro ao verificar subscription:', error.message);
    }
    process.exit(0);
}

checkSubscription();
`;

fs.writeFileSync('temp-check-subscription.ts', checkScript);

try {
    execSync('bun temp-check-subscription.ts', { stdio: 'inherit' });
} catch (error) {
    console.log('⚠️ Não foi possível verificar subscription automaticamente');
}

// Limpa arquivo temporário
try {
    fs.unlinkSync('temp-check-subscription.ts');
} catch (e) {}

// 5. Configurações de rede recomendadas
console.log('\n5️⃣ Recomendações finais:');
console.log('🔧 Se os problemas persistirem, tente:');
console.log('   • Reiniciar o roteador/modem');
console.log('   • Usar DNS público (8.8.8.8, 1.1.1.1)');
console.log('   • Verificar firewall/antivírus');
console.log('   • Tentar conexão via hotspot móvel');

console.log('\n6️⃣ Para executar o servidor:');
console.log('   bun run dev');

console.log('\n✨ Script de correção concluído!');
