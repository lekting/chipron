import colors from "colors/safe";
import { spawn } from "child_process";

export function randomNumber(min: number, max: number) {
    return Math.floor(Math.random() * (max - min) + min);
}

export function log(text: string) {
    console.log(
        colors.bold(colors.green("Chipron | ")) +
            colors.bold(colors.white(text))
    );
}

export function getVideoDuration(video: string): Promise<number> {
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

export function generateThumbnail(
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
