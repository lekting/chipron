# About this project

`Chipron` was developed as a bot for parsing movies and anime from different sites, currently 2 sites are available: HDRezka and YummyAnime. All parsed videos were published on the Telegram channel [Chipron](https://t.me/chipron).

After downloading, the bot generates a jpg picture (poster), as well as a mini description. The picture is hardcoded and you need to change the code, for drawing it is used [node-canvas](https://www.npmjs.com/package/canvas).

# How to run a project

In order to be able to use the bot, the library must be installed on the system [FFMpeg](https://www.ffmpeg.org/) (also `FFProbe`). This bot is using `NVIDIA accelerator` for transcoding videos and you need to check if your ffmpeg have that dependency:

```bash
ffmpeg -codecs | egrep nvenc
```

and find these lines

```bash
DEV.LS h264                 H.264 / AVC / MPEG-4 AVC / MPEG-4 part 10 (decoders: h264 h264_qsv h264_cuvid ) (encoders: libx264 libx264rgb h264_amf h264_nvenc h264_qsv nvenc nvenc_h264 )

DEV.L. hevc                 H.265 / HEVC (High Efficiency Video Coding) (decoders: hevc hevc_qsv hevc_cuvid ) (encoders: libx265 nvenc_hevc hevc_amf hevc_nvenc hevc_qsv )
```

if you do not have then please read [this installation manual](https://docs.nvidia.com/video-technologies/video-codec-sdk/ffmpeg-with-nvidia-gpu/)

## Step-by-step install instruction:

1. Clone this repository:

```bash
git clone git@github.com:lekting/chipron.git
```

2. Install all dependencies:

```bash
npm install
```

3. Setup config with your credentials. You need to rename `config.ts.example` to `config.ts` and change information:

```bash
export default {
    telegram: {
        appId: -1,
        apiHash: 'TELEGRAM_CLIENT_HASH',
        firstName: 'TELEGRAM_CLIENT_NAME',
        lastName: 'TELEGRAM_CLIENT_LASTNAME',
        phone: 'TELEGRAM_CLIENT_PHONE',
        code: 'TELEGRAM_CLIENT_CODE',
        password: 'TELEGRAM_CLIENT_PASSWORD',
    },
    telegramTrashGroup: -1,
    telegramAdmins: [],
    telegramBotToken: 'TELEGRAM_BOT_TOKEN',
};
```

4. Run bot

```bash
npm start
```
