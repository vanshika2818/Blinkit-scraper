// --- 1. Import our libraries ---
const express = require('express');
const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs'); 

// --- 2. Create the Express App ---
const app = express();
const PORT = 3000; // We'll run our server on port 3000

// --- 3. Serve Static Files ---
app.use(express.static(path.join(__dirname, '.')));


// --- 4. The Main Scraping API Endpoint ---
app.get('/api/get-products', async (req, res) => {
    const { pincode } = req.query; 

    if (!pincode) {
        return res.status(400).json({ error: 'Pincode is required' });
    }

    console.log(`Starting scrape for pincode: ${pincode}...`);

    try {
        const data = await scrapeBlinkit(pincode);
        console.log("Scrape successful. Sending data to frontend.");
        res.json(data);
    } catch (error) {
        console.error("Scraping failed:", error);
        res.status(500).json({ error: 'Failed to scrape data. ' + error.message });
    }
});


// --- 5. The Main Scraping Function (The Hard Part) ---
async function scrapeBlinkit(pincode) {
    let browser = null; 

    try {
        // --- A. Launch the Browser (AUTOMATED MODE) ---
        console.log("Launching headless browser...");
        browser = await puppeteer.launch({
            headless: true, // Run invisibly
            args: ['--no-sandbox', '--disable-setuid-sandbox'] 
        });
        const page = await browser.newPage();
        
        // Set a realistic user agent
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
        
        // --- B. Go to Blinkit ---
        console.log("Navigating to Blinkit.com...");
        await page.goto('https://blinkit.com/', { waitUntil: 'networkidle2', timeout: 60000 });

        // --- C. Handle the "Download App" Modal ---
        try {
            console.log("Looking for 'Continue on web' button...");
            const continueButtonSelector = 'div[class*="DownloadAppModal__ContinueLink"]';
            await page.waitForSelector(continueButtonSelector, { timeout: 10000 }); 
            console.log("'Continue on web' button found. Clicking it.");
            await page.click(continueButtonSelector);
            await new Promise(r => setTimeout(r, 2000)); 
            console.log("Modal closed. Looking for second modal.");
        } catch (err) {
            console.log("No 'Download App' modal found, continuing...");
        }

        // --- D. Handle the "Detect Location" Modal ---
        try {
            console.log("Looking for 'Select manually' button...");
            const selectManuallySelector = 'div[class*="GetLocationModal__SelectManually"]';
            await page.waitForSelector(selectManuallySelector, { timeout: 5000 });
            console.log("'Select manually' button found. Clicking it.");
            await page.click(selectManuallySelector);
            await new Promise(r => setTimeout(r, 2000));
            console.log("'Select manually' clicked. Proceeding to find location input.");
        } catch (err) {
             console.log("No 'Select manually' button found, continuing...");
        }
        
        // --- E. Set the Location ---
        console.log("Looking for location input...");
        const LOCATION_INPUT_SELECTOR = 'input[placeholder="search delivery location"]'; 
        const LOCATION_DROPDOWN_ITEM_SELECTOR = 'div[class*="LocationSearchList__LocationListContainer"]';
        await page.waitForSelector(LOCATION_INPUT_SELECTOR, { timeout: 10000 });
        await page.type(LOCATION_INPUT_SELECTOR, pincode);
        console.log(`Pincode ${pincode} typed. Waiting for dropdown...`);
        await page.waitForSelector(LOCATION_DROPDOWN_ITEM_SELECTOR, { timeout: 10000 });
        await page.click(LOCATION_DROPDOWN_ITEM_SELECTOR);
        console.log("Location set. Waiting for page to load...");
        await new Promise(r => setTimeout(r, 2000)); // Wait for page to settle

        // --- F. Navigate to Search Page ---
        console.log("Looking for main search bar *link*...");
        const MAIN_SEARCH_LINK_SELECTOR = 'a[class*="SearchBar__Button"]'; 
        await page.waitForSelector(MAIN_SEARCH_LINK_SELECTOR, { timeout: 10000 });
        
        console.log("Search link found. Clicking and waiting for search page...");
        await page.click(MAIN_SEARCH_LINK_SELECTOR);
        
        // --- G. THIS IS THE FIX ---
        // We must add a small, dumb pause here for the JS page transition to begin
        console.log("Waiting 3 seconds for search page to load...");
        await new Promise(r => setTimeout(r, 3000));
        
        // --- H. Find the REAL Search Input ---
        // Now we wait for the input bar, which we know is correct.
        const REAL_SEARCH_INPUT_SELECTOR = 'input[class*="SearchBarContainer__Input"]'; 
        await page.waitForSelector(REAL_SEARCH_INPUT_SELECTOR, { timeout: 30000 });
        console.log("Real search input found. Starting searches.");

        // --- I. Scrape Both Terms ---
        const headphones = await scrapeSearchTerm(page, "headphones", REAL_SEARCH_INPUT_SELECTOR);
        const earbuds = await scrapeSearchTerm(page, "earbuds", REAL_SEARCH_INPUT_SELECTOR);

        return { headphones, earbuds };

    } catch (error) {
        throw new Error(`Puppeteer error: ${error.message}`);
    } finally {
        // --- J. Always Close the Browser ---
        if (browser) {
            console.log("Closing browser.");
            await browser.close();
        }
    }
}


