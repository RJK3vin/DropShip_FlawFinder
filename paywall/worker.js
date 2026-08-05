export default {
    async fetch(request, env) { // cloudflare calls this
        const url = new URL(request.url); // what url was requested
        // ex: request.url: https://worker.workers.dev/verify?email=kevin@gmail.com
        // url.pathname is "/verify"
        // url.searchParams.get("email") is "kevin@gmail.com"
    
        if (request.method === 'OPTIONS') { // options request before real request
            return new Response(null, { headers: corsHeaders() }); // browsers can call me
        } 
    
        if (url.pathname === '/webhook' && request.method === 'POST') { // Stripe sends webhooks as POST requests. Ex: POST /webhook
            return handleStripeWebhook(request, env);
        }
    
        if (url.pathname === '/verify' && request.method === 'GET') { // GET /verify?email=kevin@gmail.com
            return handleVerify(url, env);
        }
    
        return new Response('Not found', { status: 404 }); // random invalid requests return 404 error
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
    const signature = request.headers.get('Stripe-Signature'); // signature to prove request came from Stripe
    const body = await request.text(); // raw JSON text
    
    let event;
    try {
        event = await verifyStripeSignature(body, signature, env.STRIPE_WEBHOOK_SECRET); // checking if Stripe really send this
    } catch (err) {
        console.error('Webhook signature verification failed:', err.message);
        return new Response('Invalid signature', { status: 400 });
    }
    
    if (event.type === 'checkout.session.completed') { // someone bought subscription
        const session = event.data.object; // customer id and customer email
        const email = session.customer_details?.email || session.customer_email; // email of subscribed user
        const customerId = session.customer;
    
        if (email) {
            await env.SUBSCRIBERS.put(email.toLowerCase(), 'true'); // adds email to Cloudflare KV with subscribed: true
            console.log(`[FlawFinder] New subscriber: ${email}`);
        }
    
        if (customerId && email) {
            await env.SUBSCRIBERS.put(`customer:${customerId}`, email.toLowerCase());
        } // KV also stores this information. key value pair, customer:customerID : email
    }
    
    if (event.type === 'customer.subscription.deleted') { // cancels subscription
        const customerId = event.data.object.customer;
        const email = await env.SUBSCRIBERS.get(`customer:${customerId}`); // get customer email from id
    
        if (email) {
            await env.SUBSCRIBERS.delete(email); // removes email from KV
            await env.SUBSCRIBERS.delete(`customer:${customerId}`); // removes customer id from KV
            console.log(`[FlawFinder] Subscription canceled, revoked access: ${email}`);
        } else {
            console.warn(`[FlawFinder] Cancellation for unknown customer: ${customerId}`);
        }
    }
    
    return new Response('ok', { status: 200 });
}
 
async function handleVerify(url, env) {
    const email = url.searchParams.get('email'); // email = kevin@gmail.com
    
    if (!email) {
        return jsonResponse({ error: 'Missing email parameter' }, 400);
    }
    
    const record = await env.SUBSCRIBERS.get(email.toLowerCase()); // either true or false based on Cloudflare KV database (SUBSCRIBERS)
    
    return jsonResponse({ subscribed: record === 'true' }); // subscribed: true
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
    if (!signatureHeader) throw new Error('Missing Stripe-Signature header'); // reads stripe signature from request header
    
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
    } // compare computed signature to the one stripe sent
    
    // if they match request is authentic
    return JSON.parse(payload);
}