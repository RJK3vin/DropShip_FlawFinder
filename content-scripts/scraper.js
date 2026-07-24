const siteConfig = getCurrentSiteConfig();

if (siteConfig) {
    injectAnalyzeButton();

    const observer = new MutationObserver (() => injectAnalyzeButton());
    observer.observe(document.body, { childList: true, subtree: true });
}

function injectAnalyzeButton() {
    if (document.getElementById('flawfinder-btn')) return;

    const button = document.createElement('button');
    button.id = 'flawfinder-btn';
    button.textContent = '🔍 Analyze Flaws';
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
        const textE1 = container.querySelector(config.text);
        const ratingE1 = container.querySelector(config.rating);
        const dateE1 = container.querySelector(config.date);
    
        return {
            text: textE1 ? textE1.textContent.trim() : '',
            rating: config.parseRating(ratingE1),
            date: dateE1 ? dateE1.textContent.trim() : ''
        };
    });
}

function getReviewContainers(config) {
    if (config.findContainers) {
        return config.findContainers(document);
    }

    return Array.from(document.querySelectorAll(config.container));
}