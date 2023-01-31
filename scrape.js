
import { Parser } from 'csv-parse';
import { appendFileSync, createReadStream, existsSync, writeFileSync } from 'fs';
import { PlaywrightCrawler } from 'crawlee';


// The Function is used to save the data scraped into the csv.
function saveData(
    {
        barcode = "",
        part_number = "",
        title = "",
        description = "",
        brand = "None",
        specs = "",
        platform = "None",
        image1 = "",
        image2 = "",
        image3 = "",
    }
) {
    title = clean(title);
    description = clean(description);
    specs = clean(specs);
    const csv = `${barcode}, ${part_number}, ${title}, ${description}, ${specs}, ${brand}, ${platform}, ${image1}, ${image2}, ${image3}\n`;
    appendFileSync("./results.csv", csv);
}

// Selectors Used for Scraping The contents of the final page.
let Selectors = {
    description_expand: ".sh-ds__full-txt",
    description_trunc: ".sh-ds__trunc-txt",
    spec: ".KgL16d",
    title: ".sh-t__title",
    expand_btn: ".sh-ds__toggle",
    expand_images_btn: ".mba6of",
    extended_images: "img.sh-div__image"
}


const scrape_data_from_product = new PlaywrightCrawler({
    requestHandler: async ({ page, request }) => {
        // Extract The Title.
        let title;
        await page.waitForSelector(Selectors.title);
        await page.locator(Selectors.title).innerText().then((val) => { title = val; });

        // Extract The Description.
        let description;
        try {
            // Case when "Expand" button is in the page.
            await page.click(Selectors.expand_btn);
            await page.locator(Selectors.description_expand).textContent().then((val) => { description = val; })
        } catch (error) {
            // When the page doesn't have an expand button.
            await page.locator(Selectors.description_trunc).textContent().then((val) => { description = val; });
        }

        // Extract The Specs
        let specs;
        await page.waitForSelector(Selectors.spec);
        await page.locator(Selectors.spec).allInnerTexts().then((val) => { specs = val; });
        // The Specs are joined together by a hyphen, we can change that by changing
        // the string in the join -------->|<--------- There!
        specs = [...new Set(specs)].join(" - ")

        // Extract Images
        let images = []

        // If the first method doesn't work then try the old top-3 image method.
        // try {
        // page.click(Selectors.expand_images_btn);
        let imgs = await page.$$eval(Selectors.extended_images, imgs => imgs.map(img => img.src));
        console.log(imgs)
        // }
        // catch (err) {
        //     let imgs = await page.$$eval('img', imgs => imgs.map(img => img.src));
        //     // First Three images that include this url are the images of the product.
        //     for (const image of imgs) {
        //         if (image.includes("gstatic.com/shopping?q=tbn:"))
        //             images.push(image)
        //         if (images.length == 3)
        //             break;
        //     }
        // }
        // Save The Data.
        saveData(
            {
                barcode: request.url.split("=")[1],
                title: title,
                description: description,
                specs: specs,
                image1: images[0],
                image2: images[1],
                image3: images[2]
            }
        );
    }
});


let products_urls = [];
const scrape_first_url = new PlaywrightCrawler({
    async requestHandler({ page, request }) {
        // to skip The cookies page.
        await page.click("button")
        // Get the barcode, to put it in the url.
        // it is not necessary but it is used later in the saving the data to the csv.
        let barcode = request.url.split("?")[1];
        barcode = barcode.split("&")[0]
        await sleep(1000)
        // This Regex matches the url we are looking for.
        // We just take the first link that matches this pattern.
        const regex = RegExp(/\/shopping\/product\/\d+/gm);
        await page.content().then((val) => {
            let res = regex.exec(val);
            products_urls.push(`https://google.com/${res[0]}?${barcode}`)
        })
    },
});


function scrape(barcodes) {
    // Creates The Urls of the searches.
    let urls = [];
    for (let barcode of barcodes) {
        urls.push(`https://google.com/search?q=${barcode}&tbm=shop`)
    }
    // Get The first url.
    scrape_first_url.addRequests(urls);
    scrape_first_url.run().then(
        (stats) => {
            // Scrape the data of the actual products.
            scrape_data_from_product.addRequests(products_urls)
            scrape_data_from_product.run();
        }
    );
}

// Get The Barcodes from the csv file.
// and start the scraping process.
let barcodes = []
createReadStream("./data.csv")
    .pipe(new Parser())
    .on('data', (row) => {
        if (row[0] == "Barcode")
            return;
        barcodes.push(row[0])
    })
    .on('end', () => {
        scrape(barcodes)
    });


// Create the results csv file, If it didn't already exist.
if (!existsSync("./results.csv"))
    writeFileSync("./results.csv", "Barcode, Part Number, Title, Description, Spec, Brand, Platform, Image 1, Image 2, Image 3\n")


function sleep(ms) {
    return new Promise((val) => setTimeout(val, ms));
}
function clean(txt) {
    return txt.replaceAll(",", " ")
}