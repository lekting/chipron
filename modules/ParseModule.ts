import axios from "axios";

import { spawn } from "child_process";
import * as fs from "fs";
import cf_bypass from "../cf-bypass";
import ParsedObject from "../interfaces/IParseObject";
import { createCanvas, loadImage, NodeCanvasRenderingContext2D } from "canvas";

export default abstract class Module {
    public name: string;

    protected cfBypass: cf_bypass;
    private site: string[];

    private characters =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

    constructor(name: string, site: string[], cfBypass: cf_bypass) {
        this.name = name;
        this.site = site;
        this.cfBypass = cfBypass;
    }

    getSite(): string[] {
        return this.site;
    }

    abstract parseObjects(_: string): Promise<ParsedObject>;
    abstract downloadMovie(_: string[]): Promise<any>;
    abstract getOutText(_: ParsedObject): string;

    writePsd(_: ParsedObject): Promise<string> {
        return Promise.resolve(null);
    }

    async renderDefaultCanvas(object: ParsedObject) {
        console.log(object);
        const canvas = createCanvas(1000, 600);
        const ctx = canvas.getContext("2d");

        //Render background
        ctx.drawImage(await loadImage("./assets/1.jpg"), 0, 0, 1000, 600);

        //Render line under title
        ctx.drawImage(await loadImage("./assets/2.png"), 55, 105);

        if (object.tempVideoName) {
            //Render thumbnails
            ctx.drawImage(
                await loadImage(`./temp/${object.tempVideoName}_1.jpg`),
                55,
                376
            );
            ctx.drawImage(
                await loadImage(`./temp/${object.tempVideoName}_2.jpg`),
                338,
                376
            );

            //delete thumbnails
            fs.unlinkSync(`./temp/${object.tempVideoName}_1.jpg`);
            fs.unlinkSync(`./temp/${object.tempVideoName}_2.jpg`);
        }

        //Writing channel name on poster
        this.writeCopyright(ctx);

        ctx.setTransform(1, 0, 0, 1.2, 0, 0);

        let height = 80;
        //Write title of movie
        this.writeTitle(
            ctx,
            object.name.length > 30
                ? object.name.slice(0, 30) + "..."
                : object.name,
            26.66,
            55,
            height
        );
        height += 55;
        if (object.year) {
            //Write date title
            this.writeTitle(ctx, "Дата выхода", 27.66, 55, height, "Bold");
            //Write date
            this.writeText(ctx, object.year, 25.73, 288, height);
        }

        if (object.country && object.country.length) {
            //Write country title
            height += 44;
            this.writeTitle(ctx, "Страна", 27.66, 55, height, "Bold");
            //Write country
            this.writeText(ctx, object.country[0], 25.73, 288, height);
        }

        if (object.director) {
            height += 44;
            //Write director title
            this.writeTitle(ctx, "Режиссёр", 27.66, 55, height, "Bold");
            //Write director
            this.writeText(ctx, object.director, 25.73, 288, height);
        }

        await this.downloadPosterTemp(object.poster);
        const image = await loadImage("./temp/temp.jpg");

        const saved = ctx.getTransform();
        ctx.resetTransform();
        ctx.drawImage(image, 607, 61, 338, 479);

        ctx.setTransform(saved);

        return { ctx, canvas, height };
    }

    writeCopyright(ctx: NodeCanvasRenderingContext2D) {
        ctx.font = "25.53px AA American Captain";

        ctx.fillStyle = "white";
        ctx.fillText("@CHIPRON", 745, 50);
        ctx.restore();
    }

    writeTitle(
        ctx: NodeCanvasRenderingContext2D,
        text: string,
        fontSize: number,
        x: number,
        y: number,
        fontWeight: string = "Black"
    ) {
        if (fontWeight == "Black")
            ctx.font = `${fontSize}px Arial ${fontWeight}`;
        else
            ctx.font = `normal ${fontWeight.toLowerCase()} ${fontSize}px Arial`;

        ctx.fillStyle = "white";
        ctx.fillText(text, x, y - 5);
        ctx.restore();
    }

    writeText(
        ctx: NodeCanvasRenderingContext2D,
        text: string,
        fontSize: number,
        x: number,
        y: number
    ) {
        fontSize += 4;
        ctx.font = `${fontSize}px Arial`;
        ctx.fillStyle = "white";
        ctx.fillText(text, x, y - 5);
        ctx.restore();
    }

    async downloadPosterTemp(url: string): Promise<void> {
        return new Promise((resolve) => {
            axios({
                url,
                responseType: "stream",
            }).then((response) => {
                response.data.pipe(
                    fs
                        .createWriteStream("./temp/temp.jpg")
                        .on("close", () => resolve())
                );
            });
        });
    }

    makeid(length: number) {
        let result = "";
        const charactersLength = this.characters.length;

        for (let i = 0; i < length; i++) {
            result += this.characters.charAt(
                Math.floor(Math.random() * charactersLength)
            );
        }

        return result;
    }

    connect(arr: string[], del: string = "#") {
        if (!arr.length) return "";

        return arr
            .map((val) => {
                return `${del}${val}`;
            })
            .join(", ");
    }

    runFFMPEG(args: string[], allLog?: boolean): Promise<void> {
        return new Promise((resolve) => {
            const proc = spawn("ffmpeg", ["-y", "-hide_banner", ...args]);

            proc.stderr.setEncoding("utf8");
            proc.stderr.on("error", (err: string) => {
                console.log("err", err);
            });
            proc.stderr.on("data", (data: string) => {
                if (allLog) console.log(data);

                if (!data.includes("time=")) return;

                console.log(
                    `${data.match(/time=(.*?) /)[1]}, ${
                        data.match(/speed=(.*)/)[1]
                    }`
                );
            });

            proc.on("close", () => resolve());
        });
    }

    makePostRequest(
        url: string,
        data: any = {},
        external_headers: any = {}
    ): Promise<any> {
        return new Promise((resolve, reject) => {
            axios
                .post(url, data, {
                    headers: {
                        "Content-Type": "application/x-www-form-urlencoded",
                        Accept: "image/webp,image/apng,image/*,*/*;q=0.8",
                        dnt: "1",
                        "User-Agent":
                            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/81.0.4044.122 Safari/537.36",
                        ...external_headers,
                    },
                })
                .then((response) => resolve(response.data))
                .catch(() => reject());
        });
    }

    makeRequest(url: string): Promise<any> {
        return new Promise((resolve, reject) => {
            axios({
                method: "get",
                url: url,
            })
                .then((response) => resolve(response.data))
                .catch(() => reject());
        });
    }
}

module.exports = Module;
