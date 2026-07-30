export default {
    async fetch(request, env) {
        const url = new URL(request.url);
    
        if (request.method === 'OPTIONS') {
            return new Response(null, { headers: corsHeaders() });
        }
    
        if (url.pathname === '/webhook' && request.method === 'POST') {
            return handleStripeWebhook(request, env);
        }
    
        if (url.pathname === '/verify' && request.method === 'GET') {
            return handleVerify(url, env);
        }
    
        return new Response('Not found', { status: 404 });
    }
};
 
function corsHeaders() {
    return {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Stripe-Signature'
    };
}
 
async function handleStripeWebhook(request, env) {
    const signature = request.headers.get('Stripe-Signature');
    const body = await request.text();
    
    let event;
    try {
        event = await verifyStripeSignature(body, signature, env.STRIPE_WEBHOOK_SECRET);
    } catch (err) {
        console.error('Webhook signature verification failed:', err.message);
        return new Response('Invalid signature', { status: 400 });
    }
    
    if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        const email = session.customer_details?.email || session.customer_email;
        const customerId = session.customer;
    
        if (email) {
            await env.SUBSCRIBERS.put(email.toLowerCase(), 'true');
            console.log(`[FlawFinder] New subscriber: ${email}`);
        }
    
        if (customerId && email) {
            await env.SUBSCRIBERS.put(`customer:${customerId}`, email.toLowerCase());
        }
    }
    
    if (event.type === 'customer.subscription.deleted') {
        const customerId = event.data.object.customer;
        const email = await env.SUBSCRIBERS.get(`customer:${customerId}`);
    
        if (email) {
            await env.SUBSCRIBERS.delete(email);
            await env.SUBSCRIBERS.delete(`customer:${customerId}`);
            console.log(`[FlawFinder] Subscription canceled, revoked access: ${email}`);
        } else {
            console.warn(`[FlawFinder] Cancellation for unknown customer: ${customerId}`);
        }
    }
    
    return new Response('ok', { status: 200 });
}
 
async function handleVerify(url, env) {
    const email = url.searchParams.get('email');
    
    if (!email) {
        return jsonResponse({ error: 'Missing email parameter' }, 400);
    }
    
    const record = await env.SUBSCRIBERS.get(email.toLowerCase());
    
    return jsonResponse({ subscribed: record === 'true' });
}
 
function jsonResponse(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            'Content-Type': 'application/json',
            ...corsHeaders()
        }
    });
}

async function verifyStripeSignature(payload, signatureHeader, secret) {
    if (!signatureHeader) throw new Error('Missing Stripe-Signature header');
    
    const parts = Object.fromEntries(
        signatureHeader.split(',').map(part => part.split('='))
    );
    const timestamp = parts.t;
    const expectedSignature = parts.v1;
    
    const signedPayload = `${timestamp}.${payload}`;
    
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
        'raw',
        encoder.encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
    );
    
    const signatureBuffer = await crypto.subtle.sign(
        'HMAC',
        key,
        encoder.encode(signedPayload)
    );
    
    const computedSignature = Array.from(new Uint8Array(signatureBuffer))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
    
    if (computedSignature !== expectedSignature) {
        throw new Error('Signature mismatch');
    }
    
    return JSON.parse(payload);
}