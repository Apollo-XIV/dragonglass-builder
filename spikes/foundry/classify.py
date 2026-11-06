# THROWAWAY (spike/foundry-integration): feature classification + id audit over converted SRD trees.
import json,glob,collections,re,sys
FEATURE_KINDS={"class-feature","subclass-feature","species-trait","background-feature","feat","feature","fighting-style","metamagic","eldritch-invocation","pact-boon"}
def load(base):
    els=[]
    for f in glob.glob(base+'/content/**/*.json',recursive=True):
        d=json.load(open(f)); els+= d if isinstance(d,list) else [d]
    return els
def has(e,k): return bool(e.get(k))
def classify(e):
    if has(e,'resources'): return 'resource'
    if has(e,'effects') or any(a.get('applies') for a in e.get('actions',[])): return 'toggle'
    if has(e,'actions'): return 'other:actions-only'
    if has(e,'modifiers'): return 'passive'
    if has(e,'choices') or has(e,'grants'): return 'structural'
    return 'text-only'
SIGNS=re.compile(r'long rest|short rest|bonus action|as a reaction|uses?\b.*\bper\b|once per|proficiency bonus times|until the end of your next turn|for 1 minute',re.I)
slug=lambda s: re.sub(r'[^a-z0-9]+','-',s.lower()).strip('-')
roots=dict(a.split('=') for a in sys.argv[1:])
allids={}
for s,base in roots.items():
    els=load(base)
    feats=[e for e in els if e['kind'] in FEATURE_KINDS]
    c=collections.Counter(classify(e) for e in feats)
    # parts also live on class/subclass/species level entries
    lvl=collections.Counter()
    for e in els:
        for k,le in (e.get('levels') or {}).items():
            for p in ('resources','actions','effects','modifiers'):
                if le.get(p): lvl[p]+=1
    textonly=[e for e in feats if classify(e)=='text-only']
    suspect=[e for e in textonly if SIGNS.search(e.get('text',''))]
    print(f"\n== {s}: {len(els)} elements, {len(feats)} features")
    print(' by part kind:',dict(c))
    print(' parts on level entries (not on a feature):',dict(lvl))
    print(f" text-only features whose text signals a mechanic (rest/bonus action/uses): {len(suspect)}/{len(textonly)}")
    byk=collections.defaultdict(collections.Counter)
    for e in feats: byk[e['kind']][classify(e)]+=1
    for k,v in sorted(byk.items()): print('   ',k,dict(v))
    odd=[e['id'] for e in feats if classify(e).startswith('other')]
    print(' other:',odd[:20])
    print(' sample suspect:',[e['id'] for e in suspect[:12]])
    # non-feature mechanised things
    for k in ('spell','item'):
        xs=[e for e in els if e['kind']==k]
        print(f"   {k}: {len(xs)}; with actions {sum(has(e,'actions') for e in xs)}; resources {sum(has(e,'resources') for e in xs)}; modifiers {sum(has(e,'modifiers') for e in xs)}")
    # id audit
    ids=[e['id'] for e in els]
    pat=re.compile(r'^[a-z0-9]+(:[a-z0-9][a-z0-9-]*){2,}$')
    bad=[i for i in ids if not pat.match(i)]
    dup=[i for i,n in collections.Counter(ids).items() if n>1]
    names=collections.Counter((e['kind'],e['name']) for e in els)
    dupnames=[k for k,n in names.items() if n>1]
    mism=[e['id'] for e in els if e['kind'] not in('kind','sourcebook') and slug(e['name'])!=e['id'].split(':')[-1]]
    print(f" ids: bad-pattern {len(bad)} {bad[:5]}; duplicate {len(dup)}; same-kind-same-name {len(dupnames)} {dupnames[:6]}; id-tail != slug(name) {len(mism)} e.g. {mism[:6]}")
    segs=collections.Counter(e['id'].split(':')[1] for e in els if e['kind'] not in ('kind','sourcebook'))
    kindseg=sum(1 for e in els if ':' in e['id'] and (e['id'].split(':')[1]==e['kind'] or e['id'].split(':')[1] in e['kind']))
    print(' second segment is kind-ish:',kindseg,'of',len(els),'; top second segments:',segs.most_common(8))
    for e in els: allids.setdefault(e['id'],[]).append(s)
print('\ncross-tree duplicate ids:',[i for i,v in allids.items() if len(v)>1][:5])
