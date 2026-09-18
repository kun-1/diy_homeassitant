import fs from "node:fs";
import path from "node:path";
import {TIMEZONE} from "Config.js";

export type MessageStatus = "waiting" | "printed";

export type LoveMessage = {
    id: string;
    title: string;
    text: string;
    signature: string;
    createdAt: string;
    status: MessageStatus;
};

export type PrintJob = {
    id: string;
    messageId: string;
    status: "mocked";
    createdAt: string;
    artifactPath: string;
};

export type ReminderSettings = {
    enabled: boolean;
    workEndTime: string;
    leadMinutes: number;
    text: string;
};

export type DisplayState =
    | {mode: "idle"}
    | {mode: "reminder"; text: string; workEndTime: string}
    | {mode: "secret_waiting"; messageId: string};

type StoreState = {
    messages: LoveMessage[];
    currentMessageId: string;
    printJobs: PrintJob[];
    reminder: ReminderSettings;
};

const dataDir = process.env['DATA_DIR'] ?? path.join(import.meta.dirname, "..", "..", "data");
const statePath = path.join(dataDir, "state.json");
const printDir = path.join(dataDir, "print-jobs");
const DEFAULT_REMINDER: ReminderSettings = {
    enabled: true,
    workEndTime: "18:00",
    leadMinutes: 30,
    text: "差不多要下班啦\n今天要去健身房吗？",
};

function ensureData() {
    fs.mkdirSync(printDir, {recursive: true});
    if (!fs.existsSync(statePath)) {
        const message = makeMessage("今天也要好好生活", "愿你今天遇到的每一件小事，都温柔地站在你这边。", "永远爱你的我", "printed");
        writeState({messages: [message], currentMessageId: message.id, printJobs: [], reminder: DEFAULT_REMINDER});
    }
}

function makeMessage(title: string, text: string, signature: string, status: MessageStatus = "waiting"): LoveMessage {
    return {
        id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        title,
        text,
        signature,
        createdAt: new Date().toISOString(),
        status,
    };
}

function readState(): StoreState {
    ensureData();
    const raw = JSON.parse(fs.readFileSync(statePath, "utf8")) as Partial<StoreState> & {messages?: Array<LoveMessage & {status?: MessageStatus}>};
    return {
        messages: (raw.messages ?? []).map((message) => ({...message, status: message.status ?? "printed"})),
        currentMessageId: raw.currentMessageId ?? raw.messages?.[0]?.id ?? "",
        printJobs: raw.printJobs ?? [],
        reminder: raw.reminder ?? DEFAULT_REMINDER,
    };
}

function writeState(state: StoreState) {
    ensureDataDirectory();
    const tempPath = `${statePath}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(state, null, 2));
    fs.renameSync(tempPath, statePath);
}

function ensureDataDirectory() {
    fs.mkdirSync(dataDir, {recursive: true});
    fs.mkdirSync(printDir, {recursive: true});
}

export function listMessages(): LoveMessage[] {
    return readState().messages.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getCurrentMessage(): LoveMessage {
    const state = readState();
    return state.messages.find((message) => message.id === state.currentMessageId) ?? state.messages[0];
}

export function getPendingMessage(): LoveMessage | undefined {
    const state = readState();
    const current = state.messages.find((message) => message.id === state.currentMessageId && message.status === "waiting");
    return current ?? state.messages.find((message) => message.status === "waiting");
}

export function createMessage(title: string, text: string, signature: string): LoveMessage {
    const state = readState();
    const message = makeMessage(title.trim(), text.trim(), signature.trim());
    state.messages.push(message);
    state.currentMessageId = message.id;
    writeState(state);
    return message;
}

export function setCurrentMessage(messageId: string): LoveMessage | undefined {
    const state = readState();
    const message = state.messages.find((item) => item.id === messageId);
    if (!message) return undefined;
    state.currentMessageId = messageId;
    writeState(state);
    return message;
}

export function queueMockPrint(messageId: string): PrintJob | undefined {
    const state = readState();
    const message = state.messages.find((item) => item.id === messageId);
    if (!message) return undefined;
    const id = `print-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const artifactPath = path.join(printDir, `${id}.txt`);
    const job: PrintJob = {id, messageId, status: "mocked", createdAt: new Date().toISOString(), artifactPath};
    fs.writeFileSync(artifactPath, [message.title, "", message.text, "", `— ${message.signature}`].join("\n"));
    message.status = "printed";
    state.printJobs.unshift(job);
    state.printJobs = state.printJobs.slice(0, 50);
    const next = state.messages.find((item) => item.status === "waiting");
    state.currentMessageId = next?.id ?? message.id;
    writeState(state);
    return job;
}

export function pressButton(): {message: LoveMessage; job: PrintJob} | undefined {
    const message = getPendingMessage();
    if (!message) return undefined;
    const job = queueMockPrint(message.id);
    return job ? {message, job} : undefined;
}

export function listPrintJobs(): PrintJob[] {
    return readState().printJobs;
}

export function getReminder(): ReminderSettings {
    return readState().reminder;
}

export function setReminder(input: Partial<ReminderSettings>): ReminderSettings {
    const state = readState();
    state.reminder = {
        enabled: input.enabled ?? state.reminder.enabled,
        workEndTime: input.workEndTime ?? state.reminder.workEndTime,
        leadMinutes: Math.max(1, Math.min(240, Number(input.leadMinutes ?? state.reminder.leadMinutes))),
        text: input.text?.trim() || state.reminder.text,
    };
    writeState(state);
    return state.reminder;
}

function localMinuteNow(): number {
    const parts = new Intl.DateTimeFormat("en-GB", {timeZone: TIMEZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23"}).formatToParts(new Date());
    const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
    const minute = Number(parts.find((part) => part.type === "minute")?.value ?? 0);
    return hour * 60 + minute;
}

function parseMinute(value: string): number {
    const [hour, minute] = value.split(":").map(Number);
    return Number.isFinite(hour) && Number.isFinite(minute) ? hour * 60 + minute : 18 * 60;
}

export function getDisplayState(): DisplayState {
    const pending = getPendingMessage();
    if (pending) return {mode: "secret_waiting", messageId: pending.id};
    const reminder = getReminder();
    const now = localMinuteNow();
    const end = parseMinute(reminder.workEndTime);
    const start = end - reminder.leadMinutes;
    if (reminder.enabled && now >= start && now < end) {
        return {mode: "reminder", text: reminder.text, workEndTime: reminder.workEndTime};
    }
    return {mode: "idle"};
}

export function getDisplayRefreshSeconds(): number {
    if (getPendingMessage()) return 30;
    const reminder = getReminder();
    if (!reminder.enabled) return 60;
    const now = localMinuteNow();
    const end = parseMinute(reminder.workEndTime);
    const start = end - reminder.leadMinutes;
    let minutesUntilBoundary = now < start ? start - now : 1440 - now + start;
    if (now >= start && now < end) minutesUntilBoundary = end - now;
    return Math.max(30, Math.min(60, minutesUntilBoundary * 60));
}
