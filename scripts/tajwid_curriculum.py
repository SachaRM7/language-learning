# -*- coding: utf-8 -*-
"""
Parcours Tajwid de HelloArabic — source éditable.

Ce fichier décrit les niveaux, leçons, explications, exemples coraniques et quiz.
Le script `build-tajwid.py` le lit, va chercher le texte exact (mushaf uthmani,
balisage tajwid) et les minutages mot à mot de la récitation pédagogique
d'Al-Husary (Mu'allim) sur l'API Quran.com, puis écrit data/tajwid/levels.json.

Blocs disponibles dans une leçon :
  P("texte")                         paragraphe (**gras** autorisé)
  KEY([("terme", "définition"), ...]) liste de définitions
  LETTERS("légende", "ءهعحغخ")      lettres concernées
  TIP("texte")                       encadré astuce
  TABLE(["col", ...], [[...], ...])  tableau
  EX("s:v", debut, fin, rules, note, mark)  exemple coranique audio
        rules : classes tajwid mises en avant (None = toutes)
        mark  : {position_du_mot: "sous-chaîne"} pour surligner une lettre
                précise quand la règle n'est pas colorée dans le mushaf.
Quiz : Q("question", ["choix", ...], index_bonne_réponse, "explication", ex=EX(...))
"""


def P(text):
    return {"t": "p", "text": text}


def KEY(items):
    return {"t": "key", "items": [list(i) for i in items]}


def LETTERS(label, letters):
    return {"t": "letters", "label": label, "letters": [c for c in letters if c.strip()]}


def TIP(text):
    return {"t": "tip", "text": text}


def TABLE(head, rows):
    return {"t": "table", "head": head, "rows": rows}


def EX(ref, start, end=None, rules=None, note="", mark=None):
    return {"t": "ex", "ref": ref, "start": start, "end": end or start,
            "rules": rules, "note": note, "mark": mark or {}}


def Q(q, opts, a, why, ex=None):
    item = {"q": q, "opts": opts, "a": a, "why": why}
    if ex:
        ex = dict(ex)
        ex["plain"] = True
        item["ex"] = ex
    return item


MADD = ["madda_normal", "madda_permissible", "madda_obligatory_mottasel",
        "madda_obligatory_monfasel", "madda_necessary"]
IDGHAM = ["idgham_ghunnah", "idgham_wo_ghunnah"]

