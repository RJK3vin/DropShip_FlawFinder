const contentEl = document.getElementById('content');

chrome.storage.local.get('flawfinder_lastScan', (result) => {
    const reviews = result.flawfinder_lastScan;

    if (!reviews || reviews.length === 0) {
        renderEmptyState();
        return;
    }

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
    contentEl.innerHTML = summaryHtml + cardsHtml;
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