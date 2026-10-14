#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把解析出的 books.json 转成前端 TS 模块（按词书分片，懒加载）"""
import json, os, sys

RAW = sys.argv[1] if len(sys.argv) > 1 else "./src/data/_raw/books.json"
OUTDIR = sys.argv[2] if len(sys.argv) > 2 else "./src/data/books"

META = {
    "primary_school": ("小学英语", "小学", "教育部大纲小学英语词汇，入门起点", "emerald"),
    "primary":        ("中考英语", "中考", "中考高频核心词，打基础首选",     "sky"),
    "npee":           ("高考英语", "高考", "高考大纲词汇，涵盖高中全部核心词", "indigo"),
    "cet4":           ("大学英语四级", "四级", "CET-4 大纲词汇，含高频短语",    "blue"),
    "cet6":           ("大学英语六级", "六级", "CET-6 大纲词汇，进阶必备",      "violet"),
    "toefl":          ("TOEFL", "TOEFL", "托福词汇，覆盖北美学术场景",        "rose"),
    "gre":            ("GRE", "GRE", "GRE 核心词汇，欧美名校申请词表",       "amber"),
}
ORDER = ["primary_school", "primary", "npee", "cet4", "cet6", "toefl", "gre"]


def main():
    data = json.load(open(RAW, encoding="utf-8"))
    os.makedirs(OUTDIR, exist_ok=True)
    index = []

    for bid in ORDER:
        if bid not in data:
            continue
        words = data[bid]
        name, short, desc, color = META[bid]
        index.append({
            "id": bid, "name": name, "shortName": short,
            "description": desc, "color": color, "totalCount": len(words),
        })
        # 精简字段后写出，减少包体积
        slim = [
            {
                "w": w["word"],
                "p": w.get("phonetic", ""),
                "f": w.get("freq", 3),
                "d": [[x["pos"], x["cn"]] for x in w.get("definitions", [])],
                "y": w.get("tip", ""),
            }
            for w in words
        ]
        out = os.path.join(OUTDIR, f"{bid}.json")
        with open(out, "w", encoding="utf-8") as f:
            json.dump(slim, f, ensure_ascii=False, separators=(",", ":"))
        kb = os.path.getsize(out) / 1024
        print(f"[ok] {bid:14s} {len(slim):6d} words  {kb:8.1f} KB")

    with open(os.path.join(OUTDIR, "index.json"), "w", encoding="utf-8") as f:
        json.dump(index, f, ensure_ascii=False, indent=2)
    total = sum(i["totalCount"] for i in index)
    print(f"[ok] index.json  books={len(index)}  total_words={total}")


if __name__ == "__main__":
    main()