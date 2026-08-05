const contentEl = document.getElementById('content');
const subscriptionEl = document.getElementById('subscription-section');
let currentReviews = [];

const WORKER_URL = 'https://dropship-flawfinder.flawfinder-api.workers.dev';

const REVERIFY_INTERVAL_MS = 3 * 24 * 60 * 60 * 1000;

const STRIPE_CUSTOMER_PORTAL_URL = 'https://billing.stripe.com/p/login/aFafZg1Rn5ko4518tw43S00'

renderSubscriptionSection();
 
chrome.storage.local.get('flawfinder_lastScan', (result) => {  // retrieve most recent scan
    const reviews = result.flawfinder_lastScan;
    
    if (!reviews || reviews.length === 0) { // if empty or no recent scan show empty state
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
} // no scan state
 
function renderReviews(reviews) {
    const summaryHtml = `
        <div class="summary-bar">
            Found <strong>${reviews.length}</strong> low-rated review${reviews.length === 1 ? '' : 's'}
            from your last scan.
        </div>
    `; // html for summary of scan
 
    const cardsHtml = reviews.map(renderReviewCard).join(''); // all reviews as cards
    
    const actionHtml = `
        <button id="generate-hooks-btn" class="primary-btn">
            ✨ Generate Ad Hooks
        </button>
        <div id="hooks-output"></div>
    `; // html for ad hooks button
    
    contentEl.innerHTML = summaryHtml + cardsHtml + actionHtml; // combine all together
    
    document.getElementById('generate-hooks-btn').addEventListener('click', handleGenerateHooksClick); // waits for user to click generate add hooks button
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
} // card displays rating, date, and text
 
function handleGenerateHooksClick() {
    const button = document.getElementById('generate-hooks-btn');
    const outputEl = document.getElementById('hooks-output');
    
    button.disabled = true; // turns off button so user can't click it
    button.textContent = 'Analyzing...';
    outputEl.innerHTML = `<div class="loading-note">This can take a few seconds — longer the first time, while Gemini Nano downloads.</div>`;
    
    chrome.runtime.sendMessage( // send message to background
        { type: 'ANALYZE_REVIEWS', reviews: currentReviews }, // the message
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
} // display add hook cards
 
function starString(rating) {
    const rounded = Math.round(rating || 0);
    const filled = '★'.repeat(rounded);
    const empty = '☆'.repeat(5 - rounded);
    return filled + empty;
} // star ratings
 
function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}
 
function renderSubscriptionSection() {
    chrome.storage.local.get( // reads data saved from extension
        ['flawfinder_subscribed', // true or false
        'flawfinder_subscriberEmail', // email
        'flawfinder_subscriptionVerifiedAt'], // date & time since subscription was last verified
        async (result) => {
            if (result.flawfinder_subscribed) { // is user subscribed 
                const verifiedAt = result.flawfinder_subscriptionVerifiedAt || 0;
                const isStale = Date.now() - verifiedAt > REVERIFY_INTERVAL_MS; // longer than 3 days true or false if not longer
        
                if (isStale && result.flawfinder_subscriberEmail) {
                
                    const stillSubscribed = await verifyEmail(result.flawfinder_subscriberEmail); // recheck
            
                    await chrome.storage.local.set({
                        flawfinder_subscribed: stillSubscribed,
                        flawfinder_subscriptionVerifiedAt: Date.now()
                    }); // if verified subscribed: true, verifiedAt: today's date
            
                    if (!stillSubscribed) { // if not subscribed
                        renderSubscriptionSection(); // re render but subscribed: false
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
                `; // active subscription
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
            `; // user not subscribed display, asking to verify
        
            document.getElementById('sub-verify-btn').addEventListener('click', handleVerifyClick); // if verified button is clicked
        }
    );
}
 
async function verifyEmail(email) {
    const response = await fetch( // send http request to worker url 
        `${WORKER_URL}/verify?email=${encodeURIComponent(email)}`
    );
    const data = await response.json(); // date = subscribed: true or false
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
    } // nothing was typed
    
    button.disabled = true;
    button.textContent = '...';
    messageEl.textContent = '';
    // disables button and shows waiting

    try {
        const subscribed = await verifyEmail(email); // verify email again
    
        if (subscribed) { // if true set chrome storage
            await chrome.storage.local.set({
                flawfinder_subscribed: true,
                flawfinder_subscriberEmail: email,
                flawfinder_subscriptionVerifiedAt: Date.now()
            });
            renderSubscriptionSection(); // re runs so popup shows unlimited subscriptions
        } else {
            messageEl.textContent = 'No active subscription found for that email.';
            button.disabled = false;
            button.textContent = 'Verify';
        } // re enable verify button
    } catch (err) {
        messageEl.textContent = 'Could not reach the server — try again shortly.';
        button.disabled = false;
        button.textContent = 'Verify';
    }
}