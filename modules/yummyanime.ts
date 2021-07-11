import striptags from 'striptags';
import cf_bypass from '../cf-bypass';
import fs from 'fs';
import ParseModule from './ParseModule';
import { readPsd, writePsdBuffer } from 'ag-psd';
import { createCanvas, loadImage } from 'canvas';
import ParsedObject from '../interfaces/IParseObject';

export default class YummyAnime extends ParseModule {
    allowedTranslators = [
        'AniLibria',
        'AniDUB',
        'SHIZA Project',
        'JAM CLUB',
        'Студийная Банда',
        'StudioBand',
        'Дублирование',
        'Дубляж',
    ];

    constructor(cfBypass: cf_bypass) {
        super('yummyanime', ['yummyanime.club'], cfBypass);
    }

    getTypeOfVideo(type: number): string {
        switch (type) {
            case 1: {
                return 'Аниме фильм';
            }
            default: {
                return 'Аниме сериал';
            }
        }
    }

    getOutText(content: ParsedObject): string {
        let text = [];
        text.push(
            `🎬 **${content.name}**`,
            `🎭 **Жанры:** ${this.connect(content.genres, ',')}`,
            `🇯🇵 **${content.country[0]} | ${content.year}**`
        );

        if (content.count_of_series)
            text.push(`📝 **Эпизодов:** ${content.count_of_series}`);

        text.push('', content.description);

        text.push('', '#Аниме');
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
                html = data.solution.response.split(/\r?\n/);
            } catch (ex) {
                return reject(ex);
            }

            let data: ParsedObject = {};

            let i = 0;

            data.type = 0;

            data.url = url;

            data.country = ['Япония'];

            for (let element of html) {
                if (element.includes('class="preview-rating"')) {
                    data.name = html[i - 4].trim();
                }

                if (element.includes('"rating-info"')) {
                    data.name = element.match(/title="(.*?)"/)[1];
                }

                if (element.includes('"og:image"')) {
                    data.poster =
                        'https://yummyanime.club' +
                        element.match(/content="(.*?)"/)[1];
                }

                if (element.includes('<span>Год: </span>')) {
                    data.year = striptags(
                        element.replace('<span>Год: </span>', '')
                    ).trim();
                }

                if (element.includes('<span>Режиссер:</span>')) {
                    data.director = striptags(html[i + 2]).trim();
                }

                if (
                    element.includes('id="content-desc-text"') &&
                    element.includes('<p')
                ) {
                    data.description = striptags(element)
                        .trim()
                        .replace(/&nbsp;/g, ' ')
                        .replace(/&laquo;/g, '«')
                        .replace(/&raquo;/g, '»')
                        .replace(/&mdash;/g, '—')
                        .replace(/&quot;/g, '"')
                        .replace(/&ndash;/g, '–')
                        .replace(/&hellip;/g, '…');
                }

                if (element.includes('Тип:') && element.includes('фильм')) {
                    data.type = 1;
                }

                if (element.includes('<span>Сезон:</span>')) {
                    data.season = striptags(
                        element.replace('<span>Сезон:</span>', '')
                    ).trim();
                }

                if (
                    element.includes('<span class="genre">Жанр:</span>') ||
                    element.includes('span>Жанр:</span>')
                ) {
                    data.genres = [];
                    for (let j = i; j < html.length; j++) {
                        if (html[j].includes('</ul>')) {
                            i += j;
                            break;
                        }

                        if (html[j].includes('<li>'))
                            data.genres.push(striptags(html[j]).trim());
                    }
                }

                if (element.includes('<span>Серии:</span>')) {
                    data.count_of_series = parseInt(
                        striptags(
                            element.replace('<span>Серии:</span>', '')
                        ).trim()
                    );
                }

                if (
                    element.includes('Kodik') &&
                    element.includes('video-block-description') &&
                    this.isPlayer(element) &&
                    !data.movieLink
                ) {
                    data.movieLink = [];
                    for (let j = i; j < html.length; j++) {
                        let block = html[j];
                        if (block.includes('data-href="')) {
                            data.movieLink.push(
                                block.match(/data-href="(.*?)"/)[1]
                            );
                        }

                        if (block.includes('iframe')) {
                            i += j;
                            break;
                        }
                    }
                }
                i++;
            }

