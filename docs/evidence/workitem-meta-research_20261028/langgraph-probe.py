import operator, json, importlib.metadata, hashlib
from collections import Counter
from typing import Annotated
from typing_extensions import TypedDict
from langgraph.graph import StateGraph, START, END
from langgraph.types import Send, interrupt, Command
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.func import task

class S(TypedDict):
    rows: Annotated[list, operator.add]
    items: list[int]

def fanout_probe(catch):
    calls=Counter(); outputs=[]
    def work(s):
        i=s['i'];calls[i]+=1
        if i==1 and calls[i]==1:
            if catch:return {'rows':[{'id':i,'status':'failed'}]}
            raise ValueError('one controlled failure')
        return {'rows':[{'id':i,'status':'ok'}]}
    b=StateGraph(S);b.add_node('work',work);b.add_node('collect',lambda s: outputs.append(list(s['rows'])) or {})
    b.add_conditional_edges(START,lambda s:[Send('work',{'i':i}) for i in s['items']]);b.add_edge('work','collect');b.add_edge('collect',END)
    cp=InMemorySaver();g=b.compile(checkpointer=cp);cfg={'configurable':{'thread_id':'fanout'}}
    try:r=g.invoke({'items':[0,1,2],'rows':[]},cfg)
    except ValueError:
        snap=g.get_state(cfg)
        print('failed_superstep',json.dumps({'state_rows':snap.values['rows'],'checkpoint_rows':cp.get_tuple(cfg).checkpoint['channel_values'].get('rows'),'pending_count':len(cp.get_tuple(cfg).pending_writes),'calls':dict(calls),'collector_calls':len(outputs),'task_error':[t.error for t in snap.tasks]}))
        r=g.invoke(None,cfg)
    print('fanout',json.dumps({'catch':catch,'rows':r['rows'],'calls':dict(calls),'collector_calls':len(outputs)}))
fanout_probe(False);fanout_probe(True)

class V(TypedDict):
    rows: Annotated[list[str],operator.add]
for mode in ['separate','list','defer','list_missing']:
    observations=[]
    b=StateGraph(V)
    for key in ['a','b','b2','c']:
        b.add_node(key,lambda s,k=key:{'rows':[k]})
    b.add_node('d',lambda s: observations.append(list(s['rows'])) or {},defer=mode=='defer')
    b.add_edge(START,'a')
    if mode=='list_missing':b.add_conditional_edges('a',lambda s:['b'])
    else:b.add_edge('a','b');b.add_edge('a','c')
    b.add_edge('b','b2')
    if mode.startswith('list'):b.add_edge(['b2','c'],'d')
    else:b.add_edge('b2','d');b.add_edge('c','d')
    b.add_edge('d',END)
    r=b.compile().invoke({'rows':[]})
    print('barrier',json.dumps({'mode':mode,'collector_calls':len(observations),'observations':observations,'final':r}))

for protected in [False,True]:
    calls=Counter()
    @task
    def receipt():
        calls['effect']+=1;return 'saved'
    def before(s):calls['child_early']+=1;return {}
    def human(s):
        calls['child_before_interrupt']+=1
        response=interrupt({'question':'continue?'})
        return {'rows':[str(response)]}
    sub=StateGraph(V);sub.add_node('before',before);sub.add_node('human',human);sub.add_edge(START,'before');sub.add_edge('before','human');sub.add_edge('human',END);sg=sub.compile()
    def parent(s):
        calls['parent_wrapper']+=1
        if protected:receipt().result()
        else:calls['effect']+=1
        return sg.invoke(s)
    top=StateGraph(V);top.add_node('parent',parent);top.add_edge(START,'parent');top.add_edge('parent',END);g=top.compile(checkpointer=InMemorySaver());cfg={'configurable':{'thread_id':str(protected)}}
    first=g.invoke({'rows':[]},cfg);last=g.invoke(Command(resume='approved'),cfg)
    print('nested_interrupt',json.dumps({'protected_task':protected,'calls':dict(calls),'first_interrupt':bool(first.get('__interrupt__')),'result':last}))

import langgraph.types,langgraph.pregel._runner,langgraph.pregel._loop,langgraph.channels.binop
for m in [langgraph.types,langgraph.pregel._runner,langgraph.pregel._loop,langgraph.channels.binop]:
    p=m.__file__;print('source',p,hashlib.sha256(open(p,'rb').read()).hexdigest())
print('version',importlib.metadata.version('langgraph'))
