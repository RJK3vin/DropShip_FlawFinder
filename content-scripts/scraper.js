const siteConfig = getCurrentSiteConfig();

if (siteConfig) {
    injectAnalyzeButton();
    const observer = new MutationObserver(() => injectAnalyzeButton());
    observer.observe(document.body, { childList: true, subtree: true });
}

function injectAnalyzeButton() {
    if (document.getElementById('flawfinder-btn')) return;

    const button = document.createElement('button');
    button.id = 'flawfinder-btn';
    button.textContent = '🔍 Analyze Flaws';

    Object.assign(button.style, {
        position: 'fixed',
        bottom: '20px',
        right: '20px',
        zIndex: '999999',
        padding: '12px 18px',
        backgroundColor: '#2563eb',
        color: '#ffffff',
        border: 'none',
        borderRadius: '8px',
        cursor: 'pointer',
        fontWeight: 'bold',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
    });

    button.addEventListener('click', handleAnalyzeClick);
    document.body.appendChild(button);
}

function handleAnalyzeClick() {
    const reviews = scrapeReviews(siteConfig);
    const negativeReviews = reviews.filter(r => r.rating !== null && r.rating <= 3);

    console.log(`[FlawFinder] Found ${reviews.length} total reviews on page.`);
    console.log(`[FlawFinder] ${negativeReviews.length} are 1-3 star reviews:`, negativeReviews);

    chrome.storage.local.set({ flawfinder_lastScan: negativeReviews });
}

function scrapeReviews(config) {
    const containers = getReviewContainers(config);

    return containers.map(container => {
        const textEl = container.querySelector(config.text);
        const ratingEl = container.querySelector(config.rating);
        const dateEl = container.querySelector(config.date);

        return {
            text: textEl ? textEl.textContent.trim() : '',
            rating: config.parseRating(ratingEl),
            date: dateEl ? dateEl.textContent.trim() : ''
        };
    });
}

function getReviewContainers(config) {
    if (config.findContainers) {
        
        return config.findContainers(document);
    }

    return Array.from(document.querySelectorAll(config.container));
}