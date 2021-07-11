import pretty from 'pretty';
import cf_bypass from '../cf-bypass';

import { readPsd, writePsdBuffer } from 'ag-psd';
import { createCanvas, loadImage } from 'canvas';
import * as fs from 'fs';
import ParseModule from './ParseModule';
import ParsedObject from '../interfaces/IParseObject';

export default class rezka extends ParseModule {
    constructor(cfBypass: cf_bypass) {
        super('rezka', ['rezka.ag', 'hdrezka.sh'], cfBypass);
    }

    getTypeOfVideo(type: number): string {
        switch (type) {
            case 1: {
                return 'Сериал';
            }
            case 2: {
                return 'Мультфильм';
            }
            default: {
                return 'Фильм';
            }
        }
    }

    getCountry(country: string): string {
        switch (country) {
            case 'Испания': {
                return '🇪🇸';
            }
            case 'Норвегия': {
                return '🇳🇴';
            }
            case 'Дания': {
                return '🇩🇰';
            }
            case 'Россия': {
                return '🇷🇺';
            }
            case 'Великобритания': {
                return '🇬🇧';
            }
            case 'Франция': {
                return '🇫🇷';
            }
            case 'Германия': {
                return '🇩🇪';
            }
            case 'Канада': {
                return '🇨🇦';
            }
            case 'Китай': {
                return '🇨🇳';
            }
            case 'Бразилия': {
                return '🇧🇷';
            }
            case 'Бельгия': {
                return '🇧🇪';
            }
            case 'Индия': {
                return '🇮🇳';
            }
            case 'Австралия': {
                return '🇦🇺';
            }
            case 'Украина': {
                return '🇺🇦';
            }
            case 'Турция': {
                return '🇹🇷';
            }
            case 'Корея Южная': {
                return '🇰🇷';
            }
            default: {
                return '🇱🇷';
            }
        }
    }

    downloadMovie(url: string[]): Promise<string> {
        return new Promise(async (resolve) => {
            let randName = this.makeid(7);
            await this.runFFMPEG([
                '-hwaccel',
                'cuvid',
                '-i',
                url[0],
                '-c:v',
                'hevc_nvenc',
                '-rc',
                'vbr',
                '-cq',
                '24',
                '-qmin',
                '24',
                '-qmax',
                '24',
                '-profile:v',
                'main10',
                '-pix_fmt',
                'p010le',
                '-b:v',
                '0K',
                '-c:a',
                'aac',
                '-movflags',
                'faststart',
                `./temp/${randName}.mp4`,
            ]);

            resolve(randName);
        });
    }

    getOutText(content: ParsedObject): string {
        let text = [];
        text.push(
            `🎬 **${content.name}**`,
            `🎭 **Жанры:** ${this.connect(content.genres, '#')}`,
            this.getCountry(content.country[0]) +
                ` **${content.country[0]} | ${content.year}**`,
            `⏰ **${
                content.type !== 1 ? 'Длительность:' : 'Длительность серии:'
            }** ~${content.duration}`,
            '',
            content.description,
            `#${this.getTypeOfVideo(content.type)}`
        );
        return text.join('\n');
    }

