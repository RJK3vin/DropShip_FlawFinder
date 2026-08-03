# DropShip FlawFinder

A Chrome extension that finds product weaknesses from low-star reviews
and turns them into ad hooks — for e-commerce sellers and dropshippers.

## What it does

Visit any product listing on Amazon, Etsy, or TikTok Shop, click
**Analyze Flaws**, and it:

1. Scrapes the 1-3 star reviews on that page
2. Clusters them into named recurring defects (e.g. "strap breaks
   easily — mentioned in 34% of negative reviews")
3. Generates a ready-to-use marketing ad hook for each one

All AI processing runs **on-device** via Chrome's built-in Gemini Nano
model — no API keys, no per-scan cost, nothing sent to a server.

## Why it matters

- **Free-tier + Stripe subscription model**: 3 scans/day free, $9/mo
  unlimited, with self-service cancellation via Stripe's Customer Portal
- **Genuinely minimal backend**: the only server-side code in the whole
  product is one small Cloudflare Worker, used purely to verify payments
- **Multi-site scraping done properly**: Amazon, Etsy, and TikTok Shop
  each needed a fundamentally different DOM extraction strategy — see
  `content-scripts/site-configs.js` for the reasoning

## How to use it

1. Install **DropShip FlawFinder** from the [Chrome Web Store](#)
2. Pin it to your toolbar (optional, but handy)
3. Visit any product page on Amazon, Etsy, or TikTok Shop
4. Use the site's own star filter to show only 1–3 star reviews
5. Click the **Analyze Flaws** button that appears on the page
6. Click the extension icon to see the results and generate ad hooks

That's it — no account required for the free tier (3 scans/day).
Unlimited scans are $9/mo via Stripe, cancel anytime.

## Tech stack

Vanilla JavaScript, HTML, CSS — no framework. Chrome's built-in Prompt
API for on-device AI. Cloudflare Workers + KV for the paywall backend.
Stripe for payments.