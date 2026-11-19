#!/usr/bin/env python3
"""
Construit public/data/tajwid/levels.json à partir de scripts/tajwid_curriculum.py.

Pour chaque exemple coranique, le script récupère sur l'API Quran.com :
  - le texte uthmani balisé (règles de tajwid) de chaque mot,
  - la translittération,
  - l'audio du verset par Mahmoud Khalil Al-Husary (Mu'allim, récitation 12)
    et les minutages mot à mot, pour ne jouer que les mots de l'exemple.

Il vérifie aussi que la règle annoncée est bien présente dans l'exemple
et que les lettres à surligner existent : toute incohérence fait échouer
le script.

Usage : python3 scripts/build-tajwid.py [--cache DOSSIER]
"""
import json
import os
import re
import sys
import unicodedata
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from tajwid_curriculum import LEVELS  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "public", "data", "tajwid", "levels.json")
API = "https://api.quran.com/api/v4"
RECITATION = 12  # Al-Husary, Mu'allim
AUDIO_ROOT = "https://verses.quran.foundation/"

cache_dir = None
if "--cache" in sys.argv:
    cache_dir = sys.argv[sys.argv.index("--cache") + 1]
    os.makedirs(cache_dir, exist_ok=True)

_verses = {}


def fetch_verse(key):
    if key in _verses:
        return _verses[key]
    path = os.path.join(cache_dir, key.replace(":", "_") + ".json") if cache_dir else None
    if path and os.path.exists(path):
        data = json.load(open(path, encoding="utf-8"))
    else:
        url = (f"{API}/verses/by_key/{key}?words=true"
               "&word_fields=text_uthmani,text_uthmani_tajweed,char_type_name"
               f"&audio={RECITATION}")
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0", "Accept": "application/json"})
        data = json.load(urllib.request.urlopen(req, timeout=30))["verse"]
        if path:
            json.dump(data, open(path, "w", encoding="utf-8"), ensure_ascii=False)
    _verses[key] = data
    return data


TAG = re.compile(r"<(/)?(?:rule|tajweed)(?:\s+class=([a-z0-9_-]+))?\s*>")


def parse_runs(markup):
    """Balisage tajwid → liste de caractères avec leur règle (gère l'imbrication)."""
    chars, stack, pos = [], [], 0
    for m in TAG.finditer(markup):
        for c in markup[pos:m.start()]:
            chars.append([c, next((r for r in reversed(stack) if not r.startswith("custom")), None)])
        if m.group(1):
            if stack:
                stack.pop()
        else:
            stack.append(m.group(2) or "")
        pos = m.end()
    for c in re.sub(r"<[^>]*>", "", markup[pos:]):
        chars.append([c, next((r for r in reversed(stack) if not r.startswith("custom")), None)])
    return chars


def group(chars):
    runs = []
    for c, r in chars:
        if runs and runs[-1][1] == r:
            runs[-1][0] += c
        else:
            runs.append([c, r])
    return runs


def resolve(ex, where):
    verse = fetch_verse(ex["ref"])
    words = {w["position"]: w for w in verse["words"] if w["char_type_name"] == "word"}
    seg = {}
    for s in verse["audio"]["segments"]:
        if len(s) >= 4:
            seg[int(s[1])] = (int(s[2]), int(s[3]))
    out_words, found = [], set()
    for p in range(ex["start"], ex["end"] + 1):
        if p not in words:
            raise SystemExit(f"[{where}] {ex['ref']} : mot {p} introuvable")
        w = words[p]
        chars = parse_runs(w["text_uthmani_tajweed"] or w["text_uthmani"])
        found.update(r for _, r in chars if r)
        sub = ex["mark"].get(p)
        if sub:
            text = "".join(c for c, _ in chars)
            i = text.find(sub)
            if i < 0:
                # Même lettres, ordre des signes différent (ex. chadda/kasra) : on compare
                # en forme canonique, qui ne fait que réordonner (longueur identique).
                norm = unicodedata.normalize("NFD", text)
                if len(norm) == len(text):
                    i = norm.find(unicodedata.normalize("NFD", sub))
            if i < 0:
                raise SystemExit(f"[{where}] {ex['ref']} mot {p} « {text} » ne contient pas « {sub} »")
            for k in range(i, i + len(sub)):
                chars[k][1] = "mark"
        word = {
            "runs": group(chars),
            "tr": (w.get("transliteration") or {}).get("text") or "",
        }
        if p in seg:
            word["s"], word["e"] = seg[p]
        out_words.append(word)
    for p in ex["mark"]:
        if not ex["start"] <= p <= ex["end"]:
            raise SystemExit(f"[{where}] {ex['ref']} : mot surligné {p} hors de l'exemple")
    if ex["rules"]:
        missing = [r for r in ex["rules"] if r not in found]
        if missing:
            raise SystemExit(f"[{where}] {ex['ref']} {ex['start']}-{ex['end']} : règle(s) {missing} absente(s) — trouvé {sorted(found)}")
    positions = sorted(seg)
    start_pos = max([p for p in positions if p <= ex["start"]] or positions[:1])
    end_pos = min([p for p in positions if p >= ex["end"]] or positions[-1:])
    url = verse["audio"]["url"]
    url = "https:" + url if url.startswith("//") else (url if url.startswith("http") else AUDIO_ROOT + url.lstrip("/"))
    res = {
        "t": "ex",
        "ref": ex["ref"],
        "words": out_words,
        "rules": ex["rules"],
        "audio": url,
        "s": seg[start_pos][0],
        "e": seg[end_pos][1],
    }
    if ex.get("note"):
        res["note"] = ex["note"]
    if ex.get("plain"):
        res["plain"] = True
    return res


def main():
    levels = []
    n_ex = n_q = 0
    for level in LEVELS:
        lessons = []
        for lesson in level["lessons"]:
            where = lesson["id"]
            blocks = [resolve(b, where) if b["t"] == "ex" else b for b in lesson["blocks"]]
            quiz = []
            for q in lesson["quiz"]:
                q = dict(q)
                if not 0 <= q["a"] < len(q["opts"]):
                    raise SystemExit(f"[{where}] réponse hors limites : {q['q']}")
                if "ex" in q:
                    q["ex"] = resolve(q["ex"], where)
                    n_ex += 1
                quiz.append(q)
            n_ex += sum(1 for b in blocks if b["t"] == "ex")
            n_q += len(quiz)
            lessons.append({**lesson, "blocks": blocks, "quiz": quiz})
        levels.append({**level, "lessons": lessons})
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump({"reciter": "Mahmoud Khalil Al-Husary (Mu'allim)", "levels": levels}, f,
                  ensure_ascii=False, separators=(",", ":"))
    n_lessons = sum(len(l["lessons"]) for l in levels)
    print(f"OK : {len(levels)} niveaux, {n_lessons} leçons, {n_ex} exemples audio, {n_q} questions → {OUT}")


if __name__ == "__main__":
    main()