    parseObjects(url: string): Promise<ParsedObject> {
        return new Promise(async (resolve, reject) => {
            let html: string[];

            try {
                let data = await this.cfBypass.getCookies({
                    url: url,
                    userAgent:
                        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/83.0.4103.97 Safari/537.36',
                    maxTimeout: 60000,
                });

                if (!data || !data.solution) {
                    return reject('empty_link');
                }
                html = pretty(data.solution.response).split(/\r?\n/);
            } catch (ex) {
                return reject(ex);
            }

            let data: ParsedObject = {};

            let i = 0;
            data.type = 0;

            data.url = url;
            for (let element of html) {
                if (element.includes('<h1 itemprop="name">')) {
                    data.name = element.match(/<h1 itemprop="name">(.+)</)[1];
                }

                if (element.includes('data-imagelightbox="cover"')) {
                    data.poster = element.match(
                        /<a href="(.+)" target="_blank"/
                    )[1];
                }

                if (element.includes('<h2>Дата выхода</h2>')) {
                    data.year = html[i + 2]
                        .match(/\/">(.+)<\/a>/)[1]
                        .replace(' года', '');
                }

                if (element.includes('itemprop="director"')) {
                    data.director = html[i].match(
                        /itemprop="name">(.*?)<\/span>/
                    )[1];
                }

                if (element.includes('b-post__info_rates imdb')) {
                    data.rating = html[i].match(/s="bold">(.*?)<\/span>/)[1];
                }

                if (element.includes('<h2>Страна</h2>')) {
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

                if (element.includes('initCDNMoviesEvents')) {
                    let matches = [
                        ...html[i + 2].matchAll(/(\[1080p\]|\[720p\])(.*?),/g),
                    ];
                    matches = matches.reverse();
                    data.movieLink = [];

                    if (matches[0] && matches[0].length > 1) {
                        data.movieLink.push(
                            matches[0][2]
                                .replace(/\\\//g, '/')
                                .match(/(.*?) or/)[1]
                        );
                    }
                }

                if (element.includes('description_text">')) {
                    data.description = element.match(/">(.+)<\/div>/)[1];

                    data.description = data.description.slice(
                        1,
                        data.description.length - 1
                    );
                }

                if (element.includes('Про что сериал')) {
                    data.type = 1;
                }

                if (element.includes('Про что мультфильм')) {
                    data.type = 2;
                }

                if (element.includes('itemprop="duration">')) {
                    data.duration = element.match(/">(.+)<\/td>/)[1];
                }

                if (element.includes('<h2>Жанр</h2>')) {
                    let re = [...html[i + 2].matchAll(/enre">(.*?)<\/span>/g)];
                    let temp = re;
                    data.genres = [];

                    temp.forEach((el) => data.genres.push(el[1]));
                }

                i++;
            }

            resolve(data);
        });
    }

    async writePsd(object: ParsedObject) {
        let buffer = fs.readFileSync('./assets/template_base.psd');

        // read only document structure
        const psd = readPsd(buffer);

        let texts = psd.children[2].children;

        for (let layer of texts) {
            //Drawing image
            if (layer.name == 'Layer 113' && object.poster) {
                //TODO: if no poster - replace by ?
                const canvas = createCanvas(316, 474);
                const ctx = canvas.getContext('2d');

                await this.downloadPosterTemp(object.poster);

                let image = await loadImage('./temp/temp.jpg');

                ctx.drawImage(image, 0, 0, 316, 474);

                layer.canvas = canvas as any;

                fs.unlinkSync('./temp/temp.jpg');
            }

            if (layer.name === '@title' && object.name)
                layer.text.text =
                    object.name.length > 26
                        ? object.name.slice(0, 26) + '...'
                        : object.name;

            if (layer.name === '@year' && object.year)
                layer.text.text = object.year;

            if (
                layer.name === '@country' &&
                object.country &&
                object.country.length
            )
                layer.text.text = object.country[0];

            if (
                layer.name === '@actors' &&
                object.actors &&
                object.actors.length
            )
                layer.text.text = `${object.actors[0]} ${object.actors[1]}`;

            if (
                layer.name === '@actors2' &&
                object.actors &&
                object.actors.length >= 3
            )
                layer.text.text = `${object.actors[2]} ${object.actors[3]}`;

            if (layer.name === '@producer' && object.director)
                layer.text.text = object.director;

            if (layer.name === '@rating' && object.rating)
                layer.text.text = object.rating;
        }

        buffer = writePsdBuffer(psd, { invalidateTextLayers: true });
        fs.writeFileSync('./temp/my-file.psd', buffer);
    }
}
