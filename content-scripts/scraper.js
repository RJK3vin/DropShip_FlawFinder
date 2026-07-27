document.addEventListener('click', (event) => {
    if (event.target && event.target.id === 'flawfinder-btn') {
        event.preventDefault();
        event.stopPropagation();
        handleAnalyzeClick();
    }
}, true);

const siteConfig = getCurrentSiteConfig();

if (siteConfig) {
    injectAnalyzeButton();

    const observer = new MutationObserver(() => {
        if (!document.getElementById('flawfinder-btn')) {
            injectAnalyzeButton();
        }
    });

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
        zIndex: '2147483647', 
        padding: '12px 18px',
        backgroundColor: '#2563eb',
        color: '#ffffff',
        border: 'none',
        borderRadius: '8px',
        cursor: 'pointer',
        fontWeight: 'bold',
        boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
        pointerEvents: 'auto' 
    });

    document.body.appendChild(button);
}

function handleAnalyzeClick() {
    console.log('[FlawFinder] Button clicked!');
    
    const currentConfig = getCurrentSiteConfig();
    if (!currentConfig) {
        console.error('[FlawFinder] No site config matched current URL.');
        return;
    }

    const reviews = scrapeReviews(currentConfig);
    const negativeReviews = reviews.filter(r => r.rating !== null && r.rating <= 3);

    console.log(`[FlawFinder] Found ${reviews.length} total reviews on page.`);
    console.log(`[FlawFinder] All Scraped Reviews:`, reviews);
    console.log(`[FlawFinder] Found ${negativeReviews.length} negative reviews (1-3 stars):`, negativeReviews);

    chrome.storage.local.set({ flawfinder_lastScan: negativeReviews });

    showToast(
        negativeReviews.length > 0
        ? `✅ Found ${reviews.length} reviews — ${negativeReviews.length} are 1-3★. Click the extension icon to view.`
        : `✅ Scanned ${reviews.length} reviews — none currently loaded are 1-3★.`
    );
}

function showToast(message) {
    let toast = document.getElementById('flawfinder-toast');
    
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'flawfinder-toast';
    
        Object.assign(toast.style, {
        position: 'fixed',
        bottom: '78px',
        right: '20px',
        zIndex: '2147483647',
        maxWidth: '280px',
        padding: '10px 14px',
        backgroundColor: '#1e293b',
        color: '#ffffff',
        borderRadius: '8px',
        fontSize: '13px',
        lineHeight: '1.4',
        boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
        transition: 'opacity 0.3s ease',
        opacity: '0'
        });
    
        document.body.appendChild(toast);
    }
    
    toast.textContent = message;
    
    if (toast._hideTimeout) clearTimeout(toast._hideTimeout);
    
    requestAnimationFrame(() => { toast.style.opacity = '1'; });
    
    toast._hideTimeout = setTimeout(() => {
        toast.style.opacity = '0';
    }, 4000);
}

function scrapeReviews(config) {
    if (config.extractionStrategy === 'zip') {
        return scrapeByZip(config);
    }
    return scrapeByContainer(config);
}

function scrapeByContainer(config) {
    const containers = Array.from(document.querySelectorAll(config.container));

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

function scrapeByZip(config) {
    const ratingEls = Array.from(document.querySelectorAll(config.ratingSelector));
    const textEls = Array.from(document.querySelectorAll(config.textSelector));
    const dateEls = Array.from(document.querySelectorAll(config.dateSelector));

    const tagged = [
        ...ratingEls.map(el => ({ type: 'rating', el })),
        ...textEls.map(el => ({ type: 'text', el })),
        ...dateEls.map(el => ({ type: 'date', el }))
    ];

    tagged.sort((a, b) => {
        const position = a.el.compareDocumentPosition(b.el);
        if (position & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
        if (position & Node.DOCUMENT_POSITION_PRECEDING) return 1;
        return 0;
    });

    const reviews = [];
    let current = null;

    for (const { type, el } of tagged) {
        if (type === 'rating') {
            current = { text: '', rating: config.parseRating(el), date: '' };
            reviews.push(current);
        } else if (current) {
            if (type === 'text') current.text = el.textContent.trim();
            if (type === 'date') current.date = el.textContent.trim();
        }
    }
    return reviews;
}