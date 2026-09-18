import {Router, Request, Response} from "express";
import {createMessage, getDisplayState, getPendingMessage} from "./Store.js";

export const inboxRoutes = Router();

// MVP PWA endpoint. Authentication can be added before exposing the server
// outside the home network; the secret text is never part of display BMP data.
inboxRoutes.post("/messages", (req: Request, res: Response) => {
    const {title, text, signature} = req.body as {title?: string; text?: string; signature?: string};
    if (!title?.trim() || !text?.trim() || !signature?.trim()) {
        res.status(400).json({error: "title, text and signature are required"});
        return;
    }
    res.status(201).json(createMessage(title, text, signature));
});

inboxRoutes.get("/status", (_req: Request, res: Response) => {
    const pending = getPendingMessage();
    res.json({display: getDisplayState(), pendingMessageId: pending?.id ?? null});
});
