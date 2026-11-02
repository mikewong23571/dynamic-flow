import sqlite3,sys,json,pathlib,os
from typing_extensions import TypedDict
from langgraph.graph import StateGraph,START,END
from langgraph.types import interrupt,Command
from langgraph.checkpoint.sqlite import SqliteSaver
root=pathlib.Path(os.environ['FLOWCRAFT_RESEARCH_DIR']);root.mkdir(parents=True,exist_ok=True);phase=sys.argv[1]
class S(TypedDict):value:str
def count(k):
 p=root/'restart-counts.json';d=json.loads(p.read_text()) if p.exists() else {};d[k]=d.get(k,0)+1;p.write_text(json.dumps(d))
def earlier(s):count('completed_child');return {}
def human(s):count('interrupt_prefix');return {'value':interrupt('provide value')}
b=StateGraph(S);b.add_node('earlier',earlier);b.add_node('human',human);b.add_edge(START,'earlier');b.add_edge('earlier','human');b.add_edge('human',END);sub=b.compile()
def wrapper(s):count('parent_prefix');return sub.invoke(s)
top=StateGraph(S);top.add_node('wrapper',wrapper);top.add_edge(START,'wrapper');top.add_edge('wrapper',END)
with SqliteSaver.from_conn_string(str(root/'restart.sqlite')) as saver:
 g=top.compile(checkpointer=saver);r=g.invoke({'value':'initial'} if phase=='first' else Command(resume='resumed-in-new-process'),{'configurable':{'thread_id':'restart'}})
 print(phase, r)
print((root/'restart-counts.json').read_text())
