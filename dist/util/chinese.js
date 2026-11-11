/**
 * Traditional/Simplified Chinese normalisation + fuzzy title matching.
 *
 * The primary converter is OpenCC (opencc-js), which covers the full character
 * set. A small built-in fallback map keeps the plugin functional when the
 * optional dependency is unavailable (e.g. a stripped-down NAS image).
 */
/** Fallback pairs, only used if opencc-js cannot be loaded. */
const FALLBACK_PAIRS = [
    '萬万', '與与', '專专', '業业', '東东', '絲丝', '兩两', '嚴严', '個个', '豐丰',
    '臨临', '為为', '麗丽', '舉举', '麼么', '義义', '烏乌', '樂乐', '喬乔', '習习',
    '鄉乡', '書书', '買买', '亂乱', '爭争', '於于', '雲云', '亞亚', '產产', '親亲',
    '億亿', '僅仅', '從从', '倉仓', '儀仪', '們们', '債债', '傾倾', '僑侨', '價价',
    '兒儿', '黨党', '內内', '冊册', '寫写', '軍军', '農农', '決决', '淨净', '涼凉',
    '減减', '幾几', '鳳凤', '憑凭', '凱凯', '擊击', '劉刘', '則则', '剛刚', '創创',
    '動动', '務务', '勝胜', '勞劳', '勢势', '勸劝', '匯汇', '區区', '醫医', '華华',
    '協协', '單单', '賣卖', '盧卢', '衛卫', '卻却', '廠厂', '厭厌', '參参', '雙双',
    '發发', '變变', '葉叶', '號号', '嘆叹', '嚇吓', '嗎吗', '員员', '啟启', '唄呗',
    '園园', '國国', '圓圆', '聖圣', '場场', '壞坏', '塊块', '堅坚', '壇坛', '壞坏',
    '壯壮', '聲声', '處处', '備备', '夠够', '夢梦', '夾夹', '奪夺', '奩奁', '媽妈',
    '嬸婶', '孫孙', '學学', '寧宁', '實实', '寵宠', '審审', '寫写', '層层', '屆届',
    '屬属', '嶺岭', '嶼屿', '帥帅', '師师', '帳帐', '簾帘', '幫帮', '廠厂', '廣广',
    '開开', '關关', '閉闭', '問问', '間间', '閒闲', '閔闵', '闆板', '陣阵', '陰阴',
    '陸陆', '陳陈', '險险', '隱隐', '雋隽', '雜杂', '雞鸡', '難难', '雲云', '電电',
    '霧雾', '靈灵', '韓韩', '頁页', '頂顶', '項项', '順顺', '預预', '領领', '頭头',
    '題题', '顏颜', '願愿', '類类', '顧顾', '顯显', '風风', '飄飘', '飛飞', '養养',
    '館馆', '騎骑', '驚惊', '體体', '髮发', '鬥斗', '鳥鸟', '鳴鸣', '鴉鸦', '麗丽',
    '龍龙', '龜龟', '輕轻', '說说', '讀读', '誰谁', '語语', '請请', '諾诺', '講讲',
    '謝谢', '識识', '譯译', '記记', '訪访', '設设', '許许', '訴诉', '診诊', '詞词',
    '試试', '詩诗', '話话', '該该', '詳详', '誠诚', '論论', '誤误', '誘诱', '課课',
    '調调', '談谈', '諾诺', '謀谋', '謂谓', '謎谜', '講讲', '證证', '識识', '譽誉',
    '護护', '豐丰', '貝贝', '貞贞', '負负', '財财', '貢贡', '貧贫', '貨货', '販贩',
    '貪贪', '貫贯', '貴贵', '買买', '費费', '賀贺', '資资', '賊贼', '賓宾', '賞赏',
    '賠赔', '賦赋', '賬账', '質质', '購购', '賽赛', '贈赠', '贊赞', '贏赢', '趙赵',
    '趕赶', '趨趋', '車车', '軍军', '軌轨', '軟软', '較较', '載载', '輔辅', '輛辆',
    '輩辈', '輪轮', '輸输', '轉转', '辦办', '農农', '遠远', '選选', '遺遗', '遲迟',
    '邁迈', '還还', '邊边', '邏逻', '郵邮', '鄭郑', '醬酱', '釀酿', '釋释', '鋼钢',
    '錄录', '錢钱', '錦锦', '鎮镇', '鏡镜', '鐘钟', '鐵铁', '鑑鉴', '長长', '門门',
    '閃闪', '閉闭', '開开', '閏闰', '閑闲', '間间', '閱阅', '闆板',
];
const fallbackMap = new Map();
for (const pair of FALLBACK_PAIRS) {
    if (pair.length === 2)
        fallbackMap.set(pair[0], pair[1]);
}
let converter = null;
let extra = new Map();
let initialised = false;
/** Idempotent, safe to call from every tool invocation. */
export async function ensureChinese(extraPairs = '') {
    if (initialised)
        return;
    initialised = true;
    try {
        const mod = await import('opencc-js');
        const factory = mod.Converter
            ?? mod.default?.Converter;
        if (typeof factory === 'function') {
            converter = factory({ from: 't', to: 'cn' });
        }
    }
    catch {
        converter = null; // fallback table remains active
    }
    extra = new Map();
    for (const token of extraPairs.split(/[,，\s]+/)) {
        const pair = token.trim();
        if (pair.length === 2)
            extra.set(pair[0], pair[1]);
    }
}
/** Traditional -> Simplified (plus operator-supplied extra pairs). */
export function toSimplified(text) {
    const converted = converter ? converter(text) : text;
    return [...converted].map((ch) => extra.get(ch) ?? fallbackMap.get(ch) ?? ch).join('');
}
/** Comparison key: NFKC + simplified + lowercase, punctuation and spacing removed. */
export function normalizeText(text) {
    return toSimplified(text.normalize('NFKC'))
        .toLowerCase()
        .replace(/[\s\p{P}\p{S}]/gu, '');
}
/** Character bigrams for fuzzy matching of short CJK strings. */
function bigrams(text) {
    const chars = [...text];
    if (chars.length === 0)
        return new Set();
    if (chars.length === 1)
        return new Set([chars[0]]);
    const out = new Set();
    for (let i = 0; i < chars.length - 1; i++)
        out.add(chars[i] + chars[i + 1]);
    return out;
}
/** Sørensen–Dice coefficient over character bigrams, in [0, 1]. */
export function diceSimilarity(a, b) {
    if (a === b)
        return 1;
    const left = bigrams(a);
    const right = bigrams(b);
    if (left.size === 0 || right.size === 0)
        return 0;
    let shared = 0;
    for (const item of left)
        if (right.has(item))
            shared++;
    return (2 * shared) / (left.size + right.size);
}
/** Score one book against a normalised query across title / alias / author / tags. */
export function scoreBook(query, fields) {
    const q = normalizeText(query);
    if (!q)
        return { score: 0, matchedBy: [] };
    const matchedBy = [];
    let best = 0;
    const consider = (value, weight, label) => {
        if (!value)
            return;
        const n = normalizeText(value);
        if (!n)
            return;
        let local = 0;
        if (n === q)
            local = 1;
        else if (n.includes(q) || q.includes(n))
            local = 0.9 * Math.min(n.length, q.length) / Math.max(n.length, q.length) + 0.1;
        else
            local = diceSimilarity(n, q);
        if (local >= 0.55)
            matchedBy.push(label);
        best = Math.max(best, local * weight);
    };
    consider(fields.title, 100, 'title');
    for (const alias of fields.aliases)
        consider(alias, 80, 'alias');
    consider(fields.author, 70, 'author');
    for (const tag of fields.tags)
        consider(tag, 25, 'tag');
    if (fields.description)
        consider(fields.description.slice(0, 120), 10, 'description');
    if (best > 0 && (toSimplified(query) !== query || toSimplified(fields.title) !== fields.title)) {
        matchedBy.push('variant');
    }
    return { score: Math.round(best * 100) / 100, matchedBy: [...new Set(matchedBy)] };
}
//# sourceMappingURL=chinese.js.map