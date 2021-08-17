process.env.NTBA_FIX_319 = "1"; //fix node-telegram-bot-api promise cancelation

import config from "./config";

import rezka from "./modules/rezka";

import YummyAnime from "./modules/yummyanime";

import * as fs from "fs";
import "ag-psd/initialize-canvas.js";

import { Client } from "tdl";
import { TDLib } from "tdl-tdlib-addon";

import inquirer from "inquirer";
import TelegramBot from "node-telegram-bot-api";
import ParseModule from "./modules/ParseModule";
import cf_bypass from "./cf-bypass";
import { message, messages } from "tdlib-types";
import EventEmitter from "events";

import {
    randomNumber,
    log,
    getVideoDuration,
    generateThumbnail,
} from "./utils";

function wait(seconds: number) {
    return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
}

let tgClient: Client;
const cfBypass = new cf_bypass();
const modules: ParseModule[] = [new rezka(cfBypass), new YummyAnime(cfBypass)];

const events = new EventEmitter();

//Trying to connect to telegram server and auth
(async () => {
    //start timeout
    await wait(2);

    const bot = new TelegramBot(config.telegramBotToken, {
        polling: true,
    });

    let queue: string[] = [];
    let disabling = false;

    if (config.telegram.appId && config.telegram.apiHash) {
        //Init telegram client with tdlib (not a bot)
        tgClient = new Client(new TDLib(), {
            apiId: config.telegram.appId,
            apiHash: config.telegram.apiHash,
            verbosityLevel: 0,
        });

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
    } else {
        log(
            "Телеграм (tdlib) не загружен, видео не будут выгружаться в паблик."
        );
    }

    //Create temp folder for templ files (like exported jpg poster and videos)
    if (!fs.existsSync("./temp")) fs.mkdirSync("./temp");

    sendPrompt();

    let working = false;
    async function checkNextLink(userId: number) {
        if (queue.length == 0 || working) return;

        working = true;
        const link = queue.shift();

        await bot.sendMessage(userId, `Начинаю обрабатывать ${link}`);

        const module = getWorkingModule(link);

        if (!module) {
            return bot.sendMessage(
                userId,
                `Ссылка "${link}" не кажется мне знакомой`
            );
        }

        //Parsing sites
        const parsed = await module.parseObjects(link);

        if (!parsed) {
            return await bot.sendMessage(
                userId,
                "Произошла ошибка при парсинге, не удалось получить ссылку!"
            );
        }

        const outText = module.getOutText(parsed);

        //if we have urls - downloaded them
        if (parsed.movieLink && parsed.movieLink.length) {
            await bot.sendMessage(
                userId,
                `Скачиваю ${parsed.movieLink.length > 1 ? "серии" : "фильм"}...`
            );

            //Download a movie
            const video = await module.downloadMovie(parsed.movieLink);

            if (video) {
                const duration = await getVideoDuration(video);

                await bot.sendMessage(userId, "Делаю фотку 1");
                await generateThumbnail(
                    video,
                    randomNumber(30, Math.min(duration, 300))
                );

                await bot.sendMessage(userId, "Делаю фотку 2");
                await generateThumbnail(
                    video,
                    randomNumber(50, Math.min(duration, 400)),
                    2
                );

                parsed.tempVideoName = video;

                //generating psd file and drawing with canvas a poster
                const templateName = await module.writePsd(parsed);

                await bot.sendMessage(
                    userId,
                    `${
                        parsed.movieLink.length > 1 ? "Аниме" : "Фильм"
                    } успешно скачан, высылаю в паблик`
                );

                //sending poster(jpg, psd) and video to trash-channel
                await sendPost(
                    userId,
                    video,
                    templateName,
                    outText,
                    parsed.name,
                    duration
                );

                //if we not connected to telegram - save files cuz we not uploading to public
                if (tgClient) {
                    //delete all temp files after upload
                    fs.unlinkSync(`./temp/${templateName}.psd`);
                    fs.unlinkSync(`./temp/${templateName}.jpg`);
                    fs.unlinkSync(`./temp/${video}.mp4`);
                }
            }
        }

        await bot.sendMessage(userId, outText);

        await wait(1);

        working = false;

        checkNextLink(userId);
    }

    bot.on("message", async (message) => {
        if (disabling) return;
        if (!message || !message.chat || !message.text)
            return bot.sendMessage(message.chat.id, "Не надо так");

        if (!config.telegramAdmins.includes(message.chat.id))
            return bot.sendMessage(message.chat.id, "Ты кто!?");

        //if we writed command
        if (message.text.startsWith("/")) {
            const command = message.text.replace("/", "");

            switch (command) {
                case "restartb": {
                    await bot.sendMessage(message.chat.id, "Перезапускаюсь");
                    process.exit(1);
                }
            }

            return;
        }

        queue.push(message.text);

        checkNextLink(message.chat.id);

        if (queue.length)
            bot.sendMessage(message.chat.id, "Ссылка добавлена в очередь");
    });

    async function awaitTelegramMessage(
        message: Promise<void | message | messages>
    ): Promise<void> {
        const anyMessage = await (message as any);
        const msg: message[] = [];

        if (!anyMessage) return Promise.resolve();

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
        userId: number,
        video: string,
        photo: string,
        outText: string,
        name: string,
        videoDuration: number
    ): Promise<void | message | messages> {
        if (!tgClient) {
            bot.sendMessage(
                userId,
                "Телеграм не подключён, видео не загрузится в паблик."
            );
            return Promise.resolve();
        }

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
                    if (err.message) {
                        bot.sendMessage(userId, err.message);
                    }

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
                    if (err.message) {
                        bot.sendMessage(userId, err.message);
                    }
                    console.log(err);
                })
        );
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
})();

function getWorkingModule(url: string): ParseModule {
    if (!url || !(url.startsWith("https://") || url.startsWith("http://")))
        return null;

    const link = url.match(/\/\/(.*?)\//)[1];

    for (let i = 0; i < modules.length; i++)
        if (modules[i].getSite().includes(link)) return modules[i];

    return null;
}
