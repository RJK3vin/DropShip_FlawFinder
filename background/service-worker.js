// Handles local AI processing

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => { // listens for msgs from popup or scraper
    if (message.type === 'ANALYZE_REVIEWS') {
        analyzeReviews(message.reviews)
        .then(result => sendResponse({ success: true, data: result }))
        .catch(error => sendResponse({ success: false, error: error.message }));
        return true;
    } // send reponse will be called asynchronously after the promise completes 
});

async function analyzeReviews(reviews) {
    await ensureModelAvailable(); // is Gemini Nano supported and ready on device

    const session = await LanguageModel.create(); // initialize AI session

    try {
        const defects = await clusterDefects(session, reviews); // group low-star reviews into common product flaws
        const withHooks = await generateAdHooks(session, defects); // create marketing copy fixing those flaws
        return withHooks;
    } finally {
        session.destroy(); // guarantees local AI session memory is freed
    }
}

async function ensureModelAvailable() { // checks if browser or device supports Gemini Nano
    if (typeof LanguageModel === 'undefined') { // Checks to see if an AI feature is supported by the web browser
        throw new Error( // throw error if not available in this browser
            'Gemini Nano is not available in this browser. Requires a recent ' +
            'version of Chrome with the built-in AI model enabled.'
        );
    }

    const availability = await LanguageModel.availability(); // asks your browser or device if the local AI model can be used right now
    const unavailableValues = ['no', 'unavailable'];

    if (unavailableValues.includes(availability)) { // if not throw error
        throw new Error(
            'Gemini Nano is unavailable on this device (unsupported hardware ' +
            'or not enough free storage for the model).'
        );
    }
}

async function clusterDefects(session, reviews) {
    const reviewText = reviews // Ex: 1. (2★) Zipper snapped on day 2
        .map((r, i) => `${i + 1}. (${r.rating}★) ${r.text}`)
        .filter(line => line.trim().length > 0)
        .join('\n');

    const schema = { // forces Gemini Nano to return JSON stricly to this structure
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

    const result = await session.prompt(prompt, { responseConstraint: schema }); // sends prompt to AI session with strict output rules
    return JSON.parse(result); // Used to instantly convert that text string into a native JavaScript object or array
}

async function generateAdHooks(session, defects) {
    const results = [];

    for (const defect of defects) { // goes thru each extracted defect
        const prompt = `A competing product has this common customer
    complaint: "${defect.defect}" (example customer quote: "${defect.examplePhrase}").

    Write one short, punchy marketing hook (under 20 words) for a TikTok/
    Meta ad that positions OUR product as having fixed this exact flaw.
    Respond with ONLY the hook text, no quotation marks, no preamble.`;

        const adHook = await session.prompt(prompt); // prompts AI to send prompt to generate marketing hooks

        results.push({ // add new item to array
        ...defect, // copy everything from defect object into this new one
        adHook: adHook.trim() // Overrides adHook property or adds if it doesn't exist and cleans up leading and trailing whitespace
        }); 
    }

    return results;
}