const SITE_CONFIGS = {
    amazon: {
        name: 'Amazon',
        hostname: 'amazon.com',
        container: '[data-hook="review"]',
        text: '[data-hook="review-body"] span',
        rating: '[data-hook="review-star-rating"]',
        date: '[data-hook="review-date"]',

        parseRating(e1) {
            if (!e1) return null;
            const match = e1.textContent.match(/([\d.]+)\s+out of/);
            return match ? parseFloat(match[1]) : null;
        }
    },

    etsy: {
        name: 'Etsy',
        hostname: 'etsy.com',
        container: '[data-review-region]',
        text: 'p.wt-break-word',
        rating: '[data-stars-svg-container] input[name="rating"]',
        date: 'p.wt-text-body-small span',

        parseRating(e1) {
            if (!e1) return null;
            const value = parseFloat(e1.value);
            return Number.isNaN(value) ? null : value;
        }
    },

    tiktok: {
        name: 'TikTok Shop',
        hostname: 'shop.tiktok.com',
        text: '.H4-Regular.text-color-UIText1',
        rating: '[role="img"][aria-label*="Rating"]',
        date: '.H4-Regular.text-color-UIText3',

        parseRating(e1) {
            if (!e1) return null;
            const label = e1.getAttribute('aria-label') || '';
            const match = label.match(/([\d.]+)\s+out of/);
            return match ? parseFloat(match[1]) : null;
        },

        findContainers(root) {
            const ratingEls = root.querySelectorAll('[role="img"][aria-label*="Rating"]');
            const containers = Array.from(ratingEls)
                .map(el => el.closest('.relative'))
                .filter(Boolean);
            return Array.from(new Set(containers));
        }
    }
};

function getCurrentSiteConfig() {
    const hostname = window.location.hostname;
    return Object.values(SITE_CONFIGS).find(config =>
        hostname.includes(config.hostname)
    );
}