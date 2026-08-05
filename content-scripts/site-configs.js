// where to find review text, star ratings, and dates on each platform

const SITE_CONFIGS = {
    amazon: {
        name: 'Amazon',
        hostname: 'amazon.com',
        extractionStrategy: 'container',
        container: '[data-hook="review"]',
        text: '[data-hook="review-body"] span',
        rating: '[data-hook="review-star-rating"]',
        date: '[data-hook="review-date"]',

        parseRating(el) {
        if (!el) return null;
            const match = el.textContent.match(/([\d.]+)\s+out of/);
            return match ? parseFloat(match[1]) : null;
        } // extract numeric rating and convert to float
    },

    etsy: {
        name: 'Etsy',
        hostname: 'etsy.com',
        extractionStrategy: 'container',
        container: '[data-review-region]',
        text: 'p.wt-break-word, div.wt-text-body',
        rating: 'input[name="rating"], [role="img"][aria-label*="out of 5"], [role="img"][aria-label*="Rating"], [aria-label*="stars"]',
        date: 'p.wt-text-body-small span, span.wt-text-body-small--tight',

        parseRating(el) { // 2 different etsy rating renders
        if (!el) return null;

        if (el.tagName === 'INPUT') { // <input value="1">
            const val = parseFloat(el.value);
            return Number.isNaN(val) ? null : val;
        }

        const label = el.getAttribute('aria-label') || ''; // aria-label="1 out of 5 stars"
        const match = label.match(/([\d.]+)\s+out of/i);
        return match ? parseFloat(match[1]) : null;
        }
    },

    tiktok: {
        name: 'TikTok Shop',
        hostname: 'shop.tiktok.com',
        extractionStrategy: 'zip',
        ratingSelector: '#pdp-review-section [role="img"][aria-label*="Rating"]',
        textSelector: '#pdp-review-section .H4-Regular.text-color-UIText1',
        dateSelector: '#pdp-review-section .H4-Regular.text-color-UIText3',

        parseRating(el) {
            if (!el) return null;
            const label = el.getAttribute('aria-label') || '';
            const match = label.match(/([\d.]+)\s+out of/);
            return match ? parseFloat(match[1]) : null;
        }  // aria-label="1 out of 5 stars"
    }
};

function getCurrentSiteConfig() { 
    const hostname = window.location.hostname; // Inspects window.location.hostname of the page the browser is currently viewing
    return Object.values(SITE_CONFIGS).find(config => // matches domain against SITE_CONFIGS and returns the relevant configuration object
        hostname.includes(config.hostname)
    );
}