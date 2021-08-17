import pretty from "pretty";
import cf_bypass from "../cf-bypass";

import { readPsd, writePsdBuffer } from "ag-psd";
import { createCanvas, loadImage } from "canvas";
import * as fs from "fs";
import ParseModule from "./ParseModule";
import ParsedObject from "../interfaces/IParseObject";

interface ITranslators {
    id: number;
    translatorId: number;
}

interface ICountry {
    name: string;
    flag: string;
}

export default class rezka extends ParseModule {
    private allowedTranslators = [
        56, //Дубляж
        111, //HDrezka Studio Russian
        238, //Оригинал
    ];

    private countries: ICountry[] = [];

    constructor(cfBypass: cf_bypass) {
        super("rezka", ["rezka.ag", "hdrezka.sh"], cfBypass);

        const countriesPath = "./jsons/countries.json";

        if (!fs.existsSync(countriesPath)) return;

        this.countries = JSON.parse(fs.readFileSync(countriesPath).toString());
    }

    getTypeOfVideo(type: number): string {
        switch (type) {
            case 1: {
                return "Сериал";
            }
            case 2: {
                return "Мультфильм";
            }
            default: {
                return "Фильм";
            }
        }
    }

    private getCountry(countryName: string): string {
        const country = this.countries.find((countryB) =>
            countryB.name.includes(countryName)
        );

        if (country) return country.flag;

        return "🇱🇷";
    }

    downloadMovie(url: string[]): Promise<string> {
        return new Promise(async (resolve) => {
            const randName = this.makeid(7);
            await this.runFFMPEG([
                "-hwaccel",
                "cuvid",
                "-i",
                url[0],
                "-c:v",
                "hevc_nvenc",
                "-rc",
                "vbr",
                "-cq",
                "24",
                "-qmin",
                "24",
                "-qmax",
                "24",
                "-profile:v",
                "main10",
                "-pix_fmt",
                "p010le",
                "-b:v",
                "0K",
                "-c:a",
                "aac",
                "-movflags",
                "faststart",
                `./temp/${randName}.mp4`,
            ]);

            resolve(randName);
        });
    }

    getOutText(content: ParsedObject): string {
        const text = [];
        text.push(
            `🎬 **${content.name}**`,
            `🎭 **Жанры:** ${this.connect(content.genres, "#")}`,
            this.getCountry(content.country[0]) +
                ` **${content.country[0]} | ${content.year}**`,
            `⏰ **${
                content.type !== 1 ? "Длительность:" : "Длительность серии:"
            }** ~${content.duration}`,
            "",
            content.description,
            `#${this.getTypeOfVideo(content.type)}`
        );
        return text.join("\n");
    }

