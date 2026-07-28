const FREE_DAILY_SCAN_LIMIT = 3;

const STRIPE_PAYMENT_LINK_URL = 'https://buy.stripe.com/test_9B600i2Nf2AEddZ8051wY00'


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

async function handleAnalyzeClick() {
    console.log('[FlawFinder] Button clicked!');
    
    const scanCheck = await checkAndIncrementScanCount();

    if (!scanCheck.allowed) {
        showToast(
            `You've used all ${FREE_DAILY_SCAN_LIMIT} free scans today. ` +
            `<a href="${STRIPE_PAYMENT_LINK_URL}" target="_blank" ` +
            `style="color:#93c5fd;text-decoration:underline;">Upgrade for unlimited →</a>`,
            { persistent: true }
        );
        return;
    }

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

    const remainingNote = scanCheck.subscribed
        ? ''
        : ` (${scanCheck.remaining} free scan${scanCheck.remaining === 1 ? '' : 's'} left today)`;

    showToast(
        negativeReviews.length > 0
        ? `✅ Found ${reviews.length} reviews — ${negativeReviews.length} are 1-3★. Click the extension icon to view.${remainingNote}`
        : `✅ Scanned ${reviews.length} reviews — none currently loaded are 1-3★.${remainingNote}`
    );
}

async function checkAndIncrementScanCount() {
    const stored = await chrome.storage.local.get([
        'flawfinder_scanState',
        'flawfinder_subscribed'
    ]);

    if (stored.flawfinder_subscribed) {
        return { allowed: true, remaining: Infinity, subscribed: true };
    }

    const today = new Date().toISOString().split('T')[0];
    const scanState = stored.flawfinder_scanState;

    const currentCount = (scanState && scanState.date === today) ? scanState.count : 0;

    if (currentCount >= FREE_DAILY_SCAN_LIMIT) {
        return { allowed: false, remaining: 0, subscribed: false };
    }

    const newCount = currentCount + 1;
    await chrome.storage.local.set({
        flawfinder_scanState: { date: today, count: newCount }
    });

    return {
        allowed: true, 
        remaining: FREE_DAILY_SCAN_LIMIT - newCount,
        subscribed: false
    };
}

function showToast(message, options = {}) {
    const { persistent = false } = options;
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
        padding: '10px 14px 10px 14px',
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
    
    toast.innerHTML = `
        ${message}
        <span id="flawfinder-toast-close" style="
            position: absolute; top: 6px; right: 10px;
            cursor: pointer; font-weight: bold; opacity: 0.7;
        ">✕</span>
    `;
    toast.style.position = 'fixed';

    document.getElementById('flawfinder-toast-close').addEventListener('click', () => {
        toast.style.opacity = '0';
        if (toast._hideTimeout) clearTimeout(toast._hideTimeout);
    });
 
    if (toast._hideTimeout) clearTimeout(toast._hideTimeout);
 
    requestAnimationFrame(() => { toast.style.opacity = '1'; });
 
    if (!persistent) {
        toast._hideTimeout = setTimeout(() => {
            toast.style.opacity = '0';
        }, 6000);
    }
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