# Génère (python3 scripts/build-pedagogy.py) public/data/pedagogy/library.json (catalogue de notions + passages annotés + exemples).
import json, re, sys
import pathlib
ROOT = str(pathlib.Path(__file__).resolve().parent.parent / 'public') + '/'
LEX = json.load(open(ROOT + 'data/quran/lexicon.json'))['lemmas']
HARAKAT = re.compile(r'[ً-ٰٟۖ-ۭـ]')
def bare(s): return HARAKAT.sub('', s).replace('ٱ', 'ا')

def N(id, cat, label, expl, root=None, pattern=None, lemma=None):
    n = {'id': id, 'category': cat, 'labelFr': label, 'explanationFr': expl}
    if root: n['root'] = root
    if pattern: n['pattern'] = pattern
    if lemma:
        assert lemma in LEX, lemma
        n['quranLemma'] = lemma
    return n

CATALOG = [
  # Morphèmes et particules
  N('morph:conj_wa', 'bound_morpheme', 'Conjonction وَ (et)', 'وَ se soude, sans espace, au mot qui suit pour relier deux mots ou deux propositions : وَسَأَقْرَؤُهُ « et je le lirai ».'),
  N('morph:conj_fa', 'bound_morpheme', 'Conjonction فَ (alors, donc)', 'فَ se soude au mot suivant comme وَ, mais marque une suite ou une conséquence : « alors », « donc », « et aussitôt ».'),
  N('morph:prep_li', 'bound_morpheme', 'Préposition لِ (à, pour)', 'لِ se soude au nom ou au pronom suivant ; devant un pronom elle devient لَ : لَكَ « à toi », لَهُ « à lui ». لَهُ كِتَابٌ = « il a un livre » (litt. « à lui un livre »).'),
  N('morph:lam_amr', 'bound_morpheme', 'Lām de l’impératif indirect لِـ / لْـ (qu’il…, qu’ils…)', 'Devant un verbe à l’inaccompli, ce لِ exprime un ordre ou une exhortation à la 3ᵉ personne : لِيَكْتُبْ « qu’il écrive ». Après وَ ou فَ, il perd sa voyelle : فَلْيَعْبُدُوا « qu’ils adorent donc ». À ne pas confondre avec la préposition لِ « à, pour ».'),
  N('morph:prep_fi', 'bound_morpheme', 'Préposition فِي (dans)', 'Indique le lieu ou le cadre ; le nom qui suit prend la voyelle finale -i : فِي الْمَكْتَبَةِ.'),
  N('morph:prep_min', 'bound_morpheme', 'Préposition مِنْ (de, depuis, contre)', 'Indique l’origine (« de, depuis ») ; après certains verbes, elle marque ce dont on est protégé : آمَنَهُمْ مِنْ خَوْفٍ « il les a mis à l’abri de la crainte ».'),
  N('morph:def_al', 'bound_morpheme', 'Article الْـ (le, la, les)', 'Rend le nom défini. Devant une lettre « solaire » (ت ث د ذ ر ز س ش ص ض ط ظ ل ن), le ل ne se prononce pas et la lettre suivante est doublée : التَّارِيخ = at-tārīkh.'),
  N('morph:pron_3ms', 'bound_morpheme', 'Pronom suffixe ـهُ / ـهِ (le, lui, son)', 'Après un verbe : complément « le » (يَقْرَؤُهُ « il le lit »). Après un nom : possessif « son, sa » (بَيْتُهُ « sa maison »). Après une préposition : « lui » (لَهُ « à lui »). Il devient ـهِ après un i : بَيْتِهِ.'),
  N('morph:pron_3mp', 'bound_morpheme', 'Pronom suffixe ـهُمْ (les, eux, leur)', 'Pluriel de ـهُ : après un verbe « les » (أَطْعَمَهُمْ « il les a nourris »), après un nom « leur » (أُمُّهُمْ « leur mère »).'),
  N('morph:pron_2ms', 'bound_morpheme', 'Pronom suffixe ـكَ (te, toi, ton)', 'Désigne la personne à qui l’on parle (masculin) : لَكَ « à toi », كِتَابُكَ « ton livre ».'),
  N('morph:verb_fut_sa', 'bound_morpheme', 'Préfixe du futur سَـ', 'Soudé devant un verbe à l’inaccompli, il le met au futur : أَقْرَأُ « je lis » → سَأَقْرَأُ « je lirai ».'),
  # Constructions
  N('syn:idafa', 'syntax', 'Annexion (إِضَافَة, « le … de … »)', 'Deux noms collés expriment l’appartenance : كِتَابُ التَّارِيخِ « le livre d’histoire ». Le premier nom ne prend jamais الْـ ; le second est au cas indirect (-i). La chaîne peut s’allonger : كِتَابَ تَارِيخِ الْمَدِينَةِ.'),
  N('syn:nominal_sentence', 'syntax', 'Phrase nominale (sans verbe « être »)', 'Au présent, « être » ne s’exprime pas : الْبَيْتُ كَبِيرٌ « la maison [est] grande ». Si le sujet est indéfini, le complément de lieu passe devant : فِي بَيْتِهِ مَكْتَبَةٌ « dans sa maison [il y a] une bibliothèque ».'),
  N('syn:relative', 'syntax', 'Relatif الَّذِي (celui qui, qui)', 'Introduit une proposition qui décrit un nom défini ou en tient lieu : الرَّجُلُ الَّذِي كَتَبَ « l’homme qui a écrit » ; seul, il signifie « celui qui ».'),
  N('syn:lam_jussive', 'syntax', 'Négation du passé لَمْ + apocopé', 'لَمْ nie une action passée ; le verbe qui suit est à l’inaccompli, mais à la forme apocopée (voyelle finale supprimée) : لَمْ يَكْتُبْ « il n’a pas écrit », لَمْ أَجِدْ « je n’ai pas trouvé ».'),
  N('pat:mafal_place', 'root_pattern', 'Schème de lieu مَفْعَل / مَفْعَلَة', 'Le préfixe مَـ sur une racine forme souvent le lieu de l’action : كتب « écrire » → مَكْتَبَة « bibliothèque », مَكْتَب « bureau » ; درس « étudier » → مَدْرَسَة « école ».', pattern='مَفْعَلَة'),
  # Lexique
  N('lex:kataba', 'lexeme', 'كَتَبَ / يَكْتُبُ (écrire)', 'Verbe de la racine ك-ت-ب, la même que كِتَاب (livre) et مَكْتَبَة (bibliothèque).', root='كتب', pattern='فَعَلَ', lemma='كَتَبَ'),
  N('lex:kitab', 'lexeme', 'كِتَاب (livre)', 'Nom de la racine ك-ت-ب ; pluriel كُتُب.', root='كتب', pattern='فِعَال', lemma='كِتاب'),
  N('lex:maktaba', 'lexeme', 'مَكْتَبَة (bibliothèque, librairie)', 'Lieu des livres : schème de lieu مَفْعَلَة sur la racine ك-ت-ب.', root='كتب', pattern='مَفْعَلَة'),
  N('lex:qaraa', 'lexeme', 'قَرَأَ / يَقْرَأُ (lire, réciter)', 'Racine ق-ر-أ, celle de قُرْآن (« récitation »).', root='قرأ', pattern='فَعَلَ', lemma='قَرَأَ'),
  N('lex:talaba', 'lexeme', 'طَلَبَ / يَطْلُبُ (chercher, demander)', 'Racine ط-ل-ب, celle de طَالِب (étudiant, « celui qui cherche [le savoir] »).', root='طلب', pattern='فَعَلَ'),
  N('lex:wajada', 'lexeme', 'وَجَدَ / يَجِدُ (trouver)', 'À l’inaccompli, la première radicale و tombe : تَجِدُ « tu trouves », أَجِدُ « je trouve ».', root='وجد', pattern='فَعَلَ', lemma='وَجَدَ'),
  N('lex:tarikh', 'lexeme', 'تَارِيخ (histoire, date)', 'Désigne l’histoire (d’un lieu, d’une époque) et aussi la date.', root='أرخ'),
  N('lex:madina', 'lexeme', 'مَدِينَة (ville)', 'Pluriel مُدُن ; الْمَدِينَة désigne aussi Médine.', root='مدن', lemma='مَدِينَة'),
  N('lex:qism', 'lexeme', 'قِسْم (section, rayon)', 'Racine ق-س-م « partager » : une partie d’un ensemble.', root='قسم', pattern='فِعْل'),
  N('lex:raqm', 'lexeme', 'رَقْم (numéro, chiffre)', 'Le numéro d’un livre dans une bibliothèque est sa cote.', root='رقم', pattern='فَعْل'),
  N('lex:bayt', 'lexeme', 'بَيْت (maison, demeure)', 'Pluriel بُيُوت. الْبَيْت « la Maison » désigne aussi la Kaaba.', root='بيت', pattern='فَعْل', lemma='بَيْت'),
  N('lex:hadha', 'lexeme', 'هَٰذَا (ce, cette, ceci)', 'Suivi d’un nom avec الْـ : « ce / cette … » (هَٰذَا الْبَيْتُ « cette maison »). Suivi d’un nom sans article : phrase « ceci est … » (هَٰذَا بَيْتٌ « ceci est une maison »).', lemma='ذا'),
  N('lex:rabb', 'lexeme', 'رَبّ (Seigneur, maître)', 'Celui qui possède, élève et prend soin ; très souvent en annexion : رَبُّ الْبَيْتِ.', root='ربب', lemma='رَبّ'),
  N('lex:abada', 'lexeme', 'عَبَدَ / يَعْبُدُ (adorer, servir)', 'Racine ع-ب-د, celle de عَبْد (serviteur) et عِبَادَة (adoration).', root='عبد', pattern='فَعَلَ', lemma='عَبَدَ'),
  N('lex:atama', 'lexeme', 'أَطْعَمَ / يُطْعِمُ (nourrir)', 'Forme IV (أَفْعَلَ) de la racine ط-ع-م, celle de طَعَام (nourriture) : « faire manger ».', root='طعم', pattern='أَفْعَلَ', lemma='أَطْعَمَ'),
  N('lex:amana', 'lexeme', 'آمَنَ (mettre en sécurité ; croire)', 'Forme IV de la racine أ-م-ن (sécurité). Avec un complément et مِنْ : « mettre à l’abri de » ; avec بِ : « croire en ».', root='أمن', pattern='أَفْعَلَ', lemma='آمَنَ'),
  N('lex:ju', 'lexeme', 'جُوع (faim)', 'Racine ج-و-ع, celle du verbe جَاعَ « avoir faim » et de جَائِع « affamé ».', root='جوع', lemma='جُوع'),
  N('lex:jaa', 'lexeme', 'جَاعَ / يَجُوعُ (avoir faim)', 'Verbe de la racine ج-و-ع, comme جُوع (la faim).', root='جوع'),
  N('lex:khawf', 'lexeme', 'خَوْف (peur, crainte)', 'Racine خ-و-ف, celle du verbe خَافَ « avoir peur ».', root='خوف', lemma='خَوْف'),
  N('lex:qala', 'lexeme', 'قَالَ / يَقُولُ (dire)', 'L’impératif est قُلْ « dis ! ».', root='قول', lemma='قالَ'),
  N('lex:huwa', 'lexeme', 'هُوَ (il, lui)', 'Pronom personnel isolé, souvent sujet d’une phrase nominale : هُوَ طَالِبٌ « il [est] étudiant ».'),
  N('lex:allah', 'lexeme', 'اللَّه (Allah)', 'Le nom de Dieu en arabe.'),
  N('lex:ahad', 'lexeme', 'أَحَد (un, unique ; quelqu’un)', 'Affirmatif : « un, unique ». Après une négation : « personne, nul ».', root='أحد', lemma='أَحَد'),
  N('lex:samad', 'lexeme', 'الصَّمَد (l’Absolu, Celui qu’on implore)', 'Nom divin : Celui vers qui l’on se tourne pour tout besoin, qui ne dépend de rien.', root='صمد', lemma='صَمَد'),
  N('lex:walada', 'lexeme', 'وَلَدَ / يَلِدُ (engendrer, enfanter)', 'Racine و-ل-د, celle de وَلَد (enfant). Comme وَجَدَ, le و tombe à l’inaccompli actif (يَلِدُ) ; au passif il revient : يُولَدُ « il est engendré ».', root='ولد', pattern='فَعَلَ', lemma='وَلَدَ'),
  N('lex:walad', 'lexeme', 'وَلَد (enfant, garçon)', 'Pluriel أَوْلَاد. Même racine que وَلَدَ (engendrer).', root='ولد', lemma='وَلَد'),
  N('lex:kana', 'lexeme', 'كَانَ / يَكُونُ (être)', 'Le verbe « être », exprimé au passé et au futur ; après لَمْ, يَكُونُ devient يَكُنْ.', root='كون', lemma='كانَ'),
  N('lex:kufuw', 'lexeme', 'كُفُؤ (égal, équivalent)', 'Ce qui est à la mesure de quelqu’un, son pareil.', root='كفأ', lemma='كُفُو'),
  N('lex:umm', 'lexeme', 'أُمّ (mère)', 'Pluriel أُمَّهَات.', root='أمم', lemma='أُمّ'),
  N('lex:khubz', 'lexeme', 'خُبْز (pain)', 'Racine خ-ب-ز.', root='خبز', lemma='خُبْز'),
  N('lex:ghadan', 'lexeme', 'غَدًا (demain)', 'Adverbe tiré de غَد (le lendemain).', root='غدو', lemma='غَد'),
]
for n in CATALOG:
    if n['category'] == 'lexeme':
        m = re.match(r'^(.*?) \((.*)\)$', n['labelFr'])
        assert m, n['labelFr']
        n['wordAr'], n['meaningFr'] = m.group(1), m.group(2)
