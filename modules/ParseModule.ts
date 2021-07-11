import axios from 'axios';

import { spawn } from 'child_process';
import config from '../config';
import * as fs from 'fs';
import cf_bypass from '../cf-bypass';
import ParsedObject from '../interfaces/IParseObject';

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

    abstract parseObjects?(_: string): Promise<ParsedObject>;
    abstract downloadMovie?(_: string[]): Promise<any>;
    abstract writePsd?(_: ParsedObject): Promise<void>;
    abstract getOutText?(_: ParsedObject): string;

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
