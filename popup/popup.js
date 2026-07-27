const contentEl = document.getElementById('content');
let currentReviews = [];

chrome.storage.local.get('flawfinder_lastScan', (result) => {
    const reviews = result.flawfinder_lastScan;

    if (!reviews || reviews.length === 0) {
        renderEmptyState();
        return;
    }

    currentReviews = reviews;
    renderReviews(reviews);
});

function renderEmptyState() {
    contentEl.innerHTML = `
        <div class="empty-state">
            <div class="empty-icon">🔍</div>
                <p>No scan yet. Visit a product page on Amazon, Etsy, or TikTok Shop and click <strong>Analyze Flaws</strong> to get started.</p>
        </div>
    `;
}

function renderReviews(reviews) {
    const summaryHtml = `
        <div class="summary-bar">
            Found <strong>${reviews.length}</strong> low-rated review${reviews.length === 1 ? '' : 's'} from your last scan.
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