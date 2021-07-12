process.env.NTBA_FIX_319 = "1"; //fix node-telegram-bot-api promise cancelation

import config from "./config";

import colors from "colors/safe";
//import mongoWorker from './mongoWorker';

import rezka from "./modules/rezka";

import YummyAnime from "./modules/yummyanime";

import * as fs from "fs";
import "ag-psd/initialize-canvas.js";

import { Client } from "tdl";
import { TDLib } from "tdl-tdlib-addon";
import { spawn } from "child_process";

import inquirer from "inquirer";
//const MongoClient = require('mongodb').MongoClient;
import TelegramBot from "node-telegram-bot-api";
import ParseModule from "./modules/ParseModule";
import cf_bypass from "./cf-bypass";

import { createCanvas, loadImage } from "canvas";

const bot = new TelegramBot(config.telegramBotToken, {
    polling: true,
});

const cfBypass = new cf_bypass();
const modules: ParseModule[] = [new rezka(cfBypass), new YummyAnime(cfBypass)];

let working = false;
let disabling = false;

const tgClient = new Client(new TDLib(), {
    apiId: config.telegram.appId,
    apiHash: config.telegram.apiHash,
    verbosityLevel: 0,
});

if (!fs.existsSync("./temp")) fs.mkdirSync("./temp");

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

    tgClient.on("error", console.error);
    sendPrompt();
})();

//mongoClient = connectDB(),

//mongoClient.then(async (client) => {

//let mc = new mongoWorker('films', client);

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

    /*
    let finded = await mc.findSomeOne('films', { url: message.text }, { url: 1 });

    if (finded.length > 0) {
        bot.sendMessage({
            chat_id: message.chat.id,
            text: 'Ты чё, дебил? Ты уже кидал такую ссылку.'
        });
        return;
    }*/

    let module = getWorkingModule(message.text);

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

    let parsed = await module.parseObjects(message.text);

    let templateName = await module.writePsd(parsed);

    if (templateName) {
        //TODO: send psd and export png;
    }

    let out_text = module.getOutText(parsed);

    if (parsed.movieLink && parsed.movieLink.length) {
        bot.sendMessage(
            message.chat.id,
            `Скачиваю ${parsed.movieLink.length > 1 ? "серии" : "фильм"}...`
        );

        //let video = await module.downloadMovie(parsed.movieLink);
        let video: any = null;
        if (video) {
            bot.sendMessage(
                message.chat.id,
                `${
                    parsed.movieLink.length > 1 ? "Аниме" : "Фильм"
                } успешно скачан, высылаю в паблик`
            );

            let proc = spawn("ffprobe", [
                "-show_format",
                `./temp/${video}.mp4`,
            ]);

            proc.stdout.on("data", async (data: Buffer) => {
                let msg = data.toString();
                if (!msg.includes("duration=")) return;

                let videoDuration = msg.match(/duration=(.*)/);

                await sendVideo(video, out_text, parseInt(videoDuration[1]));

                //fs.unlinkSync(`./temp/${video}.mp4`);
            });
        }
    }

    bot.sendMessage(message.chat.id, out_text);

    working = false;
});
/* }).catch(error => {
    bot.sendMessage({
        chat_id: config.telegramAdmins[0],
        text: 'MongoDB плюнул в ебло ошибку, чекни'
    });
    console.log(error);
}); */

function sendVideo(
    video: string,
    out_text: string,
    videoDuration: number
): Promise<any> {
    return tgClient.invoke({
        _: "sendMessage",
        chat_id: config.telegramTrashGroup,
        input_message_content: {
            _: "inputMessageVideo",
            video: {
                _: "inputFileLocal",
                path: `./temp/${video}.mp4`,
            },
            caption: {
                _: "formattedText",
                text: out_text,
            },
            supports_streaming: true,
            duration: videoDuration,
        },
    });
}

function log(text: string) {
    console.log(
        colors.bold(colors.green("Chipron | ")) +
            colors.bold(colors.white(text))
    );
}

function sendPrompt(/* mc: mongoWorker */) {
    inquirer
        .prompt({
            type: "input",
            name: "command",
            message: "Команда:",
        })
        .then(async (command: any) => {
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

    let link = url.match(/\/\/(.*?)\//)[1];

    for (let i = 0; i < modules.length; i++)
        if (modules[i].getSite().includes(link)) return modules[i];

    return null;
}

/*function connectDB(): Promise<any> {
    return new Promise((resolve, reject) => {
        MongoClient.connect('mongodb://127.0.0.1:27017', { connectTimeoutMS: 5000, useUnifiedTopology: true, useNewUrlParser: true }, (err: any, client: any) => {

            if (err) {
                reject(err);
                return;
            }

            resolve(client);
        });
    });
}*/
