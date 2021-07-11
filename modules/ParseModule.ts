import axios from 'axios';

import { spawn } from 'child_process';
import config from '../config';
import * as fs from 'fs';
import cf_bypass from '../cf-bypass';
import ParsedObject from '../interfaces/IParseObject';
import { NodeCanvasRenderingContext2D } from 'canvas';

export default abstract class Module {
    name: string;
    site: string[];
    cfBypass: cf_bypass;

    characters =
        'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

    constructor(name: string, site: string[], cfBypass: cf_bypass) {
        this.name = name;
        this.site = site;
        this.cfBypass = cfBypass;
    }

    getSite(): string[] {
        return this.site;
    }

    getConfig(): object {
        return config;
    }

    abstract parseObjects(_: string): Promise<ParsedObject>;
    abstract downloadMovie(_: string[]): Promise<any>;
    abstract getOutText(_: ParsedObject): string;

    writePsd(_: ParsedObject): Promise<string> {
        return Promise.resolve(null);
    }

    async convertPSDToJPG(psdFilePath: string): Promise<void> {
        return new Promise((resolve) => {
            let proc = spawn('magick', [
                'convert',
                `${psdFilePath}`,
                psdFilePath.replace('.psd', '.jpg'),
            ]);

            proc.on('close', () => resolve());
        });
    }

    writeCopyright(ctx: NodeCanvasRenderingContext2D) {
        ctx.font = '25.53px AA American Captain';

        ctx.fillStyle = 'white';
        ctx.fillText('@CHIPRON', 750, 50);
        ctx.restore();
    }

    writeTitle(
        ctx: NodeCanvasRenderingContext2D,
        text: string,
        fontSize: number,
        x: number,
        y: number,
        fontWeight: string = 'Black'
    ) {
        if (fontWeight == 'Black')
            ctx.font = fontSize + 'px Arial ' + fontWeight;
        else
            ctx.font =
                'normal ' +
                fontWeight.toLowerCase() +
                ' ' +
                fontSize +
                'px Arial';

        ctx.fillStyle = 'white';
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
        ctx.font = fontSize + 'px Arial';
        ctx.fillStyle = 'white';
        ctx.fillText(text, x, y - 5);
        ctx.restore();
    }

    async downloadPosterTemp(url: string): Promise<void> {
        return new Promise((resolve) => {
            axios({
                url,
                responseType: 'stream',
            }).then((response) => {
                response.data.pipe(
                    fs
                        .createWriteStream('./temp/temp.jpg')
                        .on('close', () => resolve())
                );
            });
        });
    }

    makeid(length: number) {
        let result = '';
        let charactersLength = this.characters.length;

        for (let i = 0; i < length; i++) {
            result += this.characters.charAt(
                Math.floor(Math.random() * charactersLength)
            );
        }

        return result;
    }

    connect(arr: any[], del: string = '#') {
        if (!arr || !arr.length) return '';

        return arr
            .map((val) => {
                return `${del}${val}`;
            })
            .join(', ');
    }

    runFFMPEG(args: string[], allLog?: boolean): Promise<void> {
        return new Promise((resolve) => {
            let proc = spawn('ffmpeg', ['-y', '-hide_banner', ...args]);

            proc.stderr.setEncoding('utf8');
            proc.stderr.on('data', (data: string) => {
                if (allLog) console.log(data);

                if (!data.includes('time=')) return;

                console.log(
                    `${data.match(/time=(.*?) /)[1]}, ${
                        data.match(/speed=(.*)/)[1]
                    }`
                );
            });

            proc.on('close', () => resolve());
        });
    }

    makePostRequest(
        url: string,
        data: any = {},
        callback: any,
        external_headers: any = {}
    ) {
        axios
            .post(url, data, {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    Accept: 'image/webp,image/apng,image/*,*/*;q=0.8',
                    dnt: '1',
                    'User-Agent':
                        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/81.0.4044.122 Safari/537.36',
                    ...external_headers,
                },
            })
            .then((response) => callback(response.data))
            .catch(() => callback(null));
    }

    makeRequest(url: string, callback: any) {
        axios({
            method: 'get',
            url: url,
        })
            .then((response) => callback(response.data))
            .catch(() => callback(null));
    }
}

module.exports = Module;