    parseObjects(url: string): Promise<ParsedObject> {
        return new Promise(async (resolve, reject) => {
            let html: string[];

            try {
                let data = await this.cfBypass.getCookies({
                    url: url,
                    userAgent:
                        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/83.0.4103.97 Safari/537.36",
                    maxTimeout: 60000,
                });

                if (!data || !data.solution) {
                    return reject("empty_link");
                }
                html = pretty(data.solution.response).split(/\r?\n/);
            } catch (ex) {
                return reject(ex);
            }

            const data: ParsedObject = {};

            data.type = 0;

            data.url = url;
            for (let i = 0; i < html.length; i++) {
                const element = html[i];
                if (element.includes('<h1 itemprop="name">')) {
                    data.name = element.match(/<h1 itemprop="name">(.+)</)[1];
                }

                if (element.includes('data-imagelightbox="cover"')) {
                    data.poster = element.match(
                        /<a href="(.+)" target="_blank"/
                    )[1];
                }

                if (element.includes("<h2>Дата выхода</h2>")) {
                    data.year = html[i + 2]
                        .match(/\/">(.+)<\/a>/)[1]
                        .replace(" года", "");
                }

                if (element.includes('itemprop="director"')) {
                    data.director = html[i].match(
                        /itemprop="name">(.*?)<\/span>/
                    )[1];
                }

                if (element.includes("b-post__info_rates imdb")) {
                    data.rating = html[i].match(/s="bold">(.*?)<\/span>/)[1];
                }

                if (element.includes("<h2>Страна</h2>")) {
                    let re = [...html[i + 2].matchAll(/\/">(.*?)<\/a>/g)];
                    data.country = [];

                    re.forEach((el) => data.country.push(el[1]));
                }

                if (element.includes('itemprop="actor"')) {
                    let re = [
                        ...html[i].matchAll(/itemprop="name">(.*?)<\/span>/g),
                    ];
                    data.actors = [];

                    re.forEach((el) => data.actors.push(el[1]));
                }

                if (element.includes("b-sidelinks__link show-trailer")) {
                    const temp = html[i].match(/data-id="(.*?)"/);

                    if (temp) data.id = parseInt(temp[1]);
                }

                if (element.includes("translators-list")) {
                    const translators: ITranslators[] = [];

                    for (; i < html.length; i++) {
                        if (html[i].includes("</ul>")) break;

                        if (html[i].includes("<li")) {
                            const temp = html[i].match(/data-id="(.+)"/);

                            if (!data.id && temp) data.id = parseInt(temp[1]);

                            const translatorId = html[i].match(
                                /data-translator_id="(.+)"/
                            )[1];

                            if (!data.id || !translatorId) continue;

                            translators.push({
                                id: data.id,
                                translatorId: parseInt(translatorId),
                            });
                        }
                    }

                    if (!translators.length) continue;

                    data.movieLink = await this.getCdnSeries(
                        translators.sort((a, b) => {
                            return a.translatorId > b.translatorId
                                ? 1
                                : b.translatorId > a.translatorId
                                ? -1
                                : 0;
                        })
                    );
                }

                if (
                    element.includes("initCDNMoviesEvents") &&
                    (!data.movieLink || !data.movieLink.length)
                ) {
                    data.movieLink = this.matchSeries(html[i + 2]);
                }

                if (element.includes('description_text">')) {
                    data.description = element.match(/">(.+)<\/div>/)[1];

                    data.description = data.description
                        .slice(1, data.description.length - 1)
                        .replace(/\<br\>/g, "");
                }

                if (element.includes("Про что сериал")) {
                    data.type = 1;
                }

                if (element.includes("Про что мультфильм")) {
                    data.type = 2;
                }

                if (element.includes('itemprop="duration">')) {
                    data.duration = element.match(/">(.+)<\/td>/)[1];
                }

                if (element.includes("<h2>Жанр</h2>")) {
                    let re = [...html[i + 2].matchAll(/enre">(.*?)<\/span>/g)];
                    let temp = re;
                    data.genres = [];

                    temp.forEach((el) => data.genres.push(el[1]));
                }
            }

            resolve(data);
        });
    }

    private matchSeries(urls: string) {
        let matches = [...urls.matchAll(/(\[1080p\]|\[720p\])(.*?),/g)];
        matches = matches.reverse();
        const links: string[] = [];

        if (matches[0] && matches[0].length > 1) {
            links.push(
                matches[0][2].replace(/\\\//g, "/").match(/(.*?) or/)[1]
            );
        }

        return links;
    }

    private getCdnSeries(translators: ITranslators[]): Promise<string[]> {
        for (const translator of translators) {
            if (this.allowedTranslators.includes(translator.translatorId)) {
                return new Promise((resolve) => {
                    const currentTime = new Date().getTime();

                    const params = new URLSearchParams();
                    params.append("id", translator.id.toString());
                    params.append(
                        "translator_id",
                        translator.translatorId.toString()
                    );
                    params.append("action", "get_movie");
                    params.append("is_camrip", "0");
                    params.append("is_ads", "0");
                    params.append("is_director", "0");

                    this.makePostRequest(
                        `https://hdrezka.sh/ajax/get_cdn_series/?t=${currentTime}`,
                        params
                    )
                        .then(
                            (data: {
                                success: boolean;
                                message: string;
                                url: string;
                            }) => {
                                if (!data.success) {
                                    console.log(
                                        "ERROR WHILE PARSTING HDREZKA MOVIES"
                                    );
                                    return resolve([]);
                                }

                                resolve(this.matchSeries(data.url));
                            }
                        )
                        .catch(() => {
                            console.log("cant parse cdn_series");
                            resolve(null);
                        });
                });
            }
        }

        return Promise.resolve([]);
    }

    async writePsd(object: ParsedObject) {
        let buffer = fs.readFileSync("./assets/template_base.psd");

        // read only document structure
        const psd = readPsd(buffer);

        const texts = psd.children[2].children;

        let { ctx, canvas, height } = await this.renderDefaultCanvas(object);
        for (let layer of texts) {
            //Drawing image
            if (layer.name == "Layer 113" && object.poster) {
                //TODO: if no poster - replace by ?
                let canvasPoster = createCanvas(
                    layer.canvas.width,
                    layer.canvas.height
                );
                let ctxPoster = canvasPoster.getContext("2d");

                //Poster downloading in renderDefaultCanvas function
                let image = await loadImage("./temp/temp.jpg");

                ctxPoster.drawImage(
                    image,
                    0,
                    0,
                    layer.canvas.width,
                    layer.canvas.height
                );

                layer.canvas = canvasPoster as any;

                fs.unlinkSync("./temp/temp.jpg");
            }

            if (layer.name === "@title" && object.name) {
                layer.text.text =
                    object.name.length > 31
                        ? object.name.slice(0, 31) + "..."
                        : object.name;
            }

            if (layer.name === "@year" && object.year) {
                layer.text.text = object.year;
            }

            if (
                layer.name === "@country" &&
                object.country &&
                object.country.length
            ) {
                layer.text.text = object.country[0];
            }

            if (
                layer.name === "@actors" &&
                object.actors &&
                object.actors.length
            ) {
                layer.text.text = `${object.actors[0]} ${object.actors[1]}`;

                height += 44;
                this.writeTitle(ctx, "В главных", 27.66, 55, height, "Bold");
                this.writeText(
                    ctx,
                    layer.text.text,
                    layer.text.style.fontSize,
                    288,
                    height
                );
                height += 24;
                this.writeTitle(ctx, "ролях", 27.66, 55, height, "Bold");
            }

            if (
                layer.name === "@actors2" &&
                object.actors &&
                object.actors.length >= 3
            ) {
                layer.text.text = `${object.actors[2]} ${object.actors[3]}`;

                this.writeText(
                    ctx,
                    layer.text.text,
                    layer.text.style.fontSize,
                    288,
                    height
                );
            }

            if (layer.name === "@producer" && object.director) {
                layer.text.text = object.director;
            }

            if (layer.name === "@rating" && object.rating)
                layer.text.text = object.rating;
        }

        buffer = writePsdBuffer(psd, { invalidateTextLayers: true });

        const randName = this.makeid(7);
        fs.writeFileSync(`./temp/${randName}.psd`, buffer);
        fs.writeFileSync(`./temp/${randName}.jpg`, (canvas as any).toBuffer());

        return Promise.resolve(randName);
    }
}
