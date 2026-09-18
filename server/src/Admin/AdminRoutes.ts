import {Router, Request, Response} from "express";
import {buildScreen} from "Screen/Screen.js";
import {createMessage, getCurrentMessage, getDisplayRefreshSeconds, getDisplayState, getReminder, listMessages, listPrintJobs, pressButton, queueMockPrint, setCurrentMessage, setReminder} from "Love/Store.js";

export const adminRoutes = Router();

adminRoutes.get("/state", (_req: Request, res: Response) => {
    res.json({
        currentMessageId: getCurrentMessage().id,
        display: getDisplayState(),
        refreshSeconds: getDisplayRefreshSeconds(),
        reminder: getReminder(),
        messages: listMessages(),
        printJobs: listPrintJobs(),
    });
});

adminRoutes.get("/messages", (_req: Request, res: Response) => {
    res.json({currentMessageId: getCurrentMessage().id, display: getDisplayState(), messages: listMessages()});
});

adminRoutes.post("/messages", (req: Request, res: Response) => {
    const {title, text, signature} = req.body as {title?: string; text?: string; signature?: string};
    if (!title?.trim() || !text?.trim() || !signature?.trim()) {
        res.status(400).json({error: "title, text and signature are required"});
        return;
    }
    res.status(201).json(createMessage(title, text, signature));
});

adminRoutes.post("/messages/:id/display", (req: Request, res: Response) => {
    const message = setCurrentMessage(readParam(req, "id"));
    if (!message) {
        res.status(404).json({error: "message not found"});
        return;
    }
    res.json(message);
});

adminRoutes.post("/messages/:id/print", (req: Request, res: Response) => {
    const job = queueMockPrint(readParam(req, "id"));
    if (!job) {
        res.status(404).json({error: "message not found"});
        return;
    }
    res.status(202).json(job);
});

adminRoutes.post("/button", (_req: Request, res: Response) => {
    const result = pressButton();
    if (!result) {
        res.status(409).json({error: "没有待打印的信件"});
        return;
    }
    res.status(202).json({status: "printed", messageId: result.message.id, job: result.job});
});

adminRoutes.post("/settings/reminder", (req: Request, res: Response) => {
    const {enabled, workEndTime, leadMinutes, text} = req.body as {enabled?: boolean; workEndTime?: string; leadMinutes?: number; text?: string};
    if (workEndTime !== undefined && !/^\d{2}:\d{2}$/.test(workEndTime)) {
        res.status(400).json({error: "workEndTime must be HH:MM"});
        return;
    }
    res.json(setReminder({enabled, workEndTime, leadMinutes, text}));
});

adminRoutes.get("/print-jobs", (_req: Request, res: Response) => {
    res.json({jobs: listPrintJobs()});
});

adminRoutes.get("/screen", async (_req: Request, res: Response) => {
    res.type("bmp").send(await buildScreen());
});

function readParam(req: Request, name: string): string {
    const value = req.params[name];
    return Array.isArray(value) ? value[0] : value;
}
