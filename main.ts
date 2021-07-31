process.env.NTBA_FIX_319 = "1"; //fix node-telegram-bot-api promise cancelation

import config from "./config";

import colors from "colors/safe";

import rezka from "./modules/rezka";

import YummyAnime from "./modules/yummyanime";

import * as fs from "fs";
import "ag-psd/initialize-canvas.js";

import { Client } from "tdl";
import { TDLib } from "tdl-tdlib-addon";
import { spawn } from "child_process";

import inquirer from "inquirer";
import TelegramBot from "node-telegram-bot-api";
import ParseModule from "./modules/ParseModule";
import cf_bypass from "./cf-bypass";
import { message, messages } from "tdlib-types";
import EventEmitter from "events";

const bot = new TelegramBot(config.telegramBotToken, {
    polling: true,
});

const cfBypass = new cf_bypass();
const modules: ParseModule[] = [new rezka(cfBypass), new YummyAnime(cfBypass)];
const events = new EventEmitter();

let working = false;
let disabling = false;

//Init telegram client with tdlib (not a bot)
const tgClient = new Client(new TDLib(), {
    apiId: config.telegram.appId,
    apiHash: config.telegram.apiHash,
    verbosityLevel: 0,
});

//Create temp folder for templ files (like exported jpg poster and videos)
if (!fs.existsSync("./temp")) fs.mkdirSync("./temp");

//Trying to connect to telegram server and auth
(async () => {
    await tgClient.connect();
    await tgClient.login(() => ({
        getPhoneNumber: (retry) =>
            retry
                ? Promise.reject("Invalid phone number")
                : Promise.resolve(config.telegram.phone),
        getAuthCode: (retry) =>
            retry
                ? Promise.reject("Invalid auth code")
                : Promise.resolve(config.telegram.code),
        getPassword: (_, retry) =>
            retry
                ? Promise.reject("Invalid password")
                : Promise.resolve(config.telegram.password),
        getName: () =>
            Promise.resolve({
                firstName: config.telegram.firstName,
                lastName: config.telegram.lastName,
            }),
    }));

    //tgClient.on("error", console.error);
    tgClient.on("update", (val) => {
        if (
            val._ == "updateChatLastMessage" &&
            val.last_message.chat_id == config.telegramTrashGroup
        ) {
            events.emit("newMessage", val.last_message);
        }
    });
    sendPrompt();
})();

bot.on("message", async (message) => {
    if (disabling) return;
    if (!message || !message.chat) return console.log("NOONOONOON");

    if (!config.telegramAdmins.includes(message.chat.id)) {
        return bot.sendMessage(message.chat.id, "Ты кто блять!?");
    }

    if (working) {
        return bot.sendMessage(
            message.chat.id,
            "Да подожди ты блять, работаю..."
        );
    }

    const module = getWorkingModule(message.text);

    if (!module) {
        return bot.sendMessage(
            message.chat.id,
            `Мне кажется, что ссылка вида "${message.text}" похожа на твою несуществующую семью`
        );
    }

    bot.sendMessage(
        message.chat.id,
        "Начинаю пахать, я же блять раб, ну да..."
    );

    working = true;

    //Parsing sites
    const parsed = await module.parseObjects(message.text);

    const outText = module.getOutText(parsed);

    //if we have urls - downloaded them
    if (parsed.movieLink && parsed.movieLink.length) {
        bot.sendMessage(
            message.chat.id,
            `Скачиваю ${parsed.movieLink.length > 1 ? "серии" : "фильм"}...`
        );

        //Download a movie
        const video = await module.downloadMovie(parsed.movieLink);

        if (video) {
            const duration = await getVideoDuration(video);

            await generateThumbnail(video, randomNumber(5, duration));
            await generateThumbnail(video, randomNumber(5, duration), 2);

            parsed.tempVideoName = video;

            //generating psd file and drawing with canvas a poster
            const templateName = await module.writePsd(parsed);

            bot.sendMessage(
                message.chat.id,
                `${
                    parsed.movieLink.length > 1 ? "Аниме" : "Фильм"
                } успешно скачан, высылаю в паблик`
            );

            //sending poster(jpg, psd) and video to trash-channel
            await sendPost(video, templateName, outText, parsed.name, duration);

            //delete all temp files after upload
            fs.unlinkSync(`./temp/${templateName}.psd`);
            fs.unlinkSync(`./temp/${templateName}.jpg`);
            fs.unlinkSync(`./temp/${video}.mp4`);
        }
    }

    bot.sendMessage(message.chat.id, outText);

    working = false;
});

