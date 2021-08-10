import striptags from "striptags";
import cf_bypass from "../cf-bypass";
import fs from "fs";
import ParseModule from "./ParseModule";
import { readPsd, writePsdBuffer } from "ag-psd";
import { createCanvas, loadImage } from "canvas";
import ParsedObject from "../interfaces/IParseObject";

export default class YummyAnime extends ParseModule {
    private allowedTranslators = [
        "AniLibria",
        "AniDUB",
        "SHIZA Project",
        "JAM CLUB",
        "Студийная Банда",
        "StudioBand",
        "Дублирование",
        "Дубляж",
    ];

    constructor(cfBypass: cf_bypass) {
        super("yummyanime", ["yummyanime.club"], cfBypass);
    }

    getTypeOfVideo(type: number): string {
        switch (type) {
            case 1: {
                return "Аниме фильм";
            }
            default: {
                return "Аниме сериал";
            }
        }
    }

    getOutText(content: ParsedObject): string {
        const text = [];
        text.push(
            `🎬 **${content.name}**`,
            `🎭 **Жанры:** ${this.connect(content.genres, "#")}`,
            `🇯🇵 **${content.country[0]} | ${content.year}**`
        );

        if (content.count_of_series)
            text.push(`📝 **Эпизодов:** ${content.count_of_series}`);

        text.push("", content.description);

        text.push("", "#Аниме");
        return text.join("\n");
    }

    parseObjects(url: string): Promise<ParsedObject> {
        return new Promise(async (resolve, reject) => {
            let html: string[];

            try {
                const data = await this.cfBypass.getCookies({
                    url: url,
                    userAgent:
                        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/83.0.4103.97 Safari/537.36",
                    maxTimeout: 60000,
                });

                if (!data || !data.solution) {
                    return reject("empty_link");
                }
                html = data.solution.response.split(/\r?\n/);
            } catch (ex) {
                return reject(ex);
            }

            const data: ParsedObject = {};

            data.type = 0;

            data.url = url;

            data.country = ["Япония"];

            for (let i = 0; i < html.length; i++) {
                const element = html[i];
                if (element.includes('class="preview-rating"')) {
                    data.name = html[i - 4].trim();
                }

                if (element.includes('class="rating-info"')) {
                    data.name = element.match(/title="(.*?)"/)[1];
                }

                if (element.includes('"og:image"')) {
                    data.poster =
                        "https://yummyanime.club" +
                        element.match(/content="(.*?)"/)[1];
                }

                if (element.includes("<span>Год: </span>")) {
                    data.year = striptags(
                        element.replace("<span>Год: </span>", "")
                    ).trim();
                }

                if (element.includes("<span>Режиссер:</span>")) {
                    data.director = striptags(html[i + 2]).trim();
                }

                if (
                    element.includes('id="content-desc-text"') &&
                    element.includes("<p")
                ) {
                    data.description = striptags(element)
                        .trim()
                        .replace(/&nbsp;/g, " ")
                        .replace(/&laquo;/g, "«")
                        .replace(/&raquo;/g, "»")
                        .replace(/&mdash;/g, "—")
                        .replace(/&quot;/g, '"')
                        .replace(/&ndash;/g, "–")
                        .replace(/&hellip;/g, "…");
                }

                if (element.includes("Тип:") && element.includes("фильм")) {
                    data.type = 1;
                }

                if (element.includes("<span>Сезон:</span>")) {
                    data.season = striptags(
                        element.replace("<span>Сезон:</span>", "")
                    ).trim();
                }

                if (
                    element.includes('<span class="genre">Жанр:</span>') ||
                    element.includes("span>Жанр:</span>")
                ) {
                    data.genres = [];
                    for (; i < html.length; i++) {
                        if (html[i].includes("</ul>")) break;

                        if (html[i].includes("<li>")) {
                            data.genres.push(
                                striptags(html[i]).trim().replace(/ /g, "_")
                            );
                        }
                    }
                }

                if (element.includes("<span>Серии:</span>")) {
                    data.count_of_series = parseInt(
                        striptags(
                            element.replace("<span>Серии:</span>", "")
                        ).trim()
                    );
                }

                if (
                    element.includes("Kodik") &&
                    element.includes("video-block-description") &&
                    (data.dubber = this.isPlayer(element)) &&
                    !data.movieLink
                ) {
                    data.movieLink = [];
                    for (; i < html.length; i++) {
                        let block = html[i];
                        if (block.includes('data-href="')) {
                            data.movieLink.push(
                                block.match(/data-href="(.*?)"/)[1]
                            );
                        }

                        if (block.includes("iframe")) break;
                    }
                }
            }

            resolve(data);
        });
    }

    private isPlayer(element: string) {
        for (const dub of this.allowedTranslators)
            if (element.includes(`Озвучка ${dub}`)) return dub;

        return null;
    }

