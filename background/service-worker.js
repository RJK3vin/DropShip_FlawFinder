chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'ANALYZE_REVIEWS') {
        analyzeReviews(message.reviews)
        .then(result => sendResponse({ success: true, data: result }))
        .catch(error => sendResponse({ success: false, error: error.message }));
        return true;
    }
});

async function analyzeReviews(reviews) {
    await ensureModelAvailable();

    const session = await LanguageModel.create();

    try {
        const defects = await clusterDefects(session, reviews);
        const withHooks = await generateAdHooks(session, defects);
        return withHooks;
    } finally {
        session.destroy();
    }
}

async function ensureModelAvailable() {
    if (typeof LanguageModel === 'undefined') {
        throw new Error(
            'Gemini Nano is not available in this browser. Requires a recent ' +
            'version of Chrome with the built-in AI model enabled.'
        );
    }

    const availability = await LanguageModel.availability();
    const unavailableValues = ['no', 'unavailable'];

    if (unavailableValues.includes(availability)) {
        throw new Error(
            'Gemini Nano is unavailable on this device (unsupported hardware ' +
            'or not enough free storage for the model).'
        );
    }
}

async function clusterDefects(session, reviews) {
    const reviewText = reviews
        .map((r, i) => `${i + 1}. (${r.rating}★) ${r.text}`)
        .filter(line => line.trim().length > 0)
        .join('\n');

    const schema = {
        type: 'array',
        items: {
            type: 'object',
            required: ['defect', 'mentionCount', 'examplePhrase'],
            properties: {
                defect: { type: 'string' },
                mentionCount: { type: 'number' },
                examplePhrase: { type: 'string' }
            }
        }
    };

    const prompt = `You are analyzing customer reviews for an e-commerce
    product to find recurring product defects. Below are the 1-3 star
    reviews for this product.

    Identify the 3-5 most commonly mentioned distinct physical/product
    defects. For each one, estimate how many of the reviews below mention
    it (mentionCount), and pull one short representative phrase from the
    reviews (examplePhrase, under 15 words).

    Reviews:
    ${reviewText}`;

    const result = await session.prompt(prompt, { responseConstraint: schema });
    return JSON.parse(result);
}

async function generateAdHooks(session, defects) {
    const results = [];

    for (const defect of defects) {
        const prompt = `A competing product has this common customer
    complaint: "${defect.defect}" (example customer quote: "${defect.examplePhrase}").

    Write one short, punchy marketing hook (under 20 words) for a TikTok/
    Meta ad that positions OUR product as having fixed this exact flaw.
    Respond with ONLY the hook text, no quotation marks, no preamble.`;

        const adHook = await session.prompt(prompt);

        results.push({
        ...defect,
        adHook: adHook.trim()
        });
    }

    return results;
}