            resolve(data);
        });
    }

    private isPlayer(element: string) {
        for (let dub of this.allowedTranslators)
            if (element.includes(`Озвучка ${dub}`)) return true;

        return false;
    }

    //Download text TS segment
    private downloadNext(url: string): Promise<string> {
        return new Promise(async (resolve) => {
            let downloadLink = await this.fuckKodik(url);
            let randName = this.makeid(7);

            await this.runFFMPEG([
                '-i',
                'http:' + downloadLink,
                '-acodec',
                'copy',
                '-vcodec',
                'copy',
                '-vbsf',
                'h264_mp4toannexb',
                '-f',
                'mpegts',
                `./temp/${randName}.ts`,
            ]);

            resolve(randName);
        });
    }

    //Concat all segments into one mp4 file
    private concat(segments: string[]) {
        return new Promise(async (resolve) => {
            let randName = this.makeid(7);

            let concateFileName = this.makeid(7);

            fs.writeFileSync(
                `./temp/${concateFileName}.txt`,
                segments
                    .map((val) => {
                        return `file '${val}.ts'`;
                    })
                    .join('\n')
            );

            await this.runFFMPEG([
                '-f',
                'concat',
                '-safe',
                '0',
                '-i',
                `./temp/${concateFileName}.txt`,
                '-acodec',
                'copy',
                '-vcodec',
                'copy',
                `./temp/${randName}_out.mp4`,
            ]);

            fs.unlinkSync(`./temp/${concateFileName}.txt`);
            resolve(`${randName}_out`);
        });
    }

    downloadMovie(url: string[]): Promise<string> {
        return new Promise(async (resolve) => {
            let segments = [];
            for (let link of url) segments.push(await this.downloadNext(link));

            let concated = await this.concat(segments);

            //Delete all downloadeg segments cuz we already concated
            for (let segment of segments) fs.unlinkSync(`./temp/${segment}.ts`);

            let randName = this.makeid(7);

            await this.runFFMPEG([
                '-hwaccel',
                'cuvid',
                '-i',
                `./temp/${concated}.mp4`,
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
                '-map',
                '0',
                '-movflags',
                'faststart',
                `./temp/${randName}.mp4`,
            ]);

            //Delete concated file, cuz we not needed more
            fs.unlinkSync(`./temp/${concated}.mp4`);
            resolve(randName);
        });
    }

    public fuckKodik(link: string): Promise<string> {
        return new Promise((resolve) => {
            this.makeRequest('http:' + link, (body: any) => {
                if (!body) {
                    return resolve('');
                }

                let html = body.split(/\r?\n/);

                for (let i = 0; i < html.length; i++) {
                    let elem = html[i];
                    if (elem.includes('iframe.src')) {
                        let link = elem.match(/iframe.src = "(.+)";/)[1];
                        let splitted = link.split('/');

                        let attrs: string[] = splitted[splitted.length - 1]
                            .split('?')[1]
                            .split('&');

                        let data: any = {
                            bad_user: false,
                            hash2: 'vbWENyTwIn8I',
                            d: 'kodik.info',
                            d_sign: '8022187ea4f80a819c8b1295a86abff3713891fb8ec9f2b3958cd8152763228e',
                            pd: '',
                            pd_sign: '',
                            ref: 'https://kodik.info/',
                            ref_sign:
                                'e974598ad26a91e91d60bc0a954a2028105ec11f0a441c41ea25ea0db1a2cfc9',
                            hash: splitted[6],
                            type: splitted[4] || 'seria',
                            id: splitted[5],
                            info: '{}',
                        };

                        attrs.forEach((atr) => {
                            let splitted_atr = atr.split('=');

                            if (['min_age'].includes(splitted_atr[0])) return;

                            data[splitted_atr[0]] = splitted_atr[1];
                        });

                        const params = new URLSearchParams();

                        Object.keys(data).forEach((val) =>
                            params.append(val, data[val])
                        );

                        this.makePostRequest(
                            'https://kodik.info/get-video-info',
                            params,
                            (body: any) => {
                                if (!body) return resolve('');

                                resolve(body.links['720'][0].src);
                            }
                        );
                        break;
                    }
                }
            });
        });
    }

    async writePsd(object: ParsedObject) {
        let buffer = fs.readFileSync('./assets/template_anime.psd');

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

            if (layer.name === '@producer' && object.director)
                layer.text.text = object.director;

            if (layer.name === '@subdub' && object.rating)
                layer.text.text = object.rating;

            if (layer.name === '@rating' && object.rating)
                layer.text.text = object.rating;
        }

        buffer = writePsdBuffer(psd, { invalidateTextLayers: true });
        fs.writeFileSync('./temp/my-file.psd', buffer);
    }
}