// --- 6. Helper Function to Scrape a Search Term ---
async function scrapeSearchTerm(page, searchTerm, SEARCH_INPUT_SELECTOR) {
    console.log(`Searching for "${searchTerm}"...`);
    
    await page.waitForSelector(SEARCH_INPUT_SELECTOR);
    await page.click(SEARCH_INPUT_SELECTOR, { clickCount: 3 }); 
    await page.type(SEARCH_INPUT_SELECTOR, searchTerm);
    await page.keyboard.press('Enter');

    console.log(`Search submitted for "${searchTerm}". Waiting for results...`);

    // Selector 4: The Product Card (Updated to be more specific)
    const PRODUCT_CARD_SELECTOR = 'div[role="button"][class][id]';
    
    await page.waitForSelector(PRODUCT_CARD_SELECTOR, { timeout: 15000 }); // Increased to 15s
    
    console.log(`Results for "${searchTerm}" found. Extracting data...`);

    // --- F. Extract the Data ---
    const products = await page.evaluate((CARD_SELECTOR) => {
        const results = [];
        const productCards = document.querySelectorAll(CARD_SELECTOR);
        // Selectors 5 & 6: Product Name and Price
        const NAME_SELECTOR = '.tw-text-300.tw-font-semibold';
        const PRICE_SELECTOR = '.tw-text-200.tw-font-semibold';

        for (let i = 0; i < productCards.length; i++) {
            const card = productCards[i];
            const nameElement = card.querySelector(NAME_SELECTOR); 
            const priceElement = card.querySelector(PRICE_SELECTOR);
            const name = nameElement ? nameElement.innerText.trim() : 'Name not found';
            const price = priceElement ? priceElement.innerText.trim() : 'Price not found';

            if (name !== 'Name not found' && price !== 'Price not found') {
                results.push({ name, price });
            }
        }
        return results.slice(0, 10); // Return only the top 10
    }, PRODUCT_CARD_SELECTOR); 

    // --- LOGIC CHANGE ---
    // Instead of going back, clear the search bar for the next search
    console.log(`Finished scraping "${searchTerm}". Clearing input for next search.`);
    await page.click(SEARCH_INPUT_SELECTOR, { clickCount: 3 });
    await page.keyboard.press('Backspace');
    await new Promise(r => setTimeout(r, 1000)); // Wait a moment

    return products;
}


// --- 7. Start the Server ---
app.listen(PORT, () => {
    console.log(`Server is running at http://localhost:${PORT}`);
    console.log("Open this URL in your browser to use the app.");
});