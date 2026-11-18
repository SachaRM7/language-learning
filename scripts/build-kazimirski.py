# Index « racine → page » du dictionnaire arabe-français de Kazimirski (1860, domaine public, scans archive.org).
#
# L'OCR de l'arabe est trop bruité pour en extraire les définitions, mais les mots de 3 lettres bien lus
# (en-têtes de page et racines en vedette) suivent l'ordre alphabétique du dictionnaire : la plus longue
# sous-suite alphabétique de ces mots, page après page, donne des repères fiables. Sortie :
# public/data/kazimirski.json = { volumes, anchors: [[vol, page_image, racine_min, racine_max], …] }.
#
# Usage : python3 scripts/build-kazimirski.py <dossier_de_travail>   (télécharge l'OCR d'archive.org)
import bisect, gzip, json, pathlib, re, sys, urllib.request

WORK = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else 'kazimirski-work')
OUT = pathlib.Path(__file__).resolve().parent.parent / 'public' / 'data' / 'kazimirski.json'
VOLS = {1: 'dictionnairearab01bibeuoft', 2: 'dictionnairearab02bibeuoft'}
ALPHA = 'ابتثجحخدذرزسشصضطظعغفقكلمنهوي'
RANK = {c: i for i, c in enumerate(ALPHA)}
HAMZA = str.maketrans({'أ': 'ا', 'إ': 'ا', 'آ': 'ا', 'ء': 'ا', 'ؤ': 'ا', 'ئ': 'ا', 'ى': 'ي', 'ٱ': 'ا'})
HARAKAT = re.compile(r'[ً-ٰٟـۖ-ۭ]')
WORD = re.compile(r'[ء-يٰ-ۓ]+')


def fetch(name, gz=False):
    WORK.mkdir(parents=True, exist_ok=True)
    path = WORK / name
    if not path.exists():
        ident = name.split('_')[0]
        data = urllib.request.urlopen(f'https://archive.org/download/{ident}/{name}' + ('.gz' if gz else '')).read()
        path.write_bytes(gzip.decompress(data) if gz else data)
    return path.read_text(encoding='utf-8')


def key(w):
    w = HARAKAT.sub('', w).translate(HAMZA)
    if len(w) != 3 or any(c not in RANK for c in w):
        return None
    return tuple(RANK[c] for c in w)


points = []  # (vol, index de page OCR, clé)
for vol, ident in VOLS.items():
    text = fetch(f'{ident}_hocr_searchtext.txt', gz=True)
    index = json.loads(fetch(f'{ident}_hocr_pageindex.json', gz=True))
    for i, (a, b, *_) in enumerate(index):
        page = text[a:b]
        head = page[:40]  # en-tête courant : racine(s) de la page, lue(s) en grand
        for w in WORD.findall(head):
            k = key(w)
            if k:
                points.extend([(vol, i, k)] * 4)  # poids plus fort pour l'en-tête
        for w in WORD.findall(page):
            k = key(w)
            if k:
                points.append((vol, i, k))

# Plus longue sous-suite non décroissante des clés, dans l'ordre des pages
tails, tidx, prev = [], [], [None] * len(points)
for n, (_, _, k) in enumerate(points):
    j = bisect.bisect_right(tails, k)
    if j == len(tails):
        tails.append(k); tidx.append(n)
    else:
        tails[j] = k; tidx[j] = n
    prev[n] = tidx[j - 1] if j else None
seq, n = [], tidx[-1]
while n is not None:
    seq.append(points[n]); n = prev[n]
seq.reverse()

pages = {}
for vol, i, k in seq:
    lo_hi = pages.setdefault((vol, i), [k, k])
    lo_hi[1] = k  # clés la plus basse et la plus haute ancrées sur la page
# L'index OCR i correspond à l'image « page/n{i-1} » d'archive.org
word = lambda k: ''.join(ALPHA[c] for c in k)
anchors = [[vol, i - 1, word(lo), word(hi)] for (vol, i), (lo, hi) in sorted(pages.items())]
OUT.write_text(json.dumps({
    'source': 'A. de Biberstein Kazimirski, Dictionnaire arabe-français, Paris, 1860 (domaine public) — scans archive.org',
    'volumes': {str(v): ident for v, ident in VOLS.items()},
    'alphabet': ALPHA,
    'anchors': anchors,
}, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
print(f'{len(points)} mots, {len(seq)} repères, {len(anchors)} pages ancrées → {OUT}')
