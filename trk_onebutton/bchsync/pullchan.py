import daemon,json,time
orig=daemon.call
def c(fn,*a):
    if fn=='bchSyncPending': r=orig(fn,*a); r['caseId']='case-15487498'; return r
    if fn=='bchSyncIngest':
        r=orig(fn,*a); r['results']=[x for x in r['results'] if x['caseId']=='case-15487498']; return r
    return orig(fn,*a)
daemon.call=c
t=time.time(); print(daemon.once(force=True),round(time.time()-t),'s')
b=json.load(open('cache/case-15487498.bundle.json')); print('keys',list(b)[:20])