function getVideoDuration(video: string): Promise<number> {
    return new Promise((resolve) => {
        //trying to spawn ffprobe and get video duration (in sec)
        const proc = spawn("ffprobe", ["-show_format", `./temp/${video}.mp4`]);

        proc.stdout.on("data", async (data: Buffer) => {
            const msg = data.toString();
            if (!msg.includes("duration=")) return;

            const videoDuration = msg.match(/duration=(.*)/);

            resolve(parseInt(videoDuration[1]));
        });
    });
}

function generateThumbnail(
    video: string,
    seconds: number,
    i: number = 1
): Promise<void> {
    return new Promise((resolve) => {
        const proc = spawn("ffmpeg", [
            "-y",
            "-hide_banner",
            "-i",
            `./temp/${video}.mp4`,
            "-ss",
            seconds.toString(),
            "-s",
            "250x164",
            "-vframes",
            "1",
            `./temp/${video}_${i}.jpg`,
        ]);

        proc.on("close", () => resolve());
    });
}

async function awaitTelegramMessage(
    message: Promise<void | message | messages>
): Promise<void> {
    const anyMessage = await (message as any);
    const msg: message[] = [];

    if ((anyMessage as messages).messages)
        msg.push(...(anyMessage as messages).messages);
    else msg.push(anyMessage as message);

    return new Promise((resolve) => {
        const isNeededMessage = (message: message) => {
            return msg.some((msg) => message.content._ == msg.content._);
        };

        const checkLoad = (msg: message) => {
            if (isNeededMessage(msg)) {
                events.removeListener("newMessage", checkLoad);
                resolve();
            }
        };

        events.on("newMessage", checkLoad);
    });
}

async function sendPost(
    video: string,
    photo: string,
    outText: string,
    name: string,
    videoDuration: number
): Promise<any> {
    //send psd
    await awaitTelegramMessage(
        tgClient
            .invoke({
                _: "sendMessage",
                chat_id: config.telegramTrashGroup,
                input_message_content: {
                    _: "inputMessageDocument",
                    document: {
                        _: "inputFileLocal",
                        path: `./temp/${photo}.psd`,
                    },
                    caption: {
                        _: "formattedText",
                        text: name,
                    },
                },
            })
            .catch((err) => {
                console.log(err);
            })
    );

    //send poster(jpg) and video as album
    await awaitTelegramMessage(
        tgClient
            .invoke({
                _: "sendMessageAlbum",
                chat_id: config.telegramTrashGroup,
                input_message_contents: [
                    {
                        _: "inputMessageVideo",
                        video: {
                            _: "inputFileLocal",
                            path: `./temp/${video}.mp4`,
                        },
                        caption: {
                            _: "formattedText",
                            text: name,
                        },
                        supports_streaming: true,
                        duration: videoDuration,
                    },
                    {
                        _: "inputMessagePhoto",
                        photo: {
                            _: "inputFileLocal",
                            path: `./temp/${photo}.jpg`,
                        },
                    },
                ],
            })
            .catch((err) => {
                console.log(err);
            })
    );

    return awaitTelegramMessage(
        tgClient
            .invoke({
                _: "sendMessage",
                chat_id: config.telegramTrashGroup,
                input_message_content: {
                    _: "inputMessageText",
                    text: {
                        _: "formattedText",
                        text: outText,
                    },
                },
            })
            .catch((err) => {
                console.log(err);
            })
    );
}

function log(text: string) {
    console.log(
        colors.bold(colors.green("Chipron | ")) +
            colors.bold(colors.white(text))
    );
}

function randomNumber(min: number, max: number) {
    return Math.floor(Math.random() * (max - min) + min);
}

//Mini-console for some commands
function sendPrompt(/* mc: mongoWorker */) {
    inquirer
        .prompt({
            type: "input",
            name: "command",
            message: "Команда:",
        })
        .then(async (command) => {
            if (disabling) return;

            if (command.command) {
                if (command.command === "exit") {
                    disabling = true;
                    log("Сворачиваемся пацаны");

                    //await mc.close();
                    process.exit();
                } else {
                    if (command.command !== "help") {
                        log("Сорь, команду не нашёл. Вот тебе список:");
                        command.command = "help";
                    }
                }

                if (command.command === "help") {
                    log("exit - выйти в окно (выключиться)");
                }
            }

            sendPrompt();
        });
}

function getWorkingModule(url: string): ParseModule {
    if (!(url.startsWith("https://") || url.startsWith("http://"))) return null;

    const link = url.match(/\/\/(.*?)\//)[1];

    for (let i = 0; i < modules.length; i++)
        if (modules[i].getSite().includes(link)) return modules[i];

    return null;
}
