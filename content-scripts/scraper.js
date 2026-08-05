const FREE_DAILY_SCAN_LIMIT = 3;

const STRIPE_PAYMENT_LINK_URL = 'https://buy.stripe.com/aFafZg1Rn5ko4518tw43S00'


document.addEventListener('click', (event) => { // Listens for click events to prevent site scripts from blocking the button click.
    if (event.target && event.target.id === 'flawfinder-btn') {
        event.preventDefault();
        event.stopPropagation();
        handleAnalyzeClick();
    }
}, true);
 
const siteConfig = getCurrentSiteConfig(); 
 
if (siteConfig) { 
    injectAnalyzeButton();
    
    const observer = new MutationObserver(() => { // The observer ensures floating button stays injected if the DOM changes
        if (!document.getElementById('flawfinder-btn')) {
            injectAnalyzeButton();
        }
    });
    
    observer.observe(document.body, { childList: true, subtree: true }); // Detecting when dynamic content loads on a page
}
 
function injectAnalyzeButton() { // adds a custom button if it doesn't exist
    if (document.getElementById('flawfinder-btn')) return; // checks if button is already on page
    
    const button = document.createElement('button'); // create new html buttom 
    button.id = 'flawfinder-btn';
    button.textContent = '🔍 Analyze Flaws';
    
    button.className = 'ff-btn';
    
    document.body.appendChild(button); // puts finished button onto main body of web page
}
 
async function handleAnalyzeClick() {
    console.log('[FlawFinder] Button clicked!');
    
    const scanCheck = await checkAndIncrementScanCount();
    
    if (!scanCheck.allowed) {
        showToast(
            `You've used all ${FREE_DAILY_SCAN_LIMIT} free scans today. ` +
            `<a href="${STRIPE_PAYMENT_LINK_URL}" target="_blank">Upgrade for unlimited →</a>`,
            { persistent: true }
        );
        return;
    } // if used all free scans show toast to upgrade
 
    const currentConfig = getCurrentSiteConfig();
    if (!currentConfig) {
        console.error('[FlawFinder] No site config matched current URL.');
        return;
    } // wrong website
    
    const reviews = scrapeReviews(currentConfig); // scrape reviews from current page
    const negativeReviews = reviews.filter(r => r.rating !== null && r.rating <= 3); // keep only 1-3 ratings
    
    console.log(`[FlawFinder] Found ${reviews.length} total reviews on page.`);
    console.log(`[FlawFinder] All Scraped Reviews:`, reviews);
    console.log(`[FlawFinder] Found ${negativeReviews.length} negative reviews (1-3 stars):`, negativeReviews);
    
    chrome.storage.local.set({ flawfinder_lastScan: negativeReviews }); // stores previous scan in chrome storage
    
    const remainingNote = scanCheck.subscribed
        ? ''
        : ` (${scanCheck.remaining} free scan${scanCheck.remaining === 1 ? '' : 's'} left today)`; // display remaining scans or nothing is subscribed (unlimited scans)
    
    showToast( // show ... scraped and instructions to view reviews. 
        negativeReviews.length > 0
        ? `✅ Found ${reviews.length} reviews — ${negativeReviews.length} are 1-3★. Click the extension icon to view.${remainingNote}`
        : `✅ Scanned ${reviews.length} reviews — none currently loaded are 1-3★.${remainingNote}` // if there's no 1-3 star reviews scraped
    );
}
 
