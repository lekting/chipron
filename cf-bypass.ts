import fs from "fs";

import os from "os";
import path from "path";
import { v1 } from "uuid";

import Puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import { Browser } from "puppeteer";
import CFBypassResponse from "./interfaces/CFBypassResponse";

export default class cf_bypass {
    constructor() {
        Puppeteer.use(StealthPlugin());
    }

    private prepareBrowserProfile(userAgent: string) {
        const userDataDir = path.join(
            os.tmpdir(),
            "/puppeteer_firefox_profile_" + v1()
        );
        if (!fs.existsSync(userDataDir)) {
            fs.mkdirSync(userDataDir, { recursive: true });
        }
        const prefs = `user_pref("general.useragent.override", "${userAgent}");`;
        fs.writeFile(path.join(userDataDir, "prefs.js"), prefs, () => {});
        return userDataDir;
    }

    getCookies(params: any): Promise<CFBypassResponse> {
        let puppeteerOptions: any = {
            product: "chrome",
            headless: true,
            args: ["--no-sandbox"],
            userDataDir: "",
        };

        const startTimestamp = Date.now();
        const reqUserAgent = params["userAgent"];

        if (reqUserAgent) {
            puppeteerOptions["userDataDir"] =
                this.prepareBrowserProfile(reqUserAgent);
        }

        return new Promise((resolve) => {
            Puppeteer.launch(puppeteerOptions)
                .then(async (browser: Browser) => {
                    let data: CFBypassResponse;
                    try {
                        data = await this.resolveCallenge(
                            params,
                            browser,
                            startTimestamp
                        );
                    } catch (error) {
                    } finally {
                        await browser.close();
                    }
                    resolve(data);
                })
                .catch((error: any) => {
                    console.log(error);
                });
        });
    }

    async resolveCallenge(
        params: any,
        browser: Browser,
        startTimestamp: number
    ) {
        const page = await browser.newPage();
        //const userAgent = await page.evaluate(() => navigator.userAgent);
        const reqUrl = params["url"];
        const reqMaxTimeout = params["maxTimeout"] || 60000;
        const reqCookies = params["cookies"];

        if (reqCookies) {
            await page.setCookie(...reqCookies);
        }

        await page.goto(reqUrl, { waitUntil: "domcontentloaded" });

        // detect cloudflare
        const cloudflareRay = await page.$(".ray_id");
        if (cloudflareRay) {
            while (Date.now() - startTimestamp < reqMaxTimeout) {
                await page.waitForTimeout(1000);

                try {
                    // catch exception timeout in waitForNavigation
                    await page.waitForNavigation({
                        waitUntil: "domcontentloaded",
                        timeout: 5000,
                    });
                } catch (error) {}

                const cloudflareRay = await page.$(".ray_id");
                if (!cloudflareRay) break;
            }

            if (Date.now() - startTimestamp >= reqMaxTimeout) {
                return;
            }

            const html = await page.content();
            if (
                html.includes("captcha-bypass") ||
                html.includes("__cf_chl_captcha_tk__")
            ) {
                return;
            }
        }

        const url = page.url();
        const cookies = await page.cookies();
        const html = await page.content();

        const endTimestamp = Date.now();
        const response: CFBypassResponse = {
            status: "ok",
            startTimestamp: startTimestamp,
            endTimestamp: endTimestamp,
            solution: {
                url: url,
                response: html,
                cookies: cookies,
            },
        };

        await page.close();

        return response;
    }
}
