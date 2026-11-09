# THROWAWAY (spike/foundry-integration): counts parts across converted SRD trees.
import json,glob,collections,sys
PARTS=['resources','actions','effects','modifiers','choices','grants']
for s in ['srd','srd24']:
    base=f'../5etools-to-dragonglass/out/{s}/content'
    els=[]
    for f in glob.glob(base+'/**/*.json',recursive=True):
        d=json.load(open(f)); els+= d if isinstance(d,list) else [d]
    top=collections.Counter(); lvl=collections.Counter(); kinds=collections.defaultdict(collections.Counter)
    for e in els:
        for p in PARTS:
            if e.get(p): top[p]+=1; kinds[e['kind']][p]+=1
        for k,le in (e.get('levels') or {}).items():
            for p in PARTS:
                if le.get(p): lvl[p]+=1
    print(s,len(els),'top',dict(top),'levels',dict(lvl))
    for k,v in kinds.items(): print('   ',k,dict(v))