CAT = {n['id']: n for n in CATALOG}

def seg(surface, role, notion, gloss):
    assert notion in CAT, notion
    return {'surface': surface, 'role': role, 'notionId': notion, 'glossFr': gloss}

PUNCT = '،.؟!:'
def T(segments, syn=None, pat=None, punct='', quran=None):
    surf = ''.join(s['surface'] for s in segments)
    t = {'surfaceVocalized': surf + punct, 'surfaceUnvocalized': bare(surf) + punct, 'segments': segments}
    if syn: assert syn in CAT, syn; t['syntacticRoleId'] = syn
    if pat: assert pat in CAT, pat; t['patternId'] = pat
    if quran: t['quranRef'] = quran
    return t

def P(**kw):
    toks = kw.pop('tokens')
    for i, t in enumerate(toks): t['index'] = i
    p = {'audioUrl': None, **kw, 'tokens': toks}
    for d in p['diagnosticPrompts']:
        assert d['targetNotionId'] in CAT
        assert all(0 <= i < len(toks) for i in d['targetTokenIndices'])
    return p

S = seg
PASSAGES = [
P(id='conv:library-request-01', corpus='conversation', title='À la bibliothèque : chercher un livre', sourceRef='helloarabic:pilot:conv:01',
  isImmutableSource=False, defaultVocalization='full',
  tokens=[
    T([S('أَطْلُبُ', 'stem', 'lex:talaba', 'je cherche')]),
    T([S('كِتَابَ', 'stem', 'lex:kitab', 'le livre (de)')], syn='syn:idafa'),
    T([S('تَارِيخِ', 'stem', 'lex:tarikh', 'l’histoire (de)')], syn='syn:idafa'),
    T([S('الْ', 'proclitic', 'morph:def_al', 'la'), S('مَدِينَةِ', 'stem', 'lex:madina', 'ville')], syn='syn:idafa', punct='،'),
    T([S('وَ', 'proclitic', 'morph:conj_wa', 'et'), S('سَ', 'proclitic', 'morph:verb_fut_sa', '(futur)'), S('أَقْرَؤُ', 'stem', 'lex:qaraa', 'je lirai'), S('هُ', 'enclitic', 'morph:pron_3ms', 'le (ce livre)')]),
    T([S('فِي', 'stem', 'morph:prep_fi', 'dans')]),
    T([S('الْ', 'proclitic', 'morph:def_al', 'la'), S('مَكْتَبَةِ', 'stem', 'lex:maktaba', 'bibliothèque')], pat='pat:mafal_place', punct='.'),
  ],
  translationFr='Je cherche le livre d’histoire de la ville, et je le lirai à la bibliothèque.',
  diagnosticPrompts=[
    {'id': 'diag:conv01:pron3ms', 'targetTokenIndices': [4], 'targetNotionId': 'morph:pron_3ms',
     'questionFr': 'Dans وَسَأَقْرَؤُهُ, à quoi renvoie le petit ـهُ attaché à la fin ?',
     'expectedAnswerFr': 'Au livre cherché (« je le lirai »)', 'distractorsFr': ['À la bibliothèque (« j’y lirai »)', 'À la personne qui parle (« moi »)']},
    {'id': 'diag:conv01:idafa', 'targetTokenIndices': [1, 2, 3], 'targetNotionId': 'syn:idafa',
     'questionFr': 'Pourquoi كِتَابَ et تَارِيخِ n’ont-ils pas l’article الْـ ?',
     'expectedAnswerFr': 'Ils sont annexés au mot suivant (« le livre de l’histoire de la ville »)', 'distractorsFr': ['Ce sont des verbes', 'Il s’agit d’« un livre » quelconque, indéfini']},
  ],
  transferPassageIds=['conv:library-followup-02', 'story:scribe-house-03', 'conv:library-notfound-05']),

P(id='conv:library-followup-02', corpus='conversation', title='La réponse du bibliothécaire', sourceRef='helloarabic:pilot:conv:02',
  isImmutableSource=False, defaultVocalization='full',
  tokens=[
    T([S('سَ', 'proclitic', 'morph:verb_fut_sa', '(futur)'), S('تَجِدُ', 'stem', 'lex:wajada', 'tu trouveras'), S('هُ', 'enclitic', 'morph:pron_3ms', 'le')]),
    T([S('فِي', 'stem', 'morph:prep_fi', 'dans')]),
    T([S('قِسْمِ', 'stem', 'lex:qism', 'la section (de)')], syn='syn:idafa'),
    T([S('ال', 'proclitic', 'morph:def_al', 'l’'), S('تَّارِيخِ', 'stem', 'lex:tarikh', 'histoire')], syn='syn:idafa', punct='،'),
    T([S('وَ', 'proclitic', 'morph:conj_wa', 'et'), S('سَ', 'proclitic', 'morph:verb_fut_sa', '(futur)'), S('أَكْتُبُ', 'stem', 'lex:kataba', 'j’écrirai')]),
    T([S('لَ', 'proclitic', 'morph:prep_li', 'pour, à'), S('كَ', 'enclitic', 'morph:pron_2ms', 'toi')]),
    T([S('رَقْمَ', 'stem', 'lex:raqm', 'le numéro'), S('هُ', 'enclitic', 'morph:pron_3ms', 'son (du livre)')], punct='.'),
  ],
  translationFr='Tu le trouveras dans la section d’histoire, et je t’écrirai son numéro (sa cote).',
  diagnosticPrompts=[
    {'id': 'diag:conv02:prep_li', 'targetTokenIndices': [5], 'targetNotionId': 'morph:prep_li',
     'questionFr': 'Que signifie le petit mot لَكَ ?', 'expectedAnswerFr': '« Pour toi, à toi » (لَ + ـكَ)', 'distractorsFr': ['« Mais, cependant »', '« À lui, pour lui »']},
    {'id': 'diag:conv02:pron3ms', 'targetTokenIndices': [0], 'targetNotionId': 'morph:pron_3ms',
     'questionFr': 'Dans سَتَجِدُهُ, que représente ـهُ ?', 'expectedAnswerFr': 'Le livre cherché (« tu le trouveras »)', 'distractorsFr': ['Le bibliothécaire (« tu me trouveras »)', 'Le futur (« tu trouveras bientôt »)']},
  ],
  transferPassageIds=['story:scribe-house-03', 'conv:library-notfound-05']),

P(id='story:scribe-house-03', corpus='story', title='Dans la maison du copiste', sourceRef='helloarabic:pilot:story:03',
  isImmutableSource=False, defaultVocalization='unvocalized',
  tokens=[
    T([S('فِي', 'stem', 'morph:prep_fi', 'dans')], syn='syn:nominal_sentence'),
    T([S('بَيْتِ', 'stem', 'lex:bayt', 'maison'), S('هِ', 'enclitic', 'morph:pron_3ms', 'sa (de lui)')], syn='syn:nominal_sentence'),
    T([S('مَكْتَبَةٌ', 'stem', 'lex:maktaba', 'une bibliothèque')], syn='syn:nominal_sentence', pat='pat:mafal_place', punct='،'),
    T([S('وَ', 'proclitic', 'morph:conj_wa', 'et'), S('لَ', 'proclitic', 'morph:prep_li', 'à'), S('هُ', 'enclitic', 'morph:pron_3ms', 'lui (= il a)')]),
    T([S('كِتَابٌ', 'stem', 'lex:kitab', 'un livre')]),
    T([S('يَكْتُبُ', 'stem', 'lex:kataba', 'il écrit'), S('هُ', 'enclitic', 'morph:pron_3ms', 'le')]),
    T([S('وَ', 'proclitic', 'morph:conj_wa', 'et'), S('يَقْرَؤُ', 'stem', 'lex:qaraa', 'il lit'), S('هُ', 'enclitic', 'morph:pron_3ms', 'le')], punct='.'),
  ],
  translationFr='Dans sa maison, il y a une bibliothèque, et il a un livre qu’il écrit et qu’il lit.',
  diagnosticPrompts=[
    {'id': 'diag:story03:lahu', 'targetTokenIndices': [3, 4], 'targetNotionId': 'morph:prep_li',
     'questionFr': 'Comment comprendre وَلَهُ كِتَابٌ ?', 'expectedAnswerFr': '« Et il a un livre » (litt. « et à lui un livre »)', 'distractorsFr': ['« Et vers son livre »', '« Et il a écrit un livre »']},
    {'id': 'diag:story03:nominal', 'targetTokenIndices': [0, 1, 2], 'targetNotionId': 'syn:nominal_sentence',
     'questionFr': 'في بيته مكتبة n’a pas de verbe. Que veut dire cette proposition ?', 'expectedAnswerFr': '« Dans sa maison, il y a une bibliothèque »', 'distractorsFr': ['« Il est allé à la bibliothèque de sa maison »', '« Sa maison est loin de la bibliothèque »']},
  ],
  transferPassageIds=['conv:library-request-01', 'story:hungry-children-04']),

P(id='story:hungry-children-04', corpus='story', title='Les enfants avaient faim', sourceRef='helloarabic:pilot:story:04',
  isImmutableSource=False, defaultVocalization='full',
  tokens=[
    T([S('جَاعَ', 'stem', 'lex:jaa', 'ont eu faim')]),
    T([S('الْ', 'proclitic', 'morph:def_al', 'les'), S('أَوْلَادُ', 'stem', 'lex:walad', 'enfants')], punct='،'),
    T([S('فَ', 'proclitic', 'morph:conj_fa', 'alors'), S('أَطْعَمَتْ', 'stem', 'lex:atama', 'a nourri'), S('هُمْ', 'enclitic', 'morph:pron_3mp', 'les')]),
    T([S('أُمُّ', 'stem', 'lex:umm', 'la mère (de)'), S('هُمْ', 'enclitic', 'morph:pron_3mp', 'leur')]),
    T([S('مِنْ', 'stem', 'morph:prep_min', 'de, avec')]),
    T([S('خُبْزِ', 'stem', 'lex:khubz', 'le pain (de)')], syn='syn:idafa'),
    T([S('الْ', 'proclitic', 'morph:def_al', 'la'), S('بَيْتِ', 'stem', 'lex:bayt', 'maison')], syn='syn:idafa', punct='.'),
  ],
  translationFr='Les enfants ont eu faim, alors leur mère les a nourris du pain de la maison.',
  diagnosticPrompts=[
    {'id': 'diag:story04:pron3mp', 'targetTokenIndices': [2], 'targetNotionId': 'morph:pron_3mp',
     'questionFr': 'Dans فَأَطْعَمَتْهُمْ, qui sont « ـهُمْ » ?', 'expectedAnswerFr': 'Les enfants (« elle les a nourris »)', 'distractorsFr': ['La mère (« elle s’est nourrie »)', 'Le pain (« elle l’a cuit »)']},
    {'id': 'diag:story04:fa', 'targetTokenIndices': [2], 'targetNotionId': 'morph:conj_fa',
     'questionFr': 'Quel lien exprime le فَـ au début de فَأَطْعَمَتْهُمْ ?', 'expectedAnswerFr': 'Une conséquence : « alors »', 'distractorsFr': ['Une opposition : « mais »', 'Un but : « pour que »']},
  ],
  transferPassageIds=['quran:106:3-4', 'story:scribe-house-03']),

P(id='conv:library-notfound-05', corpus='conversation', title='Le livre introuvable', sourceRef='helloarabic:pilot:conv:05',
  isImmutableSource=False, defaultVocalization='full',
  tokens=[
    T([S('لَمْ', 'stem', 'syn:lam_jussive', 'ne … pas (passé)')]),
    T([S('أَجِدِ', 'stem', 'lex:wajada', 'j’ai trouvé')], syn='syn:lam_jussive'),
    T([S('الْ', 'proclitic', 'morph:def_al', 'le'), S('كِتَابَ', 'stem', 'lex:kitab', 'livre')]),
    T([S('فِي', 'stem', 'morph:prep_fi', 'dans')]),
    T([S('الْ', 'proclitic', 'morph:def_al', 'la'), S('مَكْتَبَةِ', 'stem', 'lex:maktaba', 'bibliothèque')], pat='pat:mafal_place', punct='،'),
    T([S('فَ', 'proclitic', 'morph:conj_fa', 'alors'), S('سَ', 'proclitic', 'morph:verb_fut_sa', '(futur)'), S('أَطْلُبُ', 'stem', 'lex:talaba', 'je demanderai'), S('هُ', 'enclitic', 'morph:pron_3ms', 'le')]),
    T([S('غَدًا', 'stem', 'lex:ghadan', 'demain')], punct='.'),
  ],
  translationFr='Je n’ai pas trouvé le livre à la bibliothèque, alors je le demanderai demain.',
  diagnosticPrompts=[
    {'id': 'diag:conv05:lam', 'targetTokenIndices': [0, 1], 'targetNotionId': 'syn:lam_jussive',
     'questionFr': 'لَمْ أَجِدِ : à quel temps se situe l’action ?', 'expectedAnswerFr': 'Au passé, à la forme négative (« je n’ai pas trouvé »)', 'distractorsFr': ['Au futur (« je trouverai »)', 'Au présent (« je trouve »)']},
  ],
  transferPassageIds=['quran:112:1-4', 'conv:library-followup-02']),

P(id='quran:106:3-4', corpus='quran', title='Sourate Quraysh (106, versets 3-4)', sourceRef='quran:uthmani:106:3-4',
  isImmutableSource=True, defaultVocalization='full', surah=106, verses=[3, 4],
  tokens=[
    T([S('فَ', 'proclitic', 'morph:conj_fa', 'donc'), S('لْ', 'proclitic', 'morph:lam_amr', 'qu’ils…'), S('يَعْبُدُوا۟', 'stem', 'lex:abada', 'adorent')], quran=[106, 3, 0]),
    T([S('رَبَّ', 'stem', 'lex:rabb', 'le Seigneur (de)')], syn='syn:idafa', quran=[106, 3, 1]),
    T([S('هَـٰذَا', 'stem', 'lex:hadha', 'cette')], syn='syn:idafa', quran=[106, 3, 2]),
    T([S('ٱلْ', 'proclitic', 'morph:def_al', 'la'), S('بَيْتِ', 'stem', 'lex:bayt', 'Maison')], syn='syn:idafa', quran=[106, 3, 3]),
    T([S('ٱلَّذِىٓ', 'stem', 'syn:relative', 'Celui qui')], quran=[106, 4, 0]),
    T([S('أَطْعَمَ', 'stem', 'lex:atama', 'a nourri'), S('هُم', 'enclitic', 'morph:pron_3mp', 'les')], syn='syn:relative', quran=[106, 4, 1]),
    T([S('مِّن', 'stem', 'morph:prep_min', 'contre')], quran=[106, 4, 2]),
    T([S('جُوعٍۢ', 'stem', 'lex:ju', 'la faim')], quran=[106, 4, 3]),
    T([S('وَ', 'proclitic', 'morph:conj_wa', 'et'), S('ءَامَنَ', 'stem', 'lex:amana', 'a mis en sécurité'), S('هُم', 'enclitic', 'morph:pron_3mp', 'les')], quran=[106, 4, 4]),
    T([S('مِّنْ', 'stem', 'morph:prep_min', 'contre')], quran=[106, 4, 5]),
    T([S('خَوْفٍۭ', 'stem', 'lex:khawf', 'la crainte')], quran=[106, 4, 6]),
  ],
  translationFr='Qu’ils adorent donc le Seigneur de cette Maison, qui les a nourris contre la faim et rassurés de la crainte !',
  translationSource='Trad. Hamidullah',
  diagnosticPrompts=[
    {'id': 'diag:quran106:idafa', 'targetTokenIndices': [1, 2, 3], 'targetNotionId': 'syn:idafa',
     'questionFr': 'Quel lien unit رَبَّ et هَـٰذَا ٱلْبَيْتِ ?', 'expectedAnswerFr': 'Une annexion : « le Seigneur de cette Maison »', 'distractorsFr': ['Une énumération : « le Seigneur et cette Maison »', 'Un verbe suivi de son sujet']},
    {'id': 'diag:quran106:pron3mp', 'targetTokenIndices': [5, 8], 'targetNotionId': 'morph:pron_3mp',
     'questionFr': 'Dans أَطْعَمَهُم et ءَامَنَهُم, que désigne ـهُم ?', 'expectedAnswerFr': 'Eux, les Quraysh (« il les a nourris… »)', 'distractorsFr': ['« Nous » (« il nous a nourris »)', 'La Maison (« il l’a protégée »)']},
  ],
  transferPassageIds=['story:hungry-children-04']),

P(id='quran:112:1-4', corpus='quran', title='Sourate Al-Ikhlāṣ (112, versets 1-4)', sourceRef='quran:uthmani:112:1-4',
  isImmutableSource=True, defaultVocalization='full', surah=112, verses=[1, 2, 3, 4],
  tokens=[
    T([S('قُلْ', 'stem', 'lex:qala', 'dis')], quran=[112, 1, 0]),
    T([S('هُوَ', 'stem', 'lex:huwa', 'Il (est)')], syn='syn:nominal_sentence', quran=[112, 1, 1]),
    T([S('ٱللَّهُ', 'stem', 'lex:allah', 'Allah')], syn='syn:nominal_sentence', quran=[112, 1, 2]),
    T([S('أَحَدٌ', 'stem', 'lex:ahad', 'Unique')], syn='syn:nominal_sentence', quran=[112, 1, 3]),
    T([S('ٱللَّهُ', 'stem', 'lex:allah', 'Allah')], syn='syn:nominal_sentence', quran=[112, 2, 0]),
    T([S('ٱل', 'proclitic', 'morph:def_al', 'l’'), S('صَّمَدُ', 'stem', 'lex:samad', 'Absolu')], syn='syn:nominal_sentence', quran=[112, 2, 1]),
    T([S('لَمْ', 'stem', 'syn:lam_jussive', 'n’a pas')], quran=[112, 3, 0]),
    T([S('يَلِدْ', 'stem', 'lex:walada', 'engendré')], syn='syn:lam_jussive', quran=[112, 3, 1]),
    T([S('وَ', 'proclitic', 'morph:conj_wa', 'et'), S('لَمْ', 'stem', 'syn:lam_jussive', 'n’a pas')], quran=[112, 3, 2]),
    T([S('يُولَدْ', 'stem', 'lex:walada', 'été engendré')], syn='syn:lam_jussive', quran=[112, 3, 3]),
    T([S('وَ', 'proclitic', 'morph:conj_wa', 'et'), S('لَمْ', 'stem', 'syn:lam_jussive', 'n’est pas')], quran=[112, 4, 0]),
    T([S('يَكُن', 'stem', 'lex:kana', 'est (n’est pas)')], syn='syn:lam_jussive', quran=[112, 4, 1]),
    T([S('لَّ', 'proclitic', 'morph:prep_li', 'à'), S('هُۥ', 'enclitic', 'morph:pron_3ms', 'Lui')], quran=[112, 4, 2]),
    T([S('كُفُوًا', 'stem', 'lex:kufuw', 'égal')], quran=[112, 4, 3]),
    T([S('أَحَدٌۢ', 'stem', 'lex:ahad', 'personne, nul')], quran=[112, 4, 4]),
  ],
  translationFr='Dis : « Il est Allah, Unique. Allah, Le Seul à être imploré pour ce que nous désirons. Il n’a jamais engendré, n’a pas été engendré non plus. Et nul n’est égal à Lui. »',
  translationSource='Trad. Hamidullah',
  diagnosticPrompts=[
    {'id': 'diag:quran112:lam', 'targetTokenIndices': [6, 7], 'targetNotionId': 'syn:lam_jussive',
     'questionFr': 'لَمْ يَلِدْ : quel sens donne لَمْ au verbe ?', 'expectedAnswerFr': 'Une négation au passé : « Il n’a pas engendré »', 'distractorsFr': ['Une question : « A-t-Il engendré ? »', 'Un futur : « Il engendrera »']},
    {'id': 'diag:quran112:lahu', 'targetTokenIndices': [12], 'targetNotionId': 'morph:prep_li',
     'questionFr': 'Dans لَّهُۥ, de quoi est formé ce mot ?', 'expectedAnswerFr': 'De لِ « à » + ـهُ « Lui » : « à Lui »', 'distractorsFr': ['De la négation لَا + ـهُ', 'D’un seul mot, « Dieu »']},
  ],
  transferPassageIds=['conv:library-notfound-05']),
]

