import {Jimp} from "jimp";

const WIDTH = 800;
const HEIGHT = 480;
const ROW_BYTES = WIDTH / 8;
const PLANE_BYTES = ROW_BYTES * HEIGHT;
const HEADER = "E2P1";

/** Convert a source PNG into the two bit planes expected by the B/W/R panel. */
export async function PNGtoEPD(input: Buffer): Promise<Buffer> {
    const image = await Jimp.read(input);
    const source = image.bitmap;
    const output = Buffer.alloc(4 + PLANE_BYTES * 2, 0xff);
    output.write(HEADER, 0, "ascii");
    const black = output.subarray(4, 4 + PLANE_BYTES);
    const red = output.subarray(4 + PLANE_BYTES);

    for (let y = 0; y < HEIGHT; y++) {
        const sourceY = Math.min(source.height - 1, Math.floor(y * source.height / HEIGHT));
        for (let x = 0; x < WIDTH; x++) {
            const sourceX = Math.min(source.width - 1, Math.floor(x * source.width / WIDTH));
            const offset = (sourceY * source.width + sourceX) * 4;
            const r = source.data[offset];
            const g = source.data[offset + 1];
            const b = source.data[offset + 2];
            // The current bird-frame palette is intentionally grayscale. Keep
            // the red plane white so colored source artwork cannot leak red
            // pixels onto the B/W/R panel.
            const isRed = false;
            const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
            // A lower threshold discards the pale scan texture while retaining
            // the dark plate outlines, which reads much more clearly at 1bpp.
            const isBlack = !isRed && luminance < 100;
            const byteOffset = y * ROW_BYTES + (x >> 3);
            const bit = 1 << (7 - (x & 7));
            if (isBlack) black[byteOffset] &= ~bit;
            if (isRed) red[byteOffset] &= ~bit;
        }
    }
    return output;
}

export function isEPDImage(data: Uint8Array): boolean {
    return data.length >= 4 && data[0] === 0x45 && data[1] === 0x32 && data[2] === 0x50 && data[3] === 0x31;
}
