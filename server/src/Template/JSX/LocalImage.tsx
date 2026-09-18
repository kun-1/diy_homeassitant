import {readFileSync} from "node:fs"

export function LocalImage({file, style}: { file: string, style?: React.CSSProperties }) {
    const content = readFileSync(file);
    const mime = file.toLowerCase().endsWith('.jpg') || file.toLowerCase().endsWith('.jpeg')
        ? 'image/jpeg'
        : 'image/png';
    const src = `data:${mime};base64,` + content.toString('base64');
    return <img src={src} style={style}/>;
}