# Vérifications : Coran = texte exact des données
for p in PASSAGES:
    if p['corpus'] != 'quran': continue
    s = json.load(open(ROOT + f"data/quran/surah-{p['surah']}.json"))
    for t in p['tokens']:
        sn, vn, j = t['quranRef']
        v = next(v for v in s['verses'] if v['n'] == vn)
        exact = v['w'][j]['t']
        assert len(exact) == len(t['surfaceVocalized']) and bare(exact) == bare(t['surfaceVocalized']), (t['surfaceVocalized'], exact)
        # On reprend le texte exact des données (ordre des signes compris), découpé aux mêmes positions
        k = 0
        for sg in t['segments']:
            sg['surface'] = exact[k:k + len(sg['surface'])]; k += len(sg['surface'])
        t['surfaceVocalized'] = exact
        t['surfaceUnvocalized'] = bare(exact)
        assert ''.join(sg['surface'] for sg in t['segments']) == exact
    n = sum(len(next(v for v in s['verses'] if v['n'] == vn)['w']) for vn in p['verses'])
    assert n == len(p['tokens']), (p['id'], n, len(p['tokens']))
for p in PASSAGES:
    for tid in p['transferPassageIds']:
        assert any(q['id'] == tid for q in PASSAGES), tid

DRILLS = [
  # notionId, vocalisé, sens ; les phrases ne sont jamais tirées du Coran
  ('morph:pron_3ms', 'أَخَذَ الطَّالِبُ الْكِتَابَ وَقَرَأَهُ.', 'L’étudiant a pris le livre et l’a lu.'),
  ('morph:pron_3ms', 'هَٰذَا بَيْتُهُ.', 'Voici sa maison.'),
  ('morph:pron_3mp', 'الْأَوْلَادُ جَائِعُونَ فَأَطْعَمْتُهُمْ.', 'Les enfants ont faim, alors je les ai nourris.'),
  ('morph:pron_3mp', 'هَٰذِهِ مَدِينَتُهُمْ.', 'Voici leur ville.'),
  ('morph:pron_2ms', 'هَلْ هَٰذَا كِتَابُكَ؟', 'Est-ce ton livre ?'),
  ('syn:idafa', 'بَابُ الْبَيْتِ مَفْتُوحٌ.', 'La porte de la maison est ouverte.'),
  ('syn:idafa', 'قَرَأْتُ كِتَابَ الْمُعَلِّمِ.', 'J’ai lu le livre du professeur.'),
  ('morph:prep_li', 'لِلْمَدِينَةِ تَارِيخٌ طَوِيلٌ.', 'La ville a une longue histoire.'),
  ('morph:prep_li', 'هَٰذِهِ الرِّسَالَةُ لَكَ.', 'Cette lettre est pour toi.'),
  ('morph:lam_amr', 'لِيَكْتُبْ كُلُّ طَالِبٍ اسْمَهُ.', 'Que chaque étudiant écrive son nom.'),
  ('morph:lam_amr', 'فَلْيَقْرَأِ الطُّلَّابُ الدَّرْسَ.', 'Que les étudiants lisent donc la leçon.'),
  ('morph:conj_fa', 'جَاعَ الطِّفْلُ فَأَكَلَ.', 'L’enfant a eu faim, alors il a mangé.'),
  ('morph:conj_fa', 'دَخَلْتُ الْمَكْتَبَةَ فَوَجَدْتُ الْكِتَابَ.', 'Je suis entré dans la bibliothèque et j’ai aussitôt trouvé le livre.'),
  ('morph:conj_wa', 'قَرَأْتُ الْكِتَابَ وَكَتَبْتُ الدَّرْسَ.', 'J’ai lu le livre et j’ai écrit la leçon.'),
  ('morph:prep_fi', 'الْكِتَابُ فِي الْبَيْتِ.', 'Le livre est dans la maison.'),
  ('morph:prep_min', 'خَرَجْتُ مِنَ الْبَيْتِ.', 'Je suis sorti de la maison.'),
  ('morph:prep_min', 'الْبَابُ يَحْمِينَا مِنَ الْبَرْدِ.', 'La porte nous protège du froid.'),
  ('morph:def_al', 'الشَّمْسُ وَالْقَمَرُ.', 'Le soleil et la lune.'),
  ('morph:verb_fut_sa', 'سَأَكْتُبُ لَكَ غَدًا.', 'Je t’écrirai demain.'),
  ('syn:nominal_sentence', 'الْبَيْتُ كَبِيرٌ.', 'La maison est grande.'),
  ('syn:nominal_sentence', 'فِي الْمَدِينَةِ مَكْتَبَةٌ.', 'Dans la ville, il y a une bibliothèque.'),
  ('syn:relative', 'هَٰذَا هُوَ الرَّجُلُ الَّذِي كَتَبَ الْكِتَابَ.', 'Voici l’homme qui a écrit le livre.'),
  ('syn:lam_jussive', 'لَمْ يَكْتُبِ الطَّالِبُ الدَّرْسَ.', 'L’étudiant n’a pas écrit la leçon.'),
  ('syn:lam_jussive', 'لَمْ أَذْهَبْ إِلَى الْمَدْرَسَةِ.', 'Je ne suis pas allé à l’école.'),
  ('pat:mafal_place', 'دَرَسْتُ فِي الْمَدْرَسَةِ.', 'J’ai étudié à l’école.'),
  ('lex:bayt', 'بَيْتُ صَدِيقِي قَرِيبٌ مِنَ الْمَكْتَبَةِ.', 'La maison de mon ami est proche de la bibliothèque.'),
  ('lex:atama', 'أَطْعَمَتِ الْأُمُّ طِفْلَهَا.', 'La mère a nourri son enfant.'),
  ('lex:amana', 'آمَنَ الْحَارِسُ الْقَرْيَةَ مِنَ اللُّصُوصِ.', 'Le gardien a mis le village à l’abri des voleurs.'),
  ('lex:abada', 'يَعْبُدُ النَّاسُ رَبَّهُمْ.', 'Les gens adorent leur Seigneur.'),
  ('lex:rabb', 'رَبُّ الْبَيْتِ كَرِيمٌ.', 'Le maître de maison est généreux.'),
  ('lex:hadha', 'هَٰذَا الْكِتَابُ جَدِيدٌ.', 'Ce livre est neuf.'),
  ('lex:ju', 'شَعَرْتُ بِالْجُوعِ.', 'J’ai eu faim (litt. j’ai ressenti la faim).'),
  ('lex:khawf', 'لَا خَوْفَ عَلَيْكَ.', 'N’aie pas peur (litt. pas de crainte sur toi).'),
  ('lex:kitab', 'الْكِتَابُ عَلَى الطَّاوِلَةِ.', 'Le livre est sur la table.'),
  ('lex:kataba', 'كَتَبَتِ الْبِنْتُ رِسَالَةً.', 'La fille a écrit une lettre.'),
  ('lex:qaraa', 'يَقْرَأُ أَبِي الْجَرِيدَةَ.', 'Mon père lit le journal.'),
  ('lex:maktaba', 'الْمَكْتَبَةُ مُغْلَقَةٌ الْيَوْمَ.', 'La bibliothèque est fermée aujourd’hui.'),
  ('lex:wajada', 'وَجَدْتُ مِفْتَاحِي.', 'J’ai trouvé ma clé.'),
  ('lex:walada', 'وُلِدْتُ فِي بَارِيسَ.', 'Je suis né à Paris.'),
  ('lex:qala', 'قَالَ الْمُعَلِّمُ: اُكْتُبُوا.', 'Le professeur a dit : « Écrivez. »'),
  ('lex:ahad', 'لَمْ يَأْتِ أَحَدٌ.', 'Personne n’est venu.'),
  ('lex:kana', 'كَانَ الْجَوُّ جَمِيلًا.', 'Il faisait beau (litt. le temps était beau).'),
]
drills = []
for i, (nid, ar, fr) in enumerate(DRILLS):
    assert nid in CAT, nid
    drills.append({'id': f'drill:{i:02d}', 'notionId': nid, 'arabicVocalized': ar, 'arabicUnvocalized': bare(ar), 'frenchMeaning': fr})

out = {'version': 1, 'catalog': CAT, 'passages': PASSAGES, 'drills': drills}
import os
os.makedirs(ROOT + 'data/pedagogy', exist_ok=True)
json.dump(out, open(ROOT + 'data/pedagogy/library.json', 'w'), ensure_ascii=False, indent=1)
used = {s['notionId'] for p in PASSAGES for t in p['tokens'] for s in t['segments']} | {t.get('syntacticRoleId') for p in PASSAGES for t in p['tokens']} | {t.get('patternId') for p in PASSAGES for t in p['tokens']}
print('notions', len(CAT), 'passages', len(PASSAGES), 'drills', len(drills))
print('sans exemple:', sorted(n for n in used if n and not any(d['notionId'] == n for d in drills)))
print('notions inutilisées:', sorted(set(CAT) - used))
