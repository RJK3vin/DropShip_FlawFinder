const contentEl = document.getElementById('content');
const subscriptionEl = document.getElementById('subscription-section');
let currentReviews = [];

const WORKER_URL = 'https://dropship-flawfinder.flawfinder-api.workers.dev';

const REVERIFY_INTERVAL_MS = 3 * 24 * 60 * 60 * 1000;

const STRIPE_CUSTOMER_PORTAL_URL = 'https://billing.stripe.com/p/login/aFafZg1Rn5ko4518tw43S00'

renderSubscriptionSection();
 
chrome.storage.local.get('flawfinder_lastScan', (result) => {
    const reviews = result.flawfinder_lastScan;
    
    if (!reviews || reviews.length === 0) {
        renderEmptyState();
        return;
    }
    
    currentReviews = reviews;
    renderReviews(reviews);
    }
);
 
function renderEmptyState() {
    contentEl.innerHTML = `
        <div class="empty-state">
            <div class="empty-icon">🔍</div>
            <p>No scan yet. Visit a product page on Amazon, Etsy, or TikTok
            Shop and click <strong>Analyze Flaws</strong> to get started.</p>
        </div>
  `;
}
 
function renderReviews(reviews) {
    const summaryHtml = `
        <div class="summary-bar">
            Found <strong>${reviews.length}</strong> low-rated review${reviews.length === 1 ? '' : 's'}
            from your last scan.
        </div>
    `;
 
    const cardsHtml = reviews.map(renderReviewCard).join('');
    
    const actionHtml = `
        <button id="generate-hooks-btn" class="primary-btn">
            ✨ Generate Ad Hooks
        </button>
        <div id="hooks-output"></div>
    `;
    
    contentEl.innerHTML = summaryHtml + cardsHtml + actionHtml;
    
    document.getElementById('generate-hooks-btn').addEventListener('click', handleGenerateHooksClick);
}
 
function renderReviewCard(review) {
    return `
        <div class="review-card">
            <div class="review-meta">
                <span class="review-stars">${starString(review.rating)}</span>
                <span class="review-date">${escapeHtml(review.date || '')}</span>
            </div>
            <div class="review-text">${escapeHtml(review.text || '(no text)')}</div>
        </div>
    `;
}
 
function handleGenerateHooksClick() {
    const button = document.getElementById('generate-hooks-btn');
    const outputEl = document.getElementById('hooks-output');
    
    button.disabled = true;
    button.textContent = 'Analyzing...';
    outputEl.innerHTML = `<div class="loading-note">This can take a few seconds — longer the first time, while Gemini Nano downloads.</div>`;
    
    chrome.runtime.sendMessage(
        { type: 'ANALYZE_REVIEWS', reviews: currentReviews },
        (response) => {
            button.disabled = false;
            button.textContent = '✨ Generate Ad Hooks';
        
            if (!response || !response.success) {
                const errorMsg = response ? response.error : 'Unknown error — no response from background script.';
                outputEl.innerHTML = `<div class="error-note">Couldn't generate hooks: ${escapeHtml(errorMsg)}</div>`;
                return;
            }
        
            renderHooks(response.data, outputEl);
        }
    );
}
 
function renderHooks(defects, outputEl) {
    if (!defects || defects.length === 0) {
        outputEl.innerHTML = `<div class="loading-note">No clear recurring defects found in this batch of reviews.</div>`;
        return;
    }
    
    outputEl.innerHTML = defects.map(renderHookCard).join('');
}
 
function renderHookCard(defect) {
    return `
        <div class="hook-card">
            <div class="hook-defect">${escapeHtml(defect.defect)} <span class="hook-count">(${defect.mentionCount} mentions)</span></div>
            <div class="hook-text">"${escapeHtml(defect.adHook)}"</div>
        </div>
    `;
}
 
function starString(rating) {
    const rounded = Math.round(rating || 0);
    const filled = '★'.repeat(rounded);
    const empty = '☆'.repeat(5 - rounded);
    return filled + empty;
}
 
function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}
 
function renderSubscriptionSection() {
    chrome.storage.local.get(
        ['flawfinder_subscribed', 'flawfinder_subscriberEmail', 'flawfinder_subscriptionVerifiedAt'],
        async (result) => {
            if (result.flawfinder_subscribed) {
                const verifiedAt = result.flawfinder_subscriptionVerifiedAt || 0;
                const isStale = Date.now() - verifiedAt > REVERIFY_INTERVAL_MS;
        
                if (isStale && result.flawfinder_subscriberEmail) {
                
                    const stillSubscribed = await verifyEmail(result.flawfinder_subscriberEmail);
            
                    await chrome.storage.local.set({
                        flawfinder_subscribed: stillSubscribed,
                        flawfinder_subscriptionVerifiedAt: Date.now()
                    });
            
                    if (!stillSubscribed) {
                        renderSubscriptionSection(); 
                        return;
                    }
                }
                subscriptionEl.innerHTML = `
                    <div class="sub-status sub-active">
                        ✓ Unlimited scans active (${escapeHtml(result.flawfinder_subscriberEmail || '')})
                    </div>
                    <a href="${STRIPE_CUSTOMER_PORTAL_URL}" target="_blank" class="sub-manage-link">
                        Manage / cancel subscription →
                    </a>
                `;
                return;
            }
    
            subscriptionEl.innerHTML = `
                <div class="sub-status">
                    <span class="sub-label">Already paid? Verify your email:</span>
                    <div class="sub-verify-row">
                        <input type="email" id="sub-email-input" placeholder="you@example.com" />
                        <button id="sub-verify-btn">Verify</button>
                    </div>
                    <div id="sub-verify-message"></div>
                </div>
            `;
        
            document.getElementById('sub-verify-btn').addEventListener('click', handleVerifyClick);
        }
    );
}
 
async function verifyEmail(email) {
    const response = await fetch(
        `${WORKER_URL}/verify?email=${encodeURIComponent(email)}`
    );
    const data = await response.json();
    return !!data.subscribed;
}
 
async function handleVerifyClick() {
    const input = document.getElementById('sub-email-input');
    const button = document.getElementById('sub-verify-btn');
    const messageEl = document.getElementById('sub-verify-message');
    const email = input.value.trim();
    
    if (!email) {
        messageEl.textContent = 'Enter the email you paid with.';
        return;
    }
    
    button.disabled = true;
    button.textContent = '...';
    messageEl.textContent = '';
    
    try {
        const subscribed = await verifyEmail(email);
    
        if (subscribed) {
            await chrome.storage.local.set({
                flawfinder_subscribed: true,
                flawfinder_subscriberEmail: email,
                flawfinder_subscriptionVerifiedAt: Date.now()
            });
            renderSubscriptionSection();
        } else {
            messageEl.textContent = 'No active subscription found for that email.';
            button.disabled = false;
            button.textContent = 'Verify';
        }
    } catch (err) {
        messageEl.textContent = 'Could not reach the server — try again shortly.';
        button.disabled = false;
        button.textContent = 'Verify';
    }
}