async function checkAndIncrementScanCount() {
    const stored = await chrome.storage.local.get([
        'flawfinder_scanState',
        'flawfinder_subscribed'
    ]); // fetches data from browser storage (those 2 values)
    
    if (stored.flawfinder_subscribed) {
        return { allowed: true, remaining: Infinity, subscribed: true };
    } // returns true if user is subscribed
    
    const today = new Date().toISOString().split('T')[0]; // todays date
    const scanState = stored.flawfinder_scanState; // retrieves saved scan data
    
    const currentCount = (scanState && scanState.date === today) ? scanState.count : 0;
    // does scanState exist, is the date saved in scanState same as todays date
    // if yes current count is scanState, if not its 0 bc its a new day
    
    if (currentCount >= FREE_DAILY_SCAN_LIMIT) {
        return { allowed: false, remaining: 0, subscribed: false };
    } // no more scans allowed if scanned more than 3
    
    const newCount = currentCount + 1; // scan count increase
    await chrome.storage.local.set({
        flawfinder_scanState: { date: today, count: newCount }
    }); // set the object to new count
    
    return {
        allowed: true,
        remaining: FREE_DAILY_SCAN_LIMIT - newCount,
        subscribed: false
    }; // user has ... scans left so they can keep going
}
 
function showToast(message, options = {}) {
    const { persistent = false } = options;
    let toast = document.getElementById('flawfinder-toast');
    
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'flawfinder-toast';
    
        toast.className = 'ff-toast';
    
        document.body.appendChild(toast);
    } // add toast if non already to body of webpage 
    
    toast.innerHTML = `
        ${message}
        <span id="flawfinder-toast-close" class="ff-toast-close">✕</span>
    `; // display message
    
    document.getElementById('flawfinder-toast-close').addEventListener('click', () => {
        toast.style.opacity = '0';
        if (toast._hideTimeout) clearTimeout(toast._hideTimeout);
    }); // waits for user to close toast noti and disappear and stop timer to hide the box automatically, so it does not run twice
    
    if (toast._hideTimeout) clearTimeout(toast._hideTimeout); // stops count down so it doesn't disappear
    // check if timer to hide toast is running
    requestAnimationFrame(() => { toast.style.opacity = '1'; }); // ensure the opacity change to 1 happens on the next render cycle
    
    if (!persistent) {
        toast._hideTimeout = setTimeout(() => {
            toast.style.opacity = '0';
        }, 6000);
    } // if persistent is false set a timer to set opacity to 0
}
 
function scrapeReviews(config) {
    if (config.extractionStrategy === 'zip') {
        return scrapeByZip(config);
    }
    return scrapeByContainer(config);
} // decide which strategy to use
 
function scrapeByContainer(config) { // amazon and etsy
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
    }); // Queries each review container node and scopes text, rating, and date selection inside that specific container node.
}
 
function scrapeByZip(config) { // tiktok
    // This code finds all web page elements that match a CSS selector and turns them into a real JavaScript array
    const ratingEls = Array.from(document.querySelectorAll(config.ratingSelector)); 
    const textEls = Array.from(document.querySelectorAll(config.textSelector));
    const dateEls = Array.from(document.querySelectorAll(config.dateSelector));
    
    const tagged = [
        // change into new object
        ...ratingEls.map(el => ({ type: 'rating', el })), 
        ...textEls.map(el => ({ type: 'text', el })),
        ...dateEls.map(el => ({ type: 'date', el }))
    ]; // joines 3 arrays into one big array
    
    tagged.sort((a, b) => {
        const position = a.el.compareDocumentPosition(b.el); // built-in DOM method that tells you how two HTML elements are positioned relative to each other in the document
        if (position & Node.DOCUMENT_POSITION_FOLLOWING) return -1; // if a comes before b
        if (position & Node.DOCUMENT_POSITION_PRECEDING) return 1; // if a comes after b
        return 0; // same position
    });
    
    const reviews = [];
    let current = null;
    
    for (const { type, el } of tagged) { // loop thru everything { type: 'rating', el: rating1 }
        if (type === 'rating') { // finds rating
            current = { 
                text: '', 
                rating: config.parseRating(el), 
                date: '' 
            }; // creates new review
            reviews.push(current);
        } else if (current) { // if next element is review text
            if (type === 'text') current.text = el.textContent.trim();
            if (type === 'date') current.date = el.textContent.trim();
        } // add that to current review
    }
    
    return reviews;
}