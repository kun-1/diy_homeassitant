import {renderToStaticMarkup} from "react-dom/server";

export function renderAdminPage(): string {
    return `<!doctype html>${renderToStaticMarkup(<AdminPage/>)}`;
}

function AdminPage() {
    return <html lang="zh-CN">
        <head>
            <meta charSet="utf-8"/>
            <meta name="viewport" content="width=device-width, initial-scale=1"/>
            <title>Love Display · Mac mini</title>
            <link rel="stylesheet" href="/assets/admin.css"/>
        </head>
        <body>
            <main className="shell">
                <header className="topbar">
                    <div><p className="eyebrow">LOVE DISPLAY / MAC MINI</p><h1>给她的一块小屏幕</h1></div>
                    <span className="status-pill" id="service-status">服务启动中</span>
                </header>
                <section className="state-banner" id="display-state">正在读取屏幕状态…</section>
                <section className="grid">
                    <div className="panel compose">
                        <p className="eyebrow">SECRET MAIL</p><h2>写一封不会出现在屏幕上的信</h2>
                        <form id="message-form">
                            <label>信件标题<input name="title" required defaultValue="给今天辛苦工作的你"/></label>
                            <label>情话正文<textarea name="text" rows={5} required defaultValue="等你打印出来再看。今天也要好好照顾自己。"/></label>
                            <label>署名<input name="signature" required defaultValue="永远爱你的我"/></label>
                            <button type="submit">发送秘密信件</button>
                        </form>
                        <p className="hint" id="form-result"></p>
                    </div>
                    <div className="panel preview-panel">
                        <div className="panel-heading"><div><p className="eyebrow">E-INK PREVIEW</p><h2>屏幕只显示状态</h2></div><button className="secondary" id="refresh-preview">刷新</button></div>
                        <div className="preview-frame"><img id="screen-preview" src="/admin/screen" alt="电子墨水屏预览"/></div>
                        <div className="preview-actions"><button id="simulate-button">模拟按下实体按钮</button><span id="print-result" className="hint"></span></div>
                    </div>
                </section>
                <section className="panel reminder-panel">
                    <div className="panel-heading"><div><p className="eyebrow">DYNAMIC REMINDER</p><h2>下班提醒规则</h2></div><span className="hint">只在状态变化时刷新屏幕</span></div>
                    <form id="reminder-form" className="reminder-form">
                        <label className="check-label"><input type="checkbox" name="enabled"/>启用</label>
                        <label>下班时间<input name="workEndTime" type="time" required/></label>
                        <label>提前提醒（分钟）<input name="leadMinutes" type="number" min="1" max="240" required/></label>
                        <label className="wide">屏幕文案<textarea name="text" rows={2} required></textarea></label>
                        <button type="submit">保存提醒设置</button>
                    </form>
                    <p className="hint" id="reminder-result"></p>
                </section>
                <section className="panel history"><div className="panel-heading"><div><p className="eyebrow">MESSAGE BOX</p><h2>秘密信件</h2></div><span className="hint">正文只在打印后揭晓</span></div><div id="messages" className="message-list"></div></section>
            </main>
            <script src="/assets/admin.js" defer></script>
        </body>
    </html>;
}
