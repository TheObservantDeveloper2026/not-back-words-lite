#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
把 mahavivo/english-wordlists 的原始 txt 解析成结构化 JSON 词库。
源项目采用 CC-BY / 公共词表整理，词表内容本身为公共领域考纲词汇。
"""
import json, re, os, sys, unicodedata
from collections import OrderedDict

SRC = sys.argv[1] if len(sys.argv) > 1 else "."
OUT = sys.argv[2] if len(sys.argv) > 2 else "./out"

# 词性缩写 -> 标准
POS_MAP = {
    "n": "n.", "v": "v.", "vt": "v.", "vi": "v.", "aux": "v.",
    "a": "adj.", "adj": "adj.", "ad": "adv.", "adv": "adv.",
    "prep": "prep.", "conj": "conj.", "pron": "pron.", "num": "num.",
    "art": "art.", "int": "int.", "interj": "int.",
}
# 常见词性标记（含多词缩写）
POS_TOKENS = r"(?:art|n|v|vt|vi|aux|a|adj|ad|adv|prep|conj|pron|num|int|interj)"

# IPA 字符归一：把考纲表的非标准符号转成标准 IPA
IPA_FIX = {
    "\u02c8": "\u02c8", "\u02d0": "\u02d0", "\u02d1": "\u02d1",
    "ɡ": "g", "ɑ": "\u0251", "ɵ": "\u0254", "ʌ": "\u028c",
    "ǚ": "\u01da", "ǜ": "\u01dc", "ǽ": "e\u0301", "ǣ": "\u00e6",
    "ǔ": "\u028c", "ǖ": "y", "ǐ": "i\u0301", "ǐ": "i\u0301",
}


def fix_ipa(s):
    if not s:
        return ""
    # GRE 表用 ASCII 近似音标: 3->θ(音位近似), 5->ð, '->重音符, :->长音
    for k, v in IPA_FIX.items():
        s = s.replace(k, v)
    # GRE 老式 ASCII 记法: 用 ' 表重音、: 表长音
    # 只在音标内部替换 '，避免影响词形里的撇号（如 don't）
    s = re.sub(r"'([aeiouAEIOUæʌɑɒəɛɪʊɔː])", "\u02c8\\1", s)
    s = s.replace("'", "\u02c8")
    s = s.replace(":", "\u02d0")          # : -> ː
    s = s.replace("?", "\u0254")          # ? -> ɜ
    s = s.replace("3", "\u03b8")          # 3 -> θ
    s = s.replace("5", "\u00f0")          # 5 -> ð
    s = re.sub(r"\s+", " ", s).strip()
    if s and not s.startswith("/") and not s.startswith("["):
        s = "/" + s + "/"
    return clean_phonetic(s)


def norm_pos(tok):
    tok = tok.strip().lower().rstrip(".")
    return POS_MAP.get(tok, "")


def strip_marker(word):
    """去掉 * 标记，并把 'a (an)' 拆成主词 a"""
    w = word.lstrip("*").replace("\u2191", "").strip()
    # a (an) -> a ；括号里通常是同义/变体形式
    w = re.sub(r"\s*\([^)]*\)\s*$", "", w)
    return w.strip()


def clean_phonetic(s):
    """考纲音标里 (ə) 表示可选音节，直接去掉；空括号表示该音可省略。"""
    # 反复去除括号及其内容（可能嵌套）
    prev = None
    while prev != s:
        prev = s
        s = re.sub(r"\([^)]*\)", "", s)
    s = s.replace(" ", "")
    return s.strip()


def split_defs(raw, max_senses=3):
    """把 'n. 能力；才能' / 'vt. 放弃 n. 放任' 拆成 [{pos, cn}]，保留多义"""
    raw = re.sub(r"\s+", " ", raw).strip()
    if not raw:
        return []
    # 清理源表脏数据: 释义里混入的 '/n.' 等残留词性标记
    raw = re.sub(rf"[/、]?\s*({POS_TOKENS})\.\s*(?=[\u4e00-\u9fff])", r"\1. ", raw)
    # 词性标记：允许紧贴中文（放弃n. 放任）或前面是空格/标点
    matches = list(re.finditer(
        rf"(?:(?<=^)|(?<=[\s\uff1b;,\uff0c\u3001]))({POS_TOKENS})\.\s*",
        raw
    ))
    # 有些源词表里 "中文+vt." 连写（如 '沉溺n. 放任'），额外扫描紧贴中文的词性
    matches = sorted(
        set(matches) | set(re.finditer(
            rf"(?<=[\u4e00-\u9fff])({POS_TOKENS})\.\s*", raw)),
        key=lambda m: m.start(),
    )
    if not matches:
        clean = raw.strip(" .;")
        return [{"pos": "", "cn": clean}] if clean else []

    out = []
    for i, m in enumerate(matches):
        pos = norm_pos(m.group(1))
        start = m.end()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(raw)
        body = raw[start:end]
        body = re.sub(r"^\s*\d+\s*[.、)）]?\s*", "", body)      # 去掉义项序号
        body = re.sub(r"^\([^)]*\)\s*", "", body)              # 去掉 (常作...) 语法注
        # 多义：按 ; ； 切分，最多 max_senses 条
        senses = [s for s in re.split(r"[\uff1b;]", body) if s.strip()]
        if not senses:
            continue
        # 第一段再按逗号切一部分（保留前 max_senses-1 个）
        for j, sense in enumerate(senses[:max_senses]):
            s = sense.strip(" .;,")
            # 逗号切义：'放弃,沉溺' -> '放弃' + '沉溺'
            parts = [p.strip(" .,") for p in re.split(r"[,，]", s) if p.strip(" .,")]
            for k, p in enumerate(parts):
                if len(out) >= max_senses:
                    break
                out.append({"pos": pos, "cn": p})
    return out


def dedupe_key(w):
    return unicodedata.normalize("NFKC", w).lower()


def load_txt_words(path):
    """没有音标释义的纯词表 -> 只取词"""
    words = []
    with open(path, encoding="utf-8-sig", errors="replace") as f:
        for line in f:
            t = line.strip()
            if not t:
                continue
            if re.fullmatch(r"[A-Za-z][A-Za-z\-'. ]*", t):
                words.append(strip_marker(t))
    return words


def parse_zh_list(path):
    """中考词表格式: word [ipa] pos. 释义  或 word [ipa] pos./pos. 释义"""
    words = []
    pat = re.compile(
        rf"^([A-Za-z][A-Za-z\-'.() ]*?)\s*\[([^\]]+)\]\s*(.*)$"
    )
    with open(path, encoding="utf-8-sig", errors="replace") as f:
        for line in f:
            t = line.strip()
            if not t or t.startswith("\u4e00") or t.isalpha() and len(t) <= 3 and not re.search(r"[\u4e00-\u9fff]", t) and "[" not in t:
                # 跳过章节标题行（纯字母如 A / B）
                if re.fullmatch(r"[A-Z]", t):
                    continue
            m = pat.match(t)
            if not m:
                continue
            w = strip_marker(m.group(1))
            ipa = fix_ipa(m.group(2))
            rest = m.group(3)
            # 可能是 'above [ipa] prep. 在…上面 a. 上面的 ad. 在…之上' 多词性
            defs = split_defs(rest)
            if not defs:
                continue
            words.append({"word": w, "phonetic": ipa, "definitions": defs})
    return words


def parse_cet_toefl(path):
    """通用格式: word [ipa] pos. 释义 （CET4/TOEFL/GRE/NPEE 共用）"""
    words = []
    pat = re.compile(r"^([A-Za-z][A-Za-z\-'.() ]*?)\s*\[([^\]]+)\]\s*(.*)$")
    with open(path, encoding="utf-8-sig", errors="replace") as f:
        for line in f:
            t = line.strip()
            if not t:
                continue
            m = pat.match(t)
            if not m:
                continue
            w = strip_marker(m.group(1))
            if not w:
                continue
            ipa = fix_ipa(m.group(2))
            rest = m.group(3)
            defs = split_defs(rest)
            if not defs:
                continue
            words.append({"word": w, "phonetic": ipa, "definitions": defs})
    return words


def parse_taiwan(path):
    """台灣高中: word pos. 中文 (Big5 -> 需转换，尝试 gbk)"""
    words = []
    pat = re.compile(rf"^(\*?[A-Za-z][A-Za-z\-'. ]*?)\s+({POS_TOKENS})\.\s*(.+)$")
    with open(path, encoding="utf-8-sig", errors="replace") as f:
        for line in f:
            t = line.strip()
            if not t:
                continue
            m = pat.match(t)
            if not m:
                continue
            w = strip_marker(m.group(1))
            pos = norm_pos(m.group(2))
            cn = m.group(3).strip()
            if cn:
                words.append({"word": w, "phonetic": "", "definitions": [{"pos": pos, "cn": cn}]})
    return words


def build(entries, book_id, base_freq=4, max_words=None):
    """合并同源词、排序、打频次"""
    seen = OrderedDict()
    for e in entries:
        k = dedupe_key(e["word"])
        if not k or k in seen:
            continue
        e["book"] = book_id
        e["freq"] = base_freq
        seen[k] = e
    items = list(seen.values())
    if max_words:
        items = items[:max_words]
    return items


def main():
    os.makedirs(OUT, exist_ok=True)
    books = {}

    specs = [
        ("primary_school", "小学英语大纲词汇.txt",     None,               5),
        ("primary",   "中考英语词汇表.txt",          parse_zh_list,      5),
        ("npee",      "NPEE_Wordlist.txt",           parse_cet_toefl,    5),
        ("cet4",      "CET4_edited.txt",             parse_cet_toefl,    4),
        ("cet6",      "CET6_edited.txt",             parse_cet_toefl,    3),
        ("toefl",     "TOEFL.txt",                   parse_cet_toefl,    2),
        ("gre",       "GRE_8000_Words.txt",          parse_cet_toefl,    2),
    ]
    for book_id, fname, parser, freq in specs:
        path = os.path.join(SRC, fname)
        if not os.path.exists(path):
            print(f"[skip] {fname} not found")
            continue
        if parser is None:
            ws = [{"word": w, "phonetic": "", "definitions": []} for w in load_txt_words(path)]
        else:
            ws = parser(path)
        built = build(ws, book_id, freq)
        books[book_id] = built
        with_phon = sum(1 for w in built if w.get("phonetic"))
        with_def = sum(1 for w in built if w.get("definitions"))
        print(f"[ok] {book_id:14s} {len(built):6d} words  ipa={with_phon}  def={with_def}")

    # 跨书补全：缺音标/释义的词从已解析的书中继承
    lookup = {}
    for ws in books.values():
        for w in ws:
            k = dedupe_key(w["word"])
            if not k:
                continue
            cur = lookup.setdefault(k, {"phonetic": "", "definitions": []})
            if not cur["phonetic"] and w.get("phonetic"):
                cur["phonetic"] = w["phonetic"]
            if not cur["definitions"] and w.get("definitions"):
                cur["definitions"] = w["definitions"]

    filled = 0
    for ws in books.values():
        for w in ws:
            src = lookup.get(dedupe_key(w["word"]))
            if not src:
                continue
            if not w.get("phonetic") and src["phonetic"]:
                w["phonetic"] = src["phonetic"]
                filled += 1
            if not w.get("definitions") and src["definitions"]:
                w["definitions"] = src["definitions"]
    print(f"[fill] cross-book filled {filled} phonetics")
    for bid, ws in books.items():
        missing = [w["word"] for w in ws if not w.get("definitions") or not w.get("phonetic")]
        print(f"       {bid:14s} incomplete={len(missing)} {missing[:5]}")

    with open(os.path.join(OUT, "books.json"), "w", encoding="utf-8") as f:
        json.dump(books, f, ensure_ascii=False)
    print("written", os.path.join(OUT, "books.json"))


if __name__ == "__main__":
    main()