    //Download text TS segment
    private downloadNext(url: string): Promise<string> {
        return new Promise(async (resolve) => {
            const downloadLink = await this.fuckKodik(url),
                randName = this.makeid(7);

            await this.runFFMPEG([
                "-i",
                (downloadLink.startsWith("//") ? "http:" : "") + downloadLink,
                "-acodec",
                "copy",
                "-vcodec",
                "copy",
                "-vbsf",
                "h264_mp4toannexb",
                "-f",
                "mpegts",
                `./temp/${randName}.ts`,
            ]);

            resolve(randName);
        });
    }

    //Concat all segments into one mp4 file
    private concat(segments: string[]) {
        return new Promise(async (resolve) => {
            const randName = this.makeid(7);

            const concateFileName = this.makeid(7);

            fs.writeFileSync(
                `./temp/${concateFileName}.txt`,
                segments
                    .map((val) => {
                        return `file '${val}.ts'`;
                    })
                    .join("\n")
            );

            await this.runFFMPEG(
                [
                    "-f",
                    "concat",
                    "-safe",
                    "0",
                    "-i",
                    `./temp/${concateFileName}.txt`,
                    "-acodec",
                    "copy",
                    "-vcodec",
                    "copy",
                    `./temp/${randName}_out.mp4`,
                ],
                true
            );

            fs.unlinkSync(`./temp/${concateFileName}.txt`);
            resolve(`${randName}_out`);
        });
    }

    downloadMovie(url: string[]): Promise<string> {
        return new Promise(async (resolve) => {
            const segments = [];
            for (const link of url)
                segments.push(await this.downloadNext(link));

            const concated = await this.concat(segments);

            //Delete all downloadeg segments cuz we already concated
            for (const segment of segments) {
                let segmentPath = `./temp/${segment}.ts`;

                if (!fs.existsSync(segmentPath)) continue;

                fs.unlinkSync(segmentPath);
            }

            const randName = this.makeid(7);

            await this.runFFMPEG(
                [
                    "-hwaccel",
                    "cuvid",
                    "-i",
                    `./temp/${concated}.mp4`,
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
                    "-map",
                    "0",
                    "-movflags",
                    "faststart",
                    `./temp/${randName}.mp4`,
                ],
                true
            );

            //Delete concated file, cuz we not needed more
            fs.unlinkSync(`./temp/${concated}.mp4`);
            resolve(randName);
        });
    }

    public fuckKodik(link: string): Promise<string> {
        return new Promise((resolve) => {
            this.makeRequest(
                (link.startsWith("//") ? "http:" : "") + link,
                (body: any) => {
                    if (!body) {
                        return resolve("");
                    }

                    const html = body.split(/\r?\n/);

                    for (let i = 0; i < html.length; i++) {
                        const elem = html[i];
                        if (elem.includes("iframe.src")) {
                            let link = elem.match(/iframe.src = "(.+)";/)[1];
                            let splitted = link.split("/");

                            let attrs: string[] = splitted[splitted.length - 1]
                                .split("?")[1]
                                .split("&");

                            let data: any = {
                                bad_user: false,
                                hash2: "vbWENyTwIn8I",
                                d: "kodik.info",
                                d_sign: "8022187ea4f80a819c8b1295a86abff3713891fb8ec9f2b3958cd8152763228e",
                                pd: "",
                                pd_sign: "",
                                ref: "https://kodik.info/",
                                ref_sign:
                                    "e974598ad26a91e91d60bc0a954a2028105ec11f0a441c41ea25ea0db1a2cfc9",
                                hash: splitted[6],
                                type: splitted[4] || "seria",
                                id: splitted[5],
                                info: "{}",
                            };

                            attrs.forEach((atr) => {
                                let splitted_atr = atr.split("=");

                                if (["min_age"].includes(splitted_atr[0]))
                                    return;

                                data[splitted_atr[0]] = splitted_atr[1];
                            });

                            const params = new URLSearchParams();

                            Object.keys(data).forEach((val) =>
                                params.append(val, data[val])
                            );

                            this.makePostRequest(
                                "https://kodik.info/get-video-info",
                                params,
                                (body: any) => {
                                    if (!body) return resolve("");

                                    resolve(body.links["720"][0].src);
                                }
                            );
                            break;
                        }
                    }
                }
            );
        });
    }

    async writePsd(object: ParsedObject) {
        let buffer = fs.readFileSync("./assets/template_anime.psd");

        // read only document structure
        const psd = readPsd(buffer);

        const texts = psd.children[2].children;

        let { ctx, canvas, height } = await this.renderDefaultCanvas(object);

        if (object.dubber) {
            height += 44;
            this.writeTitle(ctx, "Озвучка", 27.66, 55, height, "Bold");
            this.writeText(ctx, object.dubber, 25.73, 288, height);
        }

        for (const layer of texts) {
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

            if (layer.name === "@producer" && object.director) {
                layer.text.text = object.director;
            }
        }

        buffer = writePsdBuffer(psd, { invalidateTextLayers: true });

        const randName = this.makeid(7);
        fs.writeFileSync(`./temp/${randName}.psd`, buffer);
        fs.writeFileSync(`./temp/${randName}.jpg`, (canvas as any).toBuffer());

        return Promise.resolve(randName);
    }
}