LEVELS = [
    # ------------------------------------------------------------------ NIVEAU 1
    {
        "id": "n1",
        "name": "Niveau 1",
        "title": "Les fondations",
        "desc": "Voyelles, soukoun, chadda, tanwin et prolongation naturelle.",
        "lessons": [
            {
                "id": "n1-l1",
                "title": "Qu'est-ce que le tajwid ?",
                "ar": "التَّجْوِيد",
                "subtitle": "Définition, objectif et types d'erreurs",
                "blocks": [
                    P("Le mot **tajwid** (تَجْوِيد) vient de la racine ج-و-د : « rendre beau, parfaire ». En récitation, c'est l'art de **donner à chaque lettre son droit** : son point de sortie (makhraj), ses caractéristiques (sifāt) et les règles qui s'appliquent selon son voisinage."),
                    P("Le tajwid se transmet **par l'écoute** (talaqqī) : on écoute un récitateur fiable puis on imite. C'est pourquoi chaque exemple de ce parcours est accompagné de la récitation pédagogique de **Mahmoud Khalil Al-Husary** (version Mu'allim, lente et très articulée)."),
                    KEY([
                        ("Lahn jalī (erreur évidente)", "Changer une lettre, une voyelle ou en oublier une. Elle peut altérer le sens : c'est la première chose à corriger."),
                        ("Lahn khafī (erreur discrète)", "Négliger une règle d'embellissement : nasalisation, durée d'une prolongation, emphase… Seule une oreille exercée la remarque."),
                    ]),
                    EX("1:1", 1, 4, None, "Écoute la basmala : chaque couleur signale une règle que tu apprendras dans ce parcours."),
                    TIP("Méthode conseillée : 1) écoute l'exemple, 2) répète à voix haute, 3) réécoute en ralentissant (bouton vitesse), 4) compare."),
                ],
                "quiz": [
                    Q("Que signifie littéralement « tajwid » ?", ["Mémoriser", "Rendre beau, parfaire", "Traduire", "Chanter"], 1,
                      "Tajwid vient de la racine ج-و-د : rendre bon, parfaire."),
                    Q("Changer une lettre par une autre est…", ["Un lahn khafī", "Un lahn jalī", "Autorisé si on va vite", "Une règle de prolongation"], 1,
                      "C'est une erreur évidente (lahn jalī) car elle peut changer le sens."),
                    Q("Comment apprend-on correctement le tajwid ?", ["Uniquement en lisant des livres", "En écoutant puis en imitant un récitateur fiable", "En devinant", "En lisant vite"], 1,
                      "Le tajwid est une pratique orale transmise par l'écoute (talaqqī)."),
                    Q("Raccourcir une prolongation de 4 temps à 2 temps est plutôt…", ["Un lahn khafī", "Un lahn jalī", "Correct", "Une règle d'arrêt"], 0,
                      "C'est une erreur discrète (lahn khafī) : la lettre et la voyelle restent justes."),
                ],
            },
            {
                "id": "n1-l2",
                "title": "Voyelles, soukoun et chadda",
                "ar": "الحَرَكَات",
                "subtitle": "Les signes de base du mushaf",
                "blocks": [
                    P("Une lettre arabe porte une **voyelle brève** (ḥaraka) ou un **soukoun** (absence de voyelle). Une voyelle brève dure **un temps** (ḥaraka) : c'est l'unité de mesure de tout le tajwid."),
                    TABLE(["Signe", "Nom", "Son"], [
                        ["بَ", "Fatḥa", "a"],
                        ["بِ", "Kasra", "i"],
                        ["بُ", "Ḍamma", "ou"],
                        ["بۡ", "Soukoun", "lettre sans voyelle"],
                        ["بّ", "Chadda", "lettre doublée"],
                    ]),
                    P("Dans le mushaf uthmani (celui de l'app), le **soukoun** a la forme d'une petite tête de ḫā (ۡ). La **chadda** indique une lettre doublée : la première est sans voyelle, la seconde porte la voyelle. Il faut appuyer sur elle."),
                    EX("1:2", 1, 1, [], "Le lām et le mīm portent un soukoun : al-ḥam-du.", {1: "مۡ"}),
                    EX("1:2", 3, 3, [], "Le bā’ porte une chadda : rab-bi (deux b).", {3: "بِّ"}),
                    TIP("Une lettre sans aucun signe dans le mushaf uthmani est souvent une lettre qui ne se prononce pas (ou qui se fond dans la suivante)."),
                ],
                "quiz": [
                    Q("Combien de temps dure une voyelle brève ?", ["Un temps", "Deux temps", "Quatre temps", "Ça dépend"], 0,
                      "Une voyelle brève = 1 temps, l'unité de mesure du tajwid."),
                    Q("Que signifie la chadda (ّ) ?", ["La lettre est muette", "La lettre est doublée", "La lettre est longue", "Il faut s'arrêter"], 1,
                      "La chadda double la lettre : une première sans voyelle + une seconde vocalisée."),
                    Q("Dans le mushaf uthmani, le soukoun ressemble à…", ["Un petit cercle", "Une petite tête de ḫā (ۡ)", "Un trait horizontal", "Deux points"], 1,
                      "Le mushaf de Médine utilise une petite tête de ḫā pour le soukoun."),
                    Q("Quelle voyelle se prononce « i » ?", ["Fatḥa", "Ḍamma", "Kasra", "Soukoun"], 2,
                      "La kasra (trait sous la lettre) donne le son « i »."),
                ],
            },
            {
                "id": "n1-l3",
                "title": "Le tanwin",
                "ar": "التَّنْوِين",
                "subtitle": "Le « n » final qui ne s'écrit pas",
                "blocks": [
                    P("Le **tanwin** est une voyelle doublée en fin de nom : ـً (an), ـٍ (in), ـٌ (oun). Il se prononce comme un **nūn sākin** (n sans voyelle) qui ne s'écrit pas."),
                    P("C'est important : toutes les règles du nūn sākin (niveau 3) s'appliquent aussi au tanwin."),
                    P("Le mushaf de Médine donne un indice visuel : quand les deux signes du tanwin sont **superposés**, le « n » se prononce clairement ; quand ils sont **décalés**, le « n » se fond ou se cache dans la lettre suivante."),
                    EX("97:3", 3, 3, [], "Tanwin ḍamma : khay-roun.", {3: "رٌ"}),
                    EX("99:7", 5, 5, [], "Tanwin fatḥa : khay-ran.", {5: "رًا"}),
                    EX("97:5", 1, 2, [], "Signes superposés : le n de salāmoun s'entend nettement avant le hā’.", {1: "مٌ"}),
                ],
                "quiz": [
                    Q("Le tanwin se prononce comme…", ["Un mīm", "Un nūn sākin", "Une prolongation", "Un hamza"], 1,
                      "Le tanwin est un nūn sākin non écrit en fin de nom."),
                    Q("Signes du tanwin superposés indiquent que le « n »…", ["Se prononce clairement", "Est caché", "Disparaît", "Devient un mīm"], 0,
                      "Superposés = iẓhār (prononciation claire). Décalés = fusion ou dissimulation."),
                    Q("Le tanwin apparaît…", ["Au début des mots", "À la fin des noms", "Seulement sur les verbes", "Sur les lettres de prolongation"], 1,
                      "Le tanwin est propre aux fins de noms."),
                ],
            },
            {
                "id": "n1-l4",
                "title": "La prolongation naturelle",
                "ar": "المَدّ الطَّبِيعِي",
                "subtitle": "Les trois lettres de madd — 2 temps",
                "blocks": [
                    P("Trois lettres servent à **prolonger** la voyelle qui les précède :"),
                    TABLE(["Lettre", "Condition", "Exemple"], [
                        ["ا (alif)", "après une fatḥa", "قَالَ — qāla"],
                        ["و (wāw sākin)", "après une ḍamma", "يَقُولُ — yaqoūlou"],
                        ["ي (yā’ sākin)", "après une kasra", "قِيلَ — qīla"],
                    ]),
                    P("Si rien ne suit (ni hamza, ni soukoun), c'est le **madd ṭabī‘ī** (naturel) : il dure **2 temps**, ni plus ni moins. Le petit alif suscrit (ـٰ) du mushaf uthmani compte aussi comme une lettre de madd."),
                    EX("1:4", 1, 1, ["madda_normal"], "Mā-liki : le petit alif suscrit se prolonge 2 temps."),
                    EX("99:3", 1, 1, [], "Wa-qā-la : l'alif après la fatḥa.", {1: "َا"}),
                    EX("101:6", 4, 4, ["madda_normal"], "Mawā-zī-nouhou : alif et yā’ de prolongation.", {4: "ِي"}),
                    TIP("Pour sentir 2 temps : c'est le temps de plier deux doigts à un rythme régulier."),
                ],
                "quiz": [
                    Q("Combien dure le madd naturel ?", ["1 temps", "2 temps", "4 temps", "6 temps"], 1,
                      "Le madd ṭabī‘ī dure exactement 2 temps."),
                    Q("Le wāw est une lettre de madd quand il est sākin et précédé de…", ["Une fatḥa", "Une kasra", "Une ḍamma", "Un soukoun"], 2,
                      "Wāw sākin après ḍamma = « oū » prolongé."),
                    Q("Le petit alif suscrit (ـٰ) est…", ["Muet", "Une lettre de madd", "Un tanwin", "Un signe d'arrêt"], 1,
                      "Il se prolonge comme un alif normal."),
                    Q("Quelle lettre de madd entends-tu dans le premier mot ?", ["Alif", "Wāw", "Yā’", "Aucune"], 0,
                      "Mā-liki : l'alif (suscrit) après la fatḥa du mīm.", ex=EX("1:4", 1, 1)),
                ],
            },
            {
                "id": "n1-l5",
                "title": "Hamza de liaison et lettres muettes",
                "ar": "هَمْزَة الوَصْل",
                "subtitle": "Les lettres qu'on lit… ou qu'on ne lit pas",
                "blocks": [
                    P("La **hamzat al-waṣl** (ٱ, alif surmonté d'une petite tête de ṣād) se prononce **seulement au début** de la lecture. Au milieu d'une phrase, elle disparaît et on enchaîne directement."),
                    TABLE(["Si on commence par ٱ…", "On prononce"], [
                        ["ٱلْ (article)", "a — ٱلۡحَمۡدُ : al-ḥamdou"],
                        ["3e lettre avec ḍamma", "ou — ٱدۡعُ : oud‘ou"],
                        ["autres cas", "i — ٱهۡدِنَا : ihdinā"],
                    ]),
                    EX("1:6", 1, 1, [], "Au début du verset, elle se prononce : ih-dinā.", {1: "ٱ"}),
                    EX("1:1", 1, 2, ["ham_wasl"], "En liaison : bismi-llāhi, l'alif ne se prononce pas."),
                    P("De même, l'**alif après le wāw du pluriel** (ءَامَنُواۡ) est muet : il porte un petit cercle (ۡ) dans le mushaf."),
                    EX("103:3", 3, 4, ["slnt"], "Āmanoū wa ‘amiloū : les alifs finaux sont muets."),
                ],
                "quiz": [
                    Q("Quand prononce-t-on la hamzat al-waṣl ?", ["Toujours", "Jamais", "Seulement quand on commence la lecture par elle", "Seulement à l'arrêt"], 2,
                      "Elle n'est prononcée qu'au début ; en liaison elle tombe."),
                    Q("Si on commence par ٱلۡقَارِعَةُ, on dit…", ["Il-qāri‘a", "Al-qāri‘a", "Oul-qāri‘a", "Qāri‘a"], 1,
                      "Devant l'article, la hamzat al-waṣl se lit avec fatḥa : al-."),
                    Q("L'alif après le wāw du pluriel (كَفَرُواۡ)…", ["Se prolonge 4 temps", "Est muet", "Se lit « a »", "Devient une hamza"], 1,
                      "Il est marqué d'un petit cercle : il ne se prononce pas."),
                ],
            },
        ],
    },
    # ------------------------------------------------------------------ NIVEAU 2
    {
        "id": "n2",
        "name": "Niveau 2",
        "title": "Articulation et qualités",
        "desc": "Points de sortie des lettres, emphase, rā’ et lām d'Allah.",
        "lessons": [
            {
                "id": "n2-l1",
                "title": "Les 5 zones d'articulation",
                "ar": "المَخَارِج",
                "subtitle": "D'où sortent les lettres",
                "blocks": [
                    P("Chaque lettre a un **makhraj** (point de sortie). Les savants les regroupent en **5 zones** :"),
                    TABLE(["Zone", "Lettres"], [
                        ["Al-Jawf — la cavité (bouche + gorge)", "Les 3 lettres de madd : ا و ي"],
                        ["Al-Ḥalq — la gorge", "ء ه ع ح غ خ"],
                        ["Al-Lisān — la langue", "18 lettres : ق ك ج ش ي ض ل ن ر ط د ت ص س ز ظ ذ ث"],
                        ["Ash-Shafatān — les lèvres", "ف و ب م"],
                        ["Al-Khayshūm — le nez", "La ghunna (nasalisation) du nūn et du mīm"],
                    ]),
                    TIP("Pour trouver le makhraj d'une lettre : mets-la avec un soukoun après une hamza avec fatḥa (أَبۡ، أَتۡ، أَقۡ…). L'endroit où le son s'arrête est son point de sortie."),
                    EX("114:4", 4, 4, ["ghunnah"], "Al-khan-nās : la ghunna sort du nez (khayshūm)."),
                    EX("1:2", 1, 1, [], "Le ḥā’ sort du milieu de la gorge.", {1: "ح"}),
                ],
                "quiz": [
                    Q("Combien de zones d'articulation principales ?", ["3", "5", "7", "17"], 1,
                      "Cavité, gorge, langue, lèvres et nez."),
                    Q("D'où sort la ghunna ?", ["Des lèvres", "De la gorge", "Du nez (khayshūm)", "De la cavité"], 2,
                      "La nasalisation sort du khayshūm (cavité nasale)."),
                    Q("Quelle zone produit le plus de lettres ?", ["La gorge", "La langue", "Les lèvres", "Le nez"], 1,
                      "La langue produit 18 lettres."),
                    Q("Les lettres ف و ب م sortent…", ["Des lèvres", "De la gorge", "Du nez", "De la cavité"], 0,
                      "Ce sont les lettres labiales (shafawiyya)."),
                ],
            },
            {
                "id": "n2-l2",
                "title": "Les lettres de la gorge",
                "ar": "حُرُوف الحَلْق",
                "subtitle": "ء ه — ع ح — غ خ",
                "blocks": [
                    P("La gorge a trois étages, chacun produisant deux lettres :"),
                    TABLE(["Étage", "Lettres", "Piège fréquent"], [
                        ["Fond (près de la poitrine)", "ء ه", "Ne pas avaler le hā’ final"],
                        ["Milieu", "ع ح", "ع n'est pas un « a » ; ح est plus soufflé que ه"],
                        ["Haut (près de la bouche)", "غ خ", "غ ≈ r grasseyé, خ ≈ jota espagnole"],
                    ]),
                    LETTERS("Lettres de la gorge", "ءهعحغخ"),
                    EX("108:1", 2, 2, [], "A‘-ṭaynāka : le ‘ayn sākin, serré au milieu de la gorge.", {2: "عۡ"}),
                    EX("1:7", 6, 6, [], "Al-magh-ḍoūbi : le ghayn au haut de la gorge.", {6: "غۡ"}),
                    EX("106:4", 7, 7, [], "Khawfin : le khā’.", {7: "خ"}),
                    TIP("Ces 6 lettres reviendront au niveau 3 : devant elles, le nūn se prononce toujours clairement (iẓhār)."),
                ],
                "quiz": [
                    Q("Quelles lettres sortent du fond de la gorge ?", ["ع ح", "غ خ", "ء ه", "ق ك"], 2,
                      "Le fond de la gorge produit la hamza et le hā’."),
                    Q("Quelle paire sort du milieu de la gorge ?", ["ع ح", "ء ه", "غ خ", "ج ش"], 0,
                      "‘Ayn et ḥā’ sortent du milieu de la gorge."),
                    Q("Quelle lettre de la gorge entend-on ici, juste après le premier alif ?", ["ح", "ع", "ه", "خ"], 1,
                      "A‘-ṭaynāka : c'est un ‘ayn sākin.", ex=EX("108:1", 2, 2)),
                ],
            },
            {
                "id": "n2-l3",
                "title": "Emphase et légèreté",
                "ar": "التَّفْخِيم وَالتَّرْقِيق",
                "subtitle": "Les 7 lettres toujours épaisses",
                "blocks": [
                    P("Certaines lettres se prononcent en **remplissant la bouche** (tafkhīm, son épais/grave). Elles sont réunies dans la phrase **خُصَّ ضَغْطٍ قِظْ** :"),
                    LETTERS("Lettres toujours emphatiques", "خصضغطقظ"),
                    P("Toutes les autres lettres sont **légères** (tarqīq), sauf trois qui varient : l'**alif** (il suit la lettre précédente), le **rā’** et le **lām** du nom d'Allah (leçons suivantes)."),
                    KEY([
                        ("Piège n°1", "Ne pas rendre emphatiques les lettres légères voisines : le tā’ de ٱلۡمُسۡتَقِيمَ reste léger."),
                        ("Piège n°2", "Distinguer س / ص, ت / ط, د / ض, ذ / ظ, ه / ح : la seule différence est l'emphase ou le point de sortie."),
                    ]),
                    EX("1:6", 2, 2, [], "Aṣ-ṣirāṭa : ṣād et ṭā’ emphatiques, l'alif suit leur épaisseur.", {2: "صِّر"}),
                    EX("97:1", 5, 5, [], "Al-qadri : le qāf épais.", {5: "ق"}),
                    EX("1:4", 3, 3, [], "Ad-dīni : toutes les lettres sont légères.", {3: "دِّ"}),
                ],
                "quiz": [
                    Q("Quelle phrase regroupe les lettres emphatiques ?", ["يرملون", "خُصَّ ضَغْطٍ قِظْ", "قُطْبُ جَدٍّ", "ابغ حجك"], 1,
                      "خص ضغط قظ = خ ص ض غ ط ق ظ."),
                    Q("Laquelle de ces lettres est toujours légère ?", ["ق", "ط", "س", "ص"], 2,
                      "Le sīn est léger ; son équivalent emphatique est le ṣād."),
                    Q("L'alif est épais ou léger ?", ["Toujours épais", "Toujours léger", "Il suit la lettre qui le précède", "Il suit la lettre suivante"], 2,
                      "Après une lettre épaisse il est épais (قَا), après une légère il est léger (كَا)."),
                ],
            },
            {
                "id": "n2-l4",
                "title": "Le rā’ : épais ou léger ?",
                "ar": "أَحْكَام الرَّاء",
                "subtitle": "Une lettre à deux visages",
                "blocks": [
                    P("Le **rā’** change selon sa voyelle :"),
                    TABLE(["Situation", "Prononciation", "Exemple"], [
                        ["Rā’ avec fatḥa ou ḍamma", "Épais", "رَبِّ — رُوح"],
                        ["Rā’ avec kasra", "Léger", "غَيۡرِ — رِجَال"],
                        ["Rā’ sākin après fatḥa/ḍamma", "Épais", "وَٱنۡحَرۡ — قُرۡءَان"],
                        ["Rā’ sākin après kasra", "Léger (*)", "فِرۡعَوۡنَ"],
                    ]),
                    P("(*) Exception : il redevient épais si la kasra n'est pas d'origine (ٱرۡجِعِيٓ) ou s'il est suivi, dans le même mot, d'une lettre emphatique (قِرۡطَاس، مِرۡصَاد)."),
                    P("À l'arrêt, le rā’ devient sākin : on regarde alors la lettre d'avant (ou celle encore avant si elle est sākin)."),
                    EX("1:2", 3, 3, [], "Rabbi : rā’ avec fatḥa → épais.", {3: "رَ"}),
                    EX("1:7", 5, 5, [], "Ghayri : rā’ avec kasra → léger.", {5: "رِ"}),
                    EX("89:10", 1, 1, [], "Wa-fir‘awna : rā’ sākin après kasra → léger.", {1: "رۡ"}),
                    EX("108:2", 3, 3, [], "Wa-nḥar : rā’ sākin après fatḥa → épais.", {3: "رۡ"}),
                ],
                "quiz": [
                    Q("Rā’ avec ḍamma :", ["Épais", "Léger", "Les deux sont permis", "Muet"], 0,
                      "Fatḥa et ḍamma rendent le rā’ épais."),
                    Q("Rā’ avec kasra :", ["Épais", "Léger", "Nasalisé", "Muet"], 1,
                      "La kasra rend le rā’ léger."),
                    Q("Dans فِرۡعَوۡنَ, le rā’ sākin précédé d'une kasra est…", ["Épais", "Léger", "Prolongé", "Muet"], 1,
                      "Rā’ sākin après kasra d'origine, sans lettre emphatique après : léger."),
                    Q("Comment est le rā’ dans ce mot ?", ["Épais", "Léger"], 0,
                      "Rabbi : rā’ avec fatḥa → épais.", ex=EX("1:2", 3, 3)),
                ],
            },
            {
                "id": "n2-l5",
                "title": "Le lām du nom d'Allah",
                "ar": "لَام لَفْظ الجَلَالَة",
                "subtitle": "Allāh épais ou léger",
                "blocks": [
                    P("Le lām du nom **Allah** (ٱللَّه) suit une règle simple : on regarde la voyelle **juste avant** lui."),
                    TABLE(["Voyelle précédente", "Lām", "Exemple"], [
                        ["Fatḥa ou ḍamma (ou début de lecture)", "Épais (tafkhīm)", "هُوَ ٱللَّهُ — نَصۡرُ ٱللَّهِ"],
                        ["Kasra", "Léger (tarqīq)", "بِسۡمِ ٱللَّهِ — لِلَّهِ"],
                    ]),
                    EX("112:1", 2, 3, [], "Houwa-llāhou : après une fatḥa → épais.", {3: "لَّ"}),
                    EX("110:1", 3, 4, [], "Naṣrou-llāhi : après une ḍamma → épais.", {4: "لَّ"}),
                    EX("1:1", 1, 2, [], "Bismi-llāhi : après une kasra → léger.", {2: "لَّ"}),
                ],
                "quiz": [
                    Q("Dans « بِسۡمِ ٱللَّهِ », le lām est…", ["Épais", "Léger"], 1,
                      "Précédé d'une kasra (mi) → léger."),
                    Q("Dans « قُلۡ هُوَ ٱللَّهُ », le lām est…", ["Épais", "Léger"], 0,
                      "Précédé d'une fatḥa (wa) → épais."),
                    Q("Si on commence la lecture par « ٱللَّهُ لَآ إِلَـٰهَ… », le lām est…", ["Épais", "Léger"], 0,
                      "On commence par « Allāh » avec une fatḥa sur la hamza → épais."),
                ],
            },
        ],
    },
    # ------------------------------------------------------------------ NIVEAU 3
    {
        "id": "n3",
        "name": "Niveau 3",
        "title": "Nūn sākin et tanwin",
        "desc": "Les 4 règles : iẓhār, idghām, iqlāb, ikhfā’ — et la ghunna.",
        "lessons": [
            {
                "id": "n3-l1",
                "title": "Iẓhār : la clarté",
                "ar": "الإِظْهَار الحَلْقِي",
                "subtitle": "Le nūn devant les lettres de la gorge",
                "blocks": [
                    P("Le **nūn sākin** (نۡ) et le **tanwin** ont 4 règles selon la lettre qui les suit. La première est l'**iẓhār** : prononcer le « n » **clairement, sans nasalisation prolongée**."),
                    LETTERS("Lettres de l'iẓhār (la gorge)", "ءهعحغخ"),
                    P("Indice visuel : dans le mushaf uthmani, le nūn porte un **soukoun visible** et le tanwin a ses deux signes **superposés**."),
                    EX("97:3", 4, 5, [], "Min alfin : nūn + hamza → « n » net.", {4: "نۡ", 5: "أ"}),
                    EX("101:11", 1, 2, [], "Nāroun ḥāmiya : tanwin + ḥā’.", {1: "رٌ", 2: "ح"}),
                    EX("106:4", 6, 7, [], "Min khawf : nūn + khā’.", {6: "نۡ", 7: "خ"}),
                    EX("97:5", 1, 2, [], "Salāmoun hiya : tanwin + hā’.", {1: "مٌ", 2: "ه"}),
                ],
                "quiz": [
                    Q("Combien y a-t-il de lettres d'iẓhār ?", ["4", "6", "15", "2"], 1,
                      "Les 6 lettres de la gorge : ء ه ع ح غ خ."),
                    Q("Nūn sākin suivi de ع :", ["Iẓhār", "Idghām", "Iqlāb", "Ikhfā’"], 0,
                      "Le ‘ayn est une lettre de la gorge → iẓhār."),
                    Q("Quelle règle entends-tu entre ces deux mots ?", ["Iẓhār", "Idghām", "Iqlāb", "Ikhfā’"], 0,
                      "Min khawf : le nūn est clair devant le khā’.", ex=EX("106:4", 6, 7)),
                    Q("Dans le mushaf, un nūn avec soukoun visible indique…", ["L'iẓhār", "L'ikhfā’", "L'idghām", "L'arrêt"], 0,
                      "Soukoun visible = prononciation claire."),
                ],
            },
            {
                "id": "n3-l2",
                "title": "Idghām : la fusion",
                "ar": "الإِدْغَام",
                "subtitle": "Les lettres يَرْمَلُون",
                "blocks": [
                    P("**Idghām** = faire entrer le nūn dans la lettre suivante, qui devient doublée (chadda). Il concerne 6 lettres réunies dans le mot **يَرْمَلُونَ**, et ne s'applique **qu'entre deux mots**."),
                    TABLE(["Type", "Lettres", "Durée"], [
                        ["Avec ghunna", "ي ن م و (يَنْمُو)", "Nasalisation 2 temps"],
                        ["Sans ghunna", "ل ر", "Fusion complète, sans nasalisation"],
                    ]),
                    LETTERS("Lettres de l'idghām", "يرملون"),
                    EX("97:3", 3, 4, ["idgham_ghunnah"], "Khayroun min → khayrum-min, avec ghunna."),
                    EX("99:7", 5, 6, ["idgham_ghunnah"], "Khayran yarah → khayray-yarah, avec ghunna."),
                    EX("2:5", 4, 5, ["idgham_wo_ghunnah"], "Min rabbihim → mir-rabbihim, sans ghunna."),
                    EX("104:1", 1, 2, ["idgham_wo_ghunnah"], "Wayloul li-koulli → wayloul-likoulli, sans ghunna."),
                    TIP("Exception : dans un seul mot, il n'y a pas d'idghām (دُنۡيَا، بُنۡيَٰن، صِنۡوَان، قِنۡوَان) — on dit iẓhār absolu."),
                ],
                "quiz": [
                    Q("Quelles lettres donnent un idghām SANS ghunna ?", ["ي و", "ل ر", "م ن", "ء ه"], 1,
                      "Lām et rā’ : fusion totale sans nasalisation."),
                    Q("Tanwin suivi de ي :", ["Idghām avec ghunna", "Idghām sans ghunna", "Iẓhār", "Iqlāb"], 0,
                      "Le yā’ fait partie de يَنْمُو → idghām avec ghunna."),
                    Q("Pourquoi dit-on « دُنۡيَا » sans idghām ?", ["Le yā’ n'est pas une lettre d'idghām", "Le nūn et le yā’ sont dans le même mot", "C'est un arrêt", "C'est une erreur du mushaf"], 1,
                      "L'idghām ne s'applique qu'entre deux mots."),
                    Q("Quelle règle entends-tu ici ?", ["Idghām avec ghunna", "Idghām sans ghunna", "Ikhfā’", "Iẓhār"], 1,
                      "Min rabbihim → mir-rabbihim : fusion sans nasalisation.", ex=EX("2:5", 4, 5)),
                ],
            },
            {
                "id": "n3-l3",
                "title": "Iqlāb : la conversion",
                "ar": "الإِقْلَاب",
                "subtitle": "Nūn devant bā’ → mīm",
                "blocks": [
                    P("Quand un nūn sākin ou un tanwin est suivi d'un **bā’ (ب)**, le « n » se **transforme en mīm** caché, avec une **ghunna de 2 temps**. Les lèvres se ferment doucement, sans appuyer."),
                    P("Dans le mushaf, un **petit mīm (ۢ)** est posé sur le nūn ou à la place du tanwin."),
                    LETTERS("Une seule lettre", "ب"),
                    EX("98:4", 7, 8, ["iqlab"], "Min ba‘di → mim-ba‘di."),
                    EX("104:4", 2, 2, ["iqlab"], "La-youmbadhanna : iqlāb à l'intérieur d'un mot."),
                    EX("96:15", 5, 6, ["iqlab"], "Lanasfa‘am bin-nāṣiya : tanwin + bā’."),
                ],
                "quiz": [
                    Q("Quelle lettre provoque l'iqlāb ?", ["م", "ب", "و", "ن"], 1, "Uniquement le bā’."),
                    Q("En quoi se transforme le nūn ?", ["En lām", "En mīm caché", "En yā’", "Il disparaît"], 1,
                      "Il devient un mīm caché avec ghunna."),
                    Q("Quel signe l'indique dans le mushaf ?", ["Un petit mīm ۢ", "Une chadda", "Un petit cercle", "Un trait"], 0,
                      "Le petit mīm sur le nūn ou à la place du tanwin."),
                    Q("Quelle règle entends-tu ?", ["Iqlāb", "Idghām", "Iẓhār", "Qalqala"], 0,
                      "Min ba‘di : le nūn devient mīm.", ex=EX("98:4", 7, 8)),
                ],
            },
            {
                "id": "n3-l4",
                "title": "Ikhfā’ : la dissimulation",
                "ar": "الإِخْفَاء الحَقِيقِي",
                "subtitle": "Les 15 lettres restantes",
                "blocks": [
                    P("Devant les **15 lettres restantes**, le nūn n'est ni clair ni fusionné : il est **caché**. La langue ne touche pas le palais pour le « n » ; elle se prépare déjà pour la lettre suivante, et le son passe par le nez (**ghunna 2 temps**)."),
                    LETTERS("Lettres de l'ikhfā’", "تثجدذزسشصضطظفقك"),
                    P("Astuce : ces lettres sont les initiales du vers « صِفْ ذَا ثَنَا كَمْ جَادَ شَخْصٌ قَدْ سَمَا، دُمْ طَيِّبًا زِدْ فِي تُقًى ضَعْ ظَالِمَا »."),
                    EX("113:2", 1, 2, ["ikhafa"], "Min sharri : le nūn se cache devant le shīn."),
                    EX("2:3", 8, 8, ["ikhafa"], "Younfiqoūn : ikhfā’ dans un même mot (nūn + fā’)."),
                    EX("97:1", 2, 2, ["ikhafa"], "Anzalnāhou : nūn + zāy."),
                    TIP("La ghunna de l'ikhfā’ prend la couleur de la lettre suivante : épaisse devant ق ص ط…, légère devant ت س ك…"),
                ],
                "quiz": [
                    Q("Combien de lettres d'ikhfā’ ?", ["6", "4", "15", "1"], 2, "Les 15 lettres qui restent."),
                    Q("Nūn sākin suivi de ش :", ["Iẓhār", "Idghām", "Ikhfā’", "Iqlāb"], 2,
                      "Le shīn est l'une des 15 lettres d'ikhfā’."),
                    Q("Pendant l'ikhfā’, la ghunna dure…", ["Rien", "1 temps", "2 temps", "6 temps"], 2,
                      "Comme toutes les ghunna complètes : 2 temps."),
                    Q("Quelle règle entends-tu ?", ["Ikhfā’", "Iẓhār", "Idghām sans ghunna", "Iqlāb"], 0,
                      "Min sharri : nūn caché devant le shīn.", ex=EX("113:2", 1, 2)),
                ],
            },
            {
                "id": "n3-l5",
                "title": "La ghunna : nūn et mīm doublés",
                "ar": "الغُنَّة",
                "subtitle": "نّ et مّ — 2 temps",
                "blocks": [
                    P("Un **nūn** ou un **mīm** portant une **chadda** se prononce toujours avec une **ghunna (nasalisation) de 2 temps**. C'est la ghunna la plus forte."),
                    EX("114:1", 4, 4, ["ghunnah"], "An-nās : nūn doublé."),
                    EX("97:1", 1, 1, ["ghunnah"], "In-nā : nūn doublé."),
                    EX("101:9", 1, 1, ["ghunnah"], "Fa-oum-mouhou : mīm doublé."),
                    TABLE(["Récapitulatif nūn sākin / tanwin", "Lettres", "Ghunna"], [
                        ["Iẓhār", "ء ه ع ح غ خ", "Non"],
                        ["Idghām avec ghunna", "ي ن م و", "2 temps"],
                        ["Idghām sans ghunna", "ل ر", "Non"],
                        ["Iqlāb", "ب", "2 temps"],
                        ["Ikhfā’", "les 15 autres", "2 temps"],
                    ]),
                ],
                "quiz": [
                    Q("Combien dure la ghunna d'un nūn avec chadda ?", ["1 temps", "2 temps", "4 temps", "Aucune"], 1,
                      "Nūn et mīm mouchaddad : ghunna 2 temps."),
                    Q("Quelle règle entends-tu ?", ["Ghunna", "Iẓhār", "Qalqala", "Madd lāzim"], 0,
                      "Fa-oum-mouhou : mīm doublé, nasalisé 2 temps.", ex=EX("101:9", 1, 1)),
                    Q("Laquelle de ces règles n'a PAS de ghunna ?", ["Ikhfā’", "Iqlāb", "Iẓhār", "Idghām avec ghunna"], 2,
                      "L'iẓhār se prononce net, sans nasalisation prolongée."),
                ],
            },
        ],
    },
    # ------------------------------------------------------------------ NIVEAU 4
    {
        "id": "n4",
        "name": "Niveau 4",
        "title": "Mīm sākin, qalqala et lām",
        "desc": "Les règles des lèvres, le rebond et l'article.",
        "lessons": [
            {
                "id": "n4-l1",
                "title": "Les règles du mīm sākin",
                "ar": "أَحْكَام المِيم السَّاكِنَة",
                "subtitle": "Ikhfā’, idghām et iẓhār labiaux",
                "blocks": [
                    P("Le **mīm sākin** (مۡ) a 3 règles selon la lettre suivante :"),
                    TABLE(["Règle", "Lettre suivante", "Prononciation"], [
                        ["Ikhfā’ shafawī", "ب", "Mīm caché, lèvres à peine fermées, ghunna 2 temps"],
                        ["Idghām shafawī", "م", "Les deux mīm fusionnent, ghunna 2 temps"],
                        ["Iẓhār shafawī", "toutes les autres", "Mīm net — surtout devant و et ف"],
                    ]),
                    EX("105:4", 1, 2, ["ikhafa_shafawi"], "Tarmīhim bi-ḥijāra : ikhfā’ labial."),
                    EX("100:11", 2, 3, ["ikhafa_shafawi"], "Rabbahoum bihim : ikhfā’ labial."),
                    EX("106:4", 2, 3, ["idgham_shafawi"], "Aṭ‘amahoum min → aṭ‘amahum-min."),
                    EX("1:7", 3, 3, [], "An‘amta : mīm net devant le tā’ (iẓhār).", {3: "مۡ"}),
                    EX("105:1", 1, 2, [], "Alam tara : iẓhār shafawī.", {1: "مۡ"}),
                    TIP("Attention devant و et ف : comme ils sortent aussi des lèvres, on a tendance à cacher le mīm. Il faut le prononcer bien clairement."),
                ],
                "quiz": [
                    Q("Mīm sākin + ب :", ["Iẓhār shafawī", "Ikhfā’ shafawī", "Idghām shafawī", "Iqlāb"], 1, "Devant le bā’, le mīm est caché."),
                    Q("Mīm sākin + م :", ["Idghām shafawī", "Ikhfā’ shafawī", "Iẓhār shafawī", "Qalqala"], 0, "Deux mīm fusionnent avec ghunna."),
                    Q("Mīm sākin + و :", ["Ikhfā’", "Idghām", "Iẓhār shafawī", "Iqlāb"], 2, "Iẓhār, en insistant sur la clarté."),
                    Q("Quelle règle entends-tu ?", ["Ikhfā’ shafawī", "Idghām shafawī", "Iẓhār shafawī"], 1,
                      "Aṭ‘amahoum min : les deux mīm fusionnent.", ex=EX("106:4", 2, 3)),
                ],
            },
            {
                "id": "n4-l2",
                "title": "La qalqala : le rebond",
                "ar": "القَلْقَلَة",
                "subtitle": "قُطْبُ جَدٍّ",
                "blocks": [
                    P("Cinq lettres, réunies dans **قُطْبُ جَدٍّ**, produisent un léger **rebond** (écho) quand elles sont **sans voyelle**. Sans ce rebond, la lettre serait étouffée."),
                    LETTERS("Lettres de la qalqala", "قطبجد"),
                    TABLE(["Degré", "Situation", "Exemple"], [
                        ["Ṣughrā (petite)", "Lettre sākin au milieu", "أَطۡعَمَهُم — يَلِدۡ"],
                        ["Kubrā (grande)", "Lettre finale à l'arrêt", "أَحَدٌ — ٱلۡفَلَقِ"],
                        ["Akbar (la plus forte)", "Lettre finale doublée à l'arrêt", "وَتَبَّ"],
                    ]),
                    EX("106:4", 2, 2, ["qalaqah"], "Aṭ‘amahoum : qalqala ṣughrā sur le ṭā’ sākin."),
                    EX("112:3", 1, 4, ["qalaqah"], "Lam yalid wa lam yoūlad : petite au milieu, grande à l'arrêt."),
                    EX("113:1", 4, 4, ["qalaqah"], "Al-falaq : qalqala kubrā à l'arrêt."),
                    EX("111:1", 5, 5, ["qalaqah"], "Wa tabb : qalqala sur un bā’ doublé."),
                    TIP("Le rebond ne doit pas devenir une voyelle : on ne dit pas « falaqa » ni « falaqe »."),
                ],
                "quiz": [
                    Q("Quelles sont les lettres de la qalqala ?", ["خ ص ض غ ط ق ظ", "ق ط ب ج د", "ي ر م ل و ن", "ء ه ع ح غ خ"], 1, "قُطْبُ جَدٍّ."),
                    Q("La qalqala s'applique quand la lettre…", ["A une fatḥa", "Est sans voyelle (sākin)", "A une chadda au milieu", "Est au début"], 1,
                      "Le rebond n'existe que sur une lettre sākin (ou à l'arrêt)."),
                    Q("Où la qalqala est-elle la plus forte ?", ["Au milieu d'un mot", "À l'arrêt sur une lettre doublée", "Au début d'un verset", "Jamais"], 1,
                      "À l'arrêt sur une lettre avec chadda (وَتَبَّ)."),
                    Q("Quelle règle entends-tu en fin de mot ?", ["Qalqala kubrā", "Ghunna", "Madd", "Ikhfā’"], 0,
                      "Al-falaq : rebond du qāf à l'arrêt.", ex=EX("113:1", 4, 4)),
                ],
            },
            {
                "id": "n4-l3",
                "title": "Lām solaire et lām lunaire",
                "ar": "اللَّام الشَّمْسِيَّة وَالقَمَرِيَّة",
                "subtitle": "Le lām de l'article ال",
                "blocks": [
                    P("Le lām de l'article **ال** se prononce ou non selon la lettre qui suit :"),
                    KEY([
                        ("Lām lunaire (qamariyya)", "Le lām se prononce clairement (porte un soukoun). 14 lettres : « ٱبۡغِ حَجَّكَ وَخَفۡ عَقِيمَهُ » → ا ب غ ح ج ك و خ ف ع ق ي م ه."),
                        ("Lām solaire (shamsiyya)", "Le lām ne se prononce pas : il fusionne dans la lettre suivante, qui prend une chadda. Les 14 autres lettres : ت ث د ذ ر ز س ش ص ض ط ظ ل ن."),
                    ]),
                    EX("1:2", 1, 1, [], "Al-ḥamdou : lām lunaire, prononcé.", {1: "لۡ"}),
                    EX("113:1", 4, 4, [], "Al-falaq : lām lunaire.", {4: "لۡ"}),
                    EX("114:1", 4, 4, ["laam_shamsiyah"], "An-nās : lām solaire, absorbé."),
                    EX("1:4", 3, 3, ["laam_shamsiyah"], "Ad-dīn : lām solaire."),
                    TIP("Les noms viennent des mots الشَّمۡس (le lām disparaît : ash-shams) et القَمَر (le lām reste : al-qamar)."),
                ],
                "quiz": [
                    Q("Dans « ٱلشَّمۡس », le lām est…", ["Lunaire, prononcé", "Solaire, absorbé"], 1, "Ash-shams : le lām fusionne dans le shīn."),
                    Q("Dans « ٱلۡقَمَر », le lām est…", ["Lunaire, prononcé", "Solaire, absorbé"], 0, "Al-qamar : le lām se prononce."),
                    Q("Signe visible d'un lām solaire dans le mushaf :", ["Le lām porte un soukoun", "La lettre suivante porte une chadda", "Un petit mīm", "Un petit cercle"], 1,
                      "La lettre après le lām est doublée : ٱلنَّاس."),
                    Q("Le lām de ce mot est…", ["Lunaire", "Solaire"], 1, "Ad-dīn : le lām est absorbé par le dāl.", ex=EX("1:4", 3, 3)),
                ],
            },
        ],
    },
    # ------------------------------------------------------------------ NIVEAU 5
    {
        "id": "n5",
        "name": "Niveau 5",
        "title": "Les prolongations",
        "desc": "Toutes les durées : 2, 4, 5 et 6 temps.",
        "lessons": [
            {
                "id": "n5-l1",
                "title": "Madd originel et madd dérivé",
                "ar": "أَقْسَام المَدّ",
                "subtitle": "Quand la prolongation s'allonge",
                "blocks": [
                    P("Le **madd naturel** (2 temps) s'allonge quand la lettre de madd est suivie d'une **cause** : une **hamza** ou un **soukoun**."),
                    TABLE(["Madd", "Cause", "Durée (Ḥafṣ)"], [
                        ["Ṭabī‘ī (naturel)", "Aucune", "2"],
                        ["Muttaṣil (attaché)", "Hamza dans le même mot", "4 ou 5"],
                        ["Munfaṣil (séparé)", "Hamza au début du mot suivant", "4 ou 5"],
                        ["‘Āriḍ lis-sukūn", "Soukoun dû à l'arrêt", "2, 4 ou 6"],
                        ["Līn", "و/ي sākin après fatḥa, à l'arrêt", "2, 4 ou 6"],
                        ["Lāzim (obligatoire)", "Soukoun permanent", "6"],
                        ["Badal", "Hamza avant la lettre de madd", "2"],
                    ]),
                    P("Dans le mushaf, une **petite vague (ٓ)** au-dessus de la lettre de madd signale une prolongation supérieure à 2 temps."),
                    TIP("Règle d'or : choisis une durée et garde-la tout au long de ta récitation (si tu fais 4 temps pour un muttaṣil, fais 4 partout)."),
                ],
                "quiz": [
                    Q("Quelles sont les deux causes qui allongent le madd ?", ["Hamza et soukoun", "Chadda et tanwin", "Fatḥa et kasra", "Qalqala et ghunna"], 0,
                      "La hamza et le soukoun."),
                    Q("Que signale la petite vague (ٓ) ?", ["Un arrêt", "Une prolongation de plus de 2 temps", "Une lettre muette", "Une ghunna"], 1,
                      "Elle indique un madd prolongé."),
                    Q("Combien dure le madd lāzim ?", ["2", "4", "5", "6"], 3, "Le madd lāzim dure toujours 6 temps."),
                ],
            },
            {
                "id": "n5-l2",
                "title": "Madd muttaṣil et munfaṣil",
                "ar": "المَدّ المُتَّصِل وَالمُنْفَصِل",
                "subtitle": "Lettre de madd + hamza",
                "blocks": [
                    KEY([
                        ("Madd muttaṣil wājib (obligatoire)", "La hamza suit la lettre de madd **dans le même mot**. 4 ou 5 temps, obligatoirement plus long que 2."),
                        ("Madd munfaṣil jā’iz (permis)", "La lettre de madd termine un mot et la hamza **commence le mot suivant**. Dans la lecture de Ḥafṣ (voie de la Shāṭibiyya) : 4 ou 5 temps."),
                    ]),
                    EX("110:1", 2, 2, ["madda_obligatory_mottasel"], "Jā’a : muttaṣil."),
                    EX("106:2", 3, 3, ["madda_obligatory_mottasel"], "Ash-shitā’i : muttaṣil."),
                    EX("2:6", 4, 4, ["madda_obligatory_mottasel"], "Sawā’oun : muttaṣil."),
                    EX("109:2", 1, 2, ["madda_obligatory_monfasel"], "Lā a‘boudou : munfaṣil."),
                    EX("97:1", 1, 2, ["madda_obligatory_monfasel"], "Innā anzalnāhou : munfaṣil."),
                ],
                "quiz": [
                    Q("Lettre de madd et hamza dans le même mot :", ["Muttaṣil", "Munfaṣil", "Badal", "Lāzim"], 0, "Muttaṣil = attaché."),
                    Q("Durée du munfaṣil dans Ḥafṣ (Shāṭibiyya) :", ["2", "4 ou 5", "6", "1"], 1, "4 ou 5 temps, de façon constante."),
                    Q("Quel madd entends-tu ?", ["Muttaṣil", "Munfaṣil", "Naturel"], 1, "Lā | a‘boudou : la hamza est dans le mot suivant.", ex=EX("109:2", 1, 2)),
                    Q("Quel madd entends-tu ?", ["Muttaṣil", "Munfaṣil", "Naturel"], 0, "Jā’a : la hamza est dans le même mot.", ex=EX("110:1", 2, 2)),
                ],
            },
            {
                "id": "n5-l3",
                "title": "Madd à l'arrêt : ‘āriḍ et līn",
                "ar": "المَدّ العَارِض لِلسُّكُون",
                "subtitle": "2, 4 ou 6 temps en fin de verset",
                "blocks": [
                    P("Quand on **s'arrête** sur un mot dont l'avant-dernière lettre est une lettre de madd, la dernière lettre devient sākin : c'est le **madd ‘āriḍ lis-sukūn**. On peut le prolonger **2, 4 ou 6 temps**."),
                    EX("1:2", 4, 4, ["madda_permissible"], "Al-‘ālamīn : à l'arrêt."),
                    EX("1:5", 4, 4, ["madda_permissible"], "Nasta‘īn : à l'arrêt."),
                    P("Le **madd līn** (souplesse) concerne un **wāw ou yā’ sākin précédé d'une fatḥa** (aw, ay), avant une lettre finale à l'arrêt. Il se prolonge aussi 2, 4 ou 6 temps."),
                    EX("106:2", 4, 4, ["madda_permissible"], "Waṣ-ṣayf : madd līn."),
                    EX("106:4", 7, 7, ["madda_permissible"], "Khawf : madd līn."),
                    TIP("Si on enchaîne sans s'arrêter, ces madd redeviennent naturels (2 temps) ou disparaissent (līn)."),
                ],
                "quiz": [
                    Q("Le madd ‘āriḍ n'existe que…", ["En liaison", "À l'arrêt", "Au début du verset", "Avec une hamza"], 1, "Le soukoun est provoqué par l'arrêt."),
                    Q("Durées permises du madd ‘āriḍ :", ["2 seulement", "4 ou 5", "2, 4 ou 6", "6 seulement"], 2, "Les trois sont permises."),
                    Q("Le madd līn porte sur…", ["ا après fatḥa", "و/ي sākin après fatḥa", "و après ḍamma", "Une hamza"], 1, "« aw » / « ay » avant une lettre finale à l'arrêt."),
                    Q("Quel madd entends-tu à la fin ?", ["Līn", "Muttaṣil", "Lāzim"], 0, "Khawf : wāw sākin après fatḥa, à l'arrêt.", ex=EX("106:4", 7, 7)),
                ],
            },
            {
                "id": "n5-l4",
                "title": "Le madd lāzim : 6 temps",
                "ar": "المَدّ اللَّازِم",
                "subtitle": "Soukoun permanent et lettres isolées",
                "blocks": [
                    P("Le **madd lāzim** se produit quand la lettre de madd est suivie d'un **soukoun permanent** (présent même en liaison). Il dure **toujours 6 temps**."),
                    TABLE(["Type", "Description", "Exemple"], [
                        ["Kalimī muthaqqal", "Dans un mot, suivi d'une chadda", "ٱلضَّآلِّينَ"],
                        ["Kalimī mukhaffaf", "Dans un mot, suivi d'un soukoun simple", "ءَآلۡـَٔـٰنَ (2 fois)"],
                        ["Ḥarfī", "Lettres isolées en début de sourate", "الٓمٓ — يسٓ"],
                    ]),
                    EX("1:7", 9, 9, ["madda_necessary"], "Aḍ-ḍāāālīn : 6 temps avant le lām doublé."),
                    EX("80:33", 3, 3, ["madda_necessary"], "Aṣ-ṣāāākhkha."),
                    EX("2:1", 1, 1, None, "Alif-lāāām-mīīīm : lām et mīm se prolongent 6 temps."),
                    EX("36:1", 1, 1, None, "Yā-sīīīn : le sīn se prolonge 6 temps."),
                    P("Les lettres isolées dont le nom contient 3 lettres avec un madd au milieu (**نَقَصَ عَسَلُكُمْ** : ن ق ص ع س ل ك م) se prolongent 6 temps. Celles de **حَيٌّ طَهُرَ** (ح ي ط ه ر) : 2 temps. L'alif n'a pas de madd."),
                ],
                "quiz": [
                    Q("Durée du madd lāzim :", ["2", "4", "5", "6"], 3, "Toujours 6 temps."),
                    Q("Dans يسٓ, le sīn se prolonge…", ["2 temps", "4 temps", "6 temps", "Pas du tout"], 2, "Le sīn fait partie de نقص عسلكم."),
                    Q("Dans طه, le ṭā’ et le hā’ se prolongent…", ["2 temps", "6 temps", "4 temps"], 0, "Ils font partie de حي طهر : 2 temps."),
                    Q("Quel madd entends-tu ?", ["Lāzim", "‘Āriḍ", "Naturel"], 0, "Aṣ-ṣāāākhkha : soukoun permanent (chadda).", ex=EX("80:33", 3, 3)),
                ],
            },
            {
                "id": "n5-l5",
                "title": "Badal, ‘iwaḍ et ṣila",
                "ar": "مَدّ البَدَل وَالعِوَض وَالصِّلَة",
                "subtitle": "Les derniers madd",
                "blocks": [
                    KEY([
                        ("Madd badal", "La **hamza précède** la lettre de madd (ءَا، أُو، إِي) : 2 temps."),
                        ("Madd ‘iwaḍ", "À l'**arrêt sur un tanwin fatḥa**, on le remplace par un alif : 2 temps (« ḍabḥā »)."),
                        ("Ṣila ṣughrā", "Le **hā’ du pronom** (هُۥ / هِۦ) entre deux lettres vocalisées se prolonge 2 temps en liaison."),
                        ("Ṣila kubrā", "Même cas, mais suivi d'une **hamza** : 4 ou 5 temps (comme le munfaṣil)."),
                    ]),
                    EX("103:3", 3, 3, [], "Āmanoū : madd badal (hamza puis alif).", {3: "ءَا"}),
                    EX("100:1", 2, 2, [], "Ḍabḥā : arrêt sur tanwin fatḥa → alif.", {2: "حًا"}),
                    EX("110:3", 5, 6, [], "Innahoū kāna : ṣila ṣughrā, 2 temps.", {5: "هُۥ"}),
                    EX("104:3", 3, 4, None, "Mālahoūū akhladah : ṣila kubrā, 4-5 temps."),
                    TIP("À l'arrêt sur le pronom (ex. : fin de verset يَرَهُۥ), la ṣila disparaît : on dit « yarah »."),
                ],
                "quiz": [
                    Q("Hamza suivie d'une lettre de madd :", ["Badal", "Muttaṣil", "Lāzim", "Līn"], 0, "Le badal : la hamza vient avant."),
                    Q("À l'arrêt sur « قَدۡحًا », on dit…", ["Qadḥan", "Qadḥā", "Qadḥ", "Qadḥa"], 1, "Madd ‘iwaḍ : le tanwin fatḥa devient un alif."),
                    Q("Ṣila kubrā = hā’ du pronom suivi de…", ["Une hamza", "Un soukoun", "Un bā’", "Un arrêt"], 0, "Elle se prolonge alors 4-5 temps."),
                    Q("Quel madd entends-tu entre les deux mots ?", ["Ṣila kubrā", "Badal", "Lāzim"], 0,
                      "Mālahoū akhladah : le hā’ suivi d'une hamza.", ex=EX("104:3", 3, 4)),
                ],
            },
        ],
    },
    # ------------------------------------------------------------------ NIVEAU 6
    {
        "id": "n6",
        "name": "Niveau 6",
        "title": "Perfectionnement",
        "desc": "Arrêt et reprise, assimilations, cas particuliers de Ḥafṣ.",
        "lessons": [
            {
                "id": "n6-l1",
                "title": "Les signes d'arrêt",
                "ar": "عَلَامَات الوَقْف",
                "subtitle": "Où s'arrêter, où ne pas s'arrêter",
                "blocks": [
                    P("Le mushaf de Médine place de petits signes au-dessus du texte pour guider l'arrêt (waqf) :"),
                    TABLE(["Signe", "Nom", "Sens"], [
                        ["مـ", "Lāzim", "Arrêt obligatoire (enchaîner changerait le sens)"],
                        ["لا", "Lā", "Ne pas s'arrêter ici (sauf en fin de verset)"],
                        ["ج", "Jā’iz", "Arrêt ou liaison, au choix"],
                        ["صلى", "Al-waṣl awlā", "Liaison préférable"],
                        ["قلى", "Al-waqf awlā", "Arrêt préférable"],
                        ["∴ ∴", "Mu‘ānaqa", "S'arrêter à l'un des deux, pas aux deux"],
                    ]),
                    EX("2:2", 3, 6, [], "Lā rayba ∴ fīhi ∴ : on s'arrête soit après « rayba », soit après « fīhi ».", {4: "ۛ", 5: "ۛ"}),
                    KEY([
                        ("Waqf tāmm (complet)", "Le sens est complet et indépendant de la suite."),
                        ("Waqf kāfī (suffisant)", "Sens complet mais lié à la suite par le sens."),
                        ("Waqf ḥasan (bon)", "Sens correct mais grammaticalement lié à la suite."),
                        ("Waqf qabīḥ (mauvais)", "L'arrêt donne un sens incomplet ou faux : à éviter."),
                    ]),
                ],
                "quiz": [
                    Q("Le signe مـ signifie…", ["Arrêt interdit", "Arrêt obligatoire", "Liaison préférable", "Pause sans respirer"], 1, "Mīm = lāzim, arrêt obligatoire."),
                    Q("Le signe لا signifie…", ["Ne pas s'arrêter", "Arrêt obligatoire", "Au choix", "Fin de sourate"], 0, "Il ne faut pas s'arrêter (sauf en tête de verset)."),
                    Q("Avec les signes ∴ ∴ (mu‘ānaqa), on s'arrête…", ["Aux deux", "À l'un des deux seulement", "À aucun", "Au second obligatoirement"], 1,
                      "On choisit un seul des deux emplacements."),
                    Q("Le signe قلى indique…", ["Arrêt préférable", "Liaison préférable", "Arrêt obligatoire"], 0, "Qalā = al-waqf awlā."),
                ],
            },
            {
                "id": "n6-l2",
                "title": "Comment s'arrêter et reprendre",
                "ar": "الوَقْف وَالابْتِدَاء",
                "subtitle": "Ce qui change sur le dernier mot",
                "blocks": [
                    P("À l'arrêt, la **dernière lettre devient sākin**. Quelques cas particuliers :"),
                    TABLE(["Fin du mot", "À l'arrêt", "Exemple"], [
                        ["Voyelle ou tanwin ḍamma/kasra", "Soukoun", "ٱلۡفَلَقِ → al-falaq"],
                        ["Tanwin fatḥa", "Alif (2 temps)", "ضَبۡحًا → ḍabḥā"],
                        ["Tā’ marbūṭa (ة)", "Hā’ sākin", "ٱلۡقَارِعَةُ → al-qāri‘ah"],
                    ]),
                    EX("101:1", 1, 1, [], "Al-qāri‘ah : le tā’ marbūṭa devient hā’.", {1: "ةُ"}),
                    EX("104:1", 3, 4, [], "Houmazatin loumazah : en liaison « tin », à l'arrêt « ah ».", {3: "ةٍ", 4: "ةٍ"}),
                    KEY([
                        ("Ibtidā’ (reprise)", "Après un arrêt, on reprend à un endroit qui donne un sens correct — souvent en revenant un ou deux mots en arrière."),
                        ("Rawm et ishmām", "Techniques fines à l'arrêt : faire entendre un tiers de la voyelle (rawm) ou arrondir les lèvres sans son (ishmām) pour une ḍamma."),
                    ]),
                    TIP("On ne s'arrête jamais au milieu d'un mot, et on ne reprend jamais par un mot qui changerait le sens."),
                ],
                "quiz": [
                    Q("À l'arrêt, le tā’ marbūṭa se prononce…", ["t", "h", "n", "il disparaît"], 1, "Il devient un hā’ sākin."),
                    Q("À l'arrêt sur « عَلِيمٌ », on dit…", ["‘Alīmoun", "‘Alīmā", "‘Alīm", "‘Alīmou"], 2, "Le tanwin ḍamma disparaît : la lettre devient sākin."),
                    Q("Après un arrêt, on peut reprendre…", ["N'importe où", "À un endroit qui garde un sens correct", "Toujours au début de la sourate", "Au milieu d'un mot"], 1,
                      "C'est la règle de l'ibtidā’."),
                ],
            },
            {
                "id": "n6-l3",
                "title": "Assimilations entre lettres",
                "ar": "المِثْلَان وَالمُتَجَانِسَان وَالمُتَقَارِبَان",
                "subtitle": "Mithlayn, mutajānisayn, mutaqāribayn",
                "blocks": [
                    P("Quand une lettre **sākin** rencontre une lettre **vocalisée** proche d'elle, la première peut se fondre dans la seconde :"),
                    TABLE(["Type", "Relation", "Exemple"], [
                        ["Mithlayn", "Même lettre", "رَبِحَت تِّجَارَتُهُمۡ"],
                        ["Mutajānisayn", "Même point de sortie, qualités différentes", "عَبَدتُّمۡ — قَد تَّبَيَّنَ"],
                        ["Mutaqāribayn", "Points de sortie proches", "قُل رَّبِّىٓ"],
                    ]),
                    EX("2:16", 7, 8, [], "Rabiḥat-tijāratouhoum : deux tā’ fusionnent.", {7: "ت", 8: "تِّ"}),
                    EX("109:4", 5, 5, ["idgham_mutajanisayn"], "‘Abattoum : le dāl entre dans le tā’."),
                    EX("2:256", 5, 6, ["idgham_mutajanisayn"], "Qat-tabayyana : dāl → tā’."),
                    EX("18:22", 15, 16, ["idgham_mutaqaribayn"], "Qur-rabbī : le lām entre dans le rā’."),
                    TIP("Exception célèbre : dans « بَسَطتَ » (5:28), le ṭā’ fusionne dans le tā’ mais garde son emphase (idghām nāqiṣ)."),
                ],
                "quiz": [
                    Q("Deux lettres identiques, la première sākin :", ["Mithlayn", "Mutajānisayn", "Mutaqāribayn"], 0, "Même lettre = mithlayn."),
                    Q("Dāl sākin suivi d'un tā’ :", ["Mithlayn", "Mutajānisayn", "Mutaqāribayn"], 1, "Même point de sortie, qualités différentes."),
                    Q("Lām sākin suivi d'un rā’ (قُل رَّبِّ) :", ["Mithlayn", "Mutajānisayn", "Mutaqāribayn"], 2, "Points de sortie voisins."),
                ],
            },
            {
                "id": "n6-l4",
                "title": "Les cas particuliers de Ḥafṣ",
                "ar": "مَا انْفَرَدَ بِهِ حَفْص",
                "subtitle": "Sakt, imāla, ishmām, tas-hīl",
                "blocks": [
                    P("La lecture de **Ḥafṣ ‘an ‘Āṣim** (celle du mushaf de Médine) contient quelques cas uniques qu'il faut connaître."),
                    KEY([
                        ("Sakt (pause sans respirer)", "Brève pause de 2 temps sans reprendre son souffle, marquée d'un petit sīn (ۜ). 4 endroits : عِوَجَاۜ (18:1), مَرۡقَدِنَاۜ (36:52), مَنۡۜ رَاقٍ (75:27), بَلۡۜ رَانَ (83:14)."),
                        ("Imāla", "Incliner la fatḥa vers la kasra (« é ») : un seul mot, مَجۡرٜىٰهَا (11:41) → « majrēhā »."),
                        ("Ishmām", "Arrondir les lèvres pendant la fusion du nūn dans تَأۡمَ۫نَّا (12:11)."),
                        ("Tas-hīl", "Adoucir la seconde hamza, entre hamza et alif : ءَا۬عۡجَمِيّٞ (41:44)."),
                    ]),
                    EX("36:52", 5, 7, [], "Min marqadinā ۜ hādhā : petite pause sans respirer.", {6: "اۜ"}),
                    EX("83:14", 1, 3, [], "Kallā bal ۜ rān : la pause empêche l'idghām du lām dans le rā’.", {2: "لۡۜ"}),
                    TIP("Grâce au sakt de 83:14, on ne dit pas « barrān » : le lām reste prononcé."),
                ],
                "quiz": [
                    Q("Le sakt est…", ["Un arrêt avec respiration", "Une pause brève sans respirer", "Une prolongation de 6 temps", "Une fusion"], 1,
                      "Pause de 2 temps sans reprendre son souffle."),
                    Q("Combien de sakt obligatoires chez Ḥafṣ (voie Shāṭibiyya) ?", ["1", "2", "4", "7"], 2,
                      "Al-Kahf, Yā-Sīn, Al-Qiyāma, Al-Muṭaffifīn."),
                    Q("Quel mot unique contient une imāla chez Ḥafṣ ?", ["مَجۡرٜىٰهَا", "ٱلضَّآلِّينَ", "تَأۡمَ۫نَّا", "يسٓ"], 0, "Majrēhā (Hūd, 41)."),
                    Q("Quel signe marque le sakt dans le mushaf ?", ["Un petit sīn ۜ", "Un petit mīm ۢ", "Une chadda", "∴"], 0, "Le petit sīn."),
                ],
            },
            {
                "id": "n6-l5",
                "title": "Examen final",
                "ar": "الاِخْتِبَار",
                "subtitle": "Reconnaître les règles à l'oreille",
                "blocks": [
                    P("Félicitations, tu as parcouru l'ensemble des règles de la lecture de Ḥafṣ ! Cet examen mélange tous les niveaux : écoute chaque extrait et identifie la règle."),
                    TIP("Pour progresser encore : ouvre le lecteur Coran, active les couleurs de tajwid, choisis la récitation d'Al-Husary (Mu'allim) en vitesse 0,75× et répète chaque verset avec le mode répétition."),
                ],
                "quiz": [
                    Q("Quelle règle entends-tu ?", ["Iqlāb", "Ikhfā’", "Idghām"], 0, "Lanasfa‘am bin-nāṣiya.", ex=EX("96:15", 5, 6)),
                    Q("Quelle règle entends-tu ?", ["Idghām avec ghunna", "Iẓhār", "Iqlāb"], 0, "Khayray-yarah.", ex=EX("99:7", 5, 6)),
                    Q("Quelle règle entends-tu ?", ["Ikhfā’ shafawī", "Iẓhār shafawī", "Idghām shafawī"], 0, "Rabbahoum bihim.", ex=EX("100:11", 2, 3)),
                    Q("Quel madd entends-tu ?", ["Lāzim (6)", "Naturel (2)", "Badal"], 0, "Aḍ-ḍāāāllīn.", ex=EX("1:7", 9, 9)),
                    Q("Quelle règle entends-tu sur la dernière lettre ?", ["Qalqala", "Ghunna", "Tafkhīm du rā’"], 0, "Aḥad : rebond du dāl à l'arrêt.", ex=EX("112:1", 4, 4)),
                    Q("Le lām de l'article est…", ["Solaire", "Lunaire"], 1, "Al-ḥamdou : lām prononcé.", ex=EX("1:2", 1, 1)),
                    Q("Quelle règle entends-tu ?", ["Ikhfā’", "Iẓhār", "Idghām sans ghunna"], 0, "Anzalnāhou : nūn caché devant le zāy.", ex=EX("97:1", 2, 2)),
                    Q("Quel madd entends-tu ?", ["Muttaṣil", "Munfaṣil", "Līn"], 0, "Ash-shitā’ : hamza dans le même mot.", ex=EX("106:2", 3, 3)),
                ],
            },
        ],
    },
]
