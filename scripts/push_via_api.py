#!/usr/bin/env python3
"""
通过 GitHub Git Data API 推送提交，绕开被封的 github.com:443 git 传输协议。

用法:
    GH_TOKEN=xxx python3 push_via_api.py --dry-run
    GH_TOKEN=xxx python3 push_via_api.py

原理: 逐提交回放 origin/main..main 的差异，每个提交先用 blob 上传变更文件，
再以 base_tree 构造 tree，创建 commit 并把 parent 接到上一个新建 commit，
最后 PATCH refs/heads/main。历史与 author/committer 时间戳完整保留。
"""
import argparse
import base64
import json
import os
import subprocess
import sys
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor

API = "https://api.github.com"
REPO = os.environ.get("GH_REPO", "r9msm7cm4c-crypto/quant-desk")
BRANCH = os.environ.get("GH_BRANCH", "main")
TOKEN = os.environ.get("GH_TOKEN", "")


def git(*args, binary=False):
    r = subprocess.run(["git", *args], capture_output=True, check=True)
    return r.stdout if binary else r.stdout.decode("utf-8", "replace")


def api(method, path, payload=None, dry=False):
    if dry:
        return {"dry": True}
    body = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(
        API + path,
        data=body,
        method=method,
        headers={
            "Authorization": f"Bearer {TOKEN}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "Content-Type": "application/json",
            "User-Agent": "quant-desk-ota-pusher",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=90) as r:
            raw = r.read()
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", "replace")[:600]
        raise SystemExit(f"[API {e.code}] {method} {path}\n{detail}")


def local_blob_id(path, commit):
    """git 本地计算 blob sha1，用于避免重复上传。"""
    return git("rev-parse", f"{commit}:{path}").strip()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--base", default="origin/main")
    ap.add_argument("--head", default="main")
    args = ap.parse_args()

    if not TOKEN and not args.dry_run:
        raise SystemExit("缺少 GH_TOKEN")

    commits = git("rev-list", "--reverse", f"{args.base}..{args.head}").split()
    if not commits:
        print("没有待推送提交")
        return

    print(f"待推送 {len(commits)} 个提交 -> {REPO}@{BRANCH}")

    # 远端当前 HEAD 必须与 base 一致，否则拒绝（避免覆盖别人的提交）
    if not args.dry_run:
        ref = api("GET", f"/repos/{REPO}/git/ref/heads/{BRANCH}")
        remote_sha = ref["object"]["sha"]
        base_sha = git("rev-parse", args.base).strip()
        print(f"远端 {remote_sha[:8]} / 本地 base {base_sha[:8]}")
        if remote_sha != base_sha:
            raise SystemExit("远端已前进，请先 fetch 并 rebase，停止推送")

    base_tree = git("rev-parse", f"{args.base}^{{tree}}").strip()
    prev_commit = git("rev-parse", args.base).strip()
    uploaded = 0
    deleted = 0

    for sha in commits:
        subject = git("show", "-s", "--format=%s", sha).strip()
        message = git("show", "-s", "--format=%B", sha)
        meta = git("show", "-s", "--format=%an%x00%ae%x00%at%x00%cn%x00%ce%x00%ct", sha).split("\x00")
        author = {"name": meta[0], "email": meta[1], "date": int(meta[2])}
        committer = {"name": meta[3], "email": meta[4], "date": int(meta[5])}

        parent = git("rev-parse", f"{sha}^").strip()
        raw = git("diff-tree", "-r", "-z", "--no-commit-id", "--name-status", "-M", parent, sha)
        fields = [f for f in raw.split("\x00") if f]

        entries = []
        i = 0
        while i < len(fields):
            status = fields[i]
            if status.startswith("R") or status.startswith("C"):
                old, new = fields[i + 1], fields[i + 2]
                i += 3
                # 重命名按 删除旧路径 + 新增新路径 处理
                entries.append({"path": old, "mode": "100644", "type": "blob", "sha": None})
                deleted += 1
                status, path = "A", new
            else:
                path = fields[i + 1]
                i += 2

            if status == "D":
                entries.append({"path": path, "mode": "100644", "type": "blob", "sha": None})
                deleted += 1
                continue

            mode = git("ls-tree", sha, "--", path).split()[0]
            content = git("cat-file", "blob", f"{sha}:{path}", binary=True)
            if args.dry_run:
                entries.append({"path": path, "mode": mode, "type": "blob", "sha": "dry"})
            else:
                entries.append({"path": path, "mode": mode, "type": "blob", "sha": None, "_blob": content})

        pending = [e for e in entries if "_blob" in e]
        if pending and not args.dry_run:
            done = [0]

            def upload(entry):
                blob = api(
                    "POST",
                    f"/repos/{REPO}/git/blobs",
                    {"content": base64.b64encode(entry.pop("_blob")).decode(), "encoding": "base64"},
                )
                entry["sha"] = blob["sha"]
                done[0] += 1
                if done[0] % 100 == 0:
                    print(f"            uploaded {done[0]}/{len(pending)}", flush=True)

            with ThreadPoolExecutor(max_workers=6) as pool:
                list(pool.map(upload, pending))
            uploaded += len(pending)

        print(f"  {sha[:8]} {subject[:56]}  (+{len(entries)} 项)", flush=True)

        if args.dry_run:
            base_tree = "dry-tree"
            prev_commit = "dry-commit"
            continue

        tree = api("POST", f"/repos/{REPO}/git/trees", {"base_tree": base_tree, "tree": entries})
        commit = api(
            "POST",
            f"/repos/{REPO}/git/commits",
            {
                "message": message,
                "tree": tree["sha"],
                "parents": [prev_commit],
                "author": author,
                "committer": committer,
            },
        )
        base_tree = tree["sha"]
        prev_commit = commit["sha"]
        print(f"           -> {commit['sha'][:8]}")

    if args.dry_run:
        print(f"\n[dry-run] 将上传 {uploaded} 个 blob，删除 {deleted} 项，创建 {len(commits)} 个提交")
        return

    api("PATCH", f"/repos/{REPO}/git/refs/heads/{BRANCH}", {"sha": prev_commit, "force": False})
    print(f"\n完成: {BRANCH} -> {prev_commit}")
    print(f"上传 blob {uploaded} 个，删除 {deleted} 项")


if __name__ == "__main__":
    main()
