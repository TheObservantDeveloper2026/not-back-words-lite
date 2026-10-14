#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
通过 GitHub Contents API 上传本地仓库（git 协议在受限网络下不可用时的兜底方案）。

流程：
  1. 取仓库默认分支的当前 tree（空仓库返回 404）
  2. 对每个文件算 blob SHA
  3. PUT 到 git data API 创建 blob -> tree -> commit -> 更新 ref
"""
import base64, hashlib, json, os, subprocess, sys, time, urllib.request, urllib.error

TOKEN = sys.argv[1]
REPO = sys.argv[2]          # owner/name
LOCAL = sys.argv[3]
REF = sys.argv[4] if len(sys.argv) > 4 else "main"

API = f"https://api.github.com/repos/{REPO}"
BLOB = f"{API}/git/blobs"
TREE = f"{API}/git/trees"
COMMIT = f"{API}/git/commits"
REF_API = f"{API}/git/refs/heads/{REF}"


def req(url, method="GET", payload=None):
    data = json.dumps(payload).encode() if payload is not None else None
    r = urllib.request.Request(url, data=data, method=method)
    r.add_header("Authorization", f"token {TOKEN}")
    r.add_header("Accept", "application/vnd.github+json")
    r.add_header("User-Agent", "bbdict-uploader")
    r.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(r, timeout=120) as resp:
            return resp.status, json.loads(resp.read().decode() or "{}")
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        return e.code, json.loads(body) if body else {}


def git_ls_files():
    out = subprocess.check_output(["git", "-C", LOCAL, "ls-files"], text=True)
    return [x for x in out.splitlines() if x.strip()]


def ensure_repo_not_empty():
    """GitHub 的 blob/tree API 在空仓库上会拒绝（'Git Repository is empty'）。
    用 Contents API 写一个 .keep 文件，把仓库变成'非空'后再走批量上传。"""
    st, ref = req(REF_API)
    if st == 200:
        return ref["object"]["sha"], False

    print("[2/5] 空仓库 -> 通过 Contents API 建占位提交")
    st, res = req(f"{API}/contents/.keep", "PUT", {
        "message": "chore: initial commit",
        "content": base64.b64encode(b"# placeholder\n").decode(),
        "branch": REF,
    })
    if st not in (200, 201):
        print(f"[FAIL] 占位提交: {st} {res.get('message')}")
        sys.exit(1)

    sha = res["commit"]["sha"]
    print(f"      占位 commit @ {sha[:8]}")
    return sha, True


def main():
    files = git_ls_files()
    print(f"[1/5] 待上传文件 {len(files)} 个")

    # 1. 确保仓库非空（GitHub 限制），取当前 ref
    base_commit, is_placeholder = ensure_repo_not_empty()
    if not is_placeholder:
        print(f"[2/5] 远程已有分支 {REF} @ {base_commit[:8]}")

    # 2. 建 blob
    print("[3/5] 上传 blobs…")
    entries = []
    for i, path in enumerate(files, 1):
        with open(os.path.join(LOCAL, path), "rb") as f:
            raw = f.read()
        payload = {"content": base64.b64encode(raw).decode(), "encoding": "base64"}
        st, blob = req(BLOB, "POST", payload)
        if st != 201:
            print(f"  [FAIL] {path}: {blob.get('message')}")
            return 1
        mode = "100755" if os.access(os.path.join(LOCAL, path), os.X_OK) else "100644"
        entries.append({"path": path, "mode": mode, "type": "blob", "sha": blob["sha"]})
        if i % 10 == 0 or i == len(files):
            print(f"  {i}/{len(files)}")

    # 3. 建 tree（以占位 tree 为 base，便于删除多余文件）
    st, tree = req(TREE, "POST", {"base_tree": base_commit, "tree": entries})
    if st != 201:
        st, tree = req(TREE, "POST", {"tree": entries})
    if st != 201:
        print(f"[FAIL] 建 tree: {tree.get('message')}")
        return 1
    print(f"[4/5] tree @ {tree['sha'][:8]}")

    # 4. 建 commit
    msg = subprocess.check_output(
        ["git", "-C", LOCAL, "log", "-1", "--pretty=%B"], text=True
    ).strip()
    if is_placeholder:
        msg = msg + "\n\n(Uploaded via GitHub API; local git history preserved locally.)"

    st, commit = req(COMMIT, "POST", {
        "message": msg,
        "tree": tree["sha"],
        "parents": [base_commit],
    })
    if st != 201:
        print(f"[FAIL] 建 commit: {commit.get('message')}")
        return 1
    print(f"[5/5] commit @ {commit['sha'][:8]}")

    # 5. 更新 ref
    st, res = req(REF_API, "PATCH", {"sha": commit["sha"], "force": False})
    if st not in (200, 201):
        print(f"[FAIL] 更新 ref: {res.get('message')}")
        return 1

    print(f"\n完成 → {commit['sha']}")
    print(f"https://github.com/{REPO}/commit/{commit['sha']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())