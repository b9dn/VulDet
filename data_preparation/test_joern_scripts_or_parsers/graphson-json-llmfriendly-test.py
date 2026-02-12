#!/usr/bin/env python3
import json, argparse, sys, collections
from typing import Any

def unwrap(obj: Any):
    if isinstance(obj, dict):
        if '@value' in obj and len(obj)==1:
            return unwrap(obj['@value'])
        if '@type' in obj and '@value' in obj:
            return unwrap(obj['@value'])
        return {k: unwrap(v) for k,v in obj.items()}
    if isinstance(obj, list):
        return [unwrap(x) for x in obj]
    return obj

def collect_vertices_and_edges(root):
    nodes = []
    edges = []
    candidates = []
    def walk(o):
        if isinstance(o, dict):
            for k,v in o.items():
                if isinstance(v, list):
                    candidates.append(v)
                walk(v)
        elif isinstance(o, list):
            for e in o:
                walk(e)
    walk(root)
    seen_v = []
    seen_e = []
    for lst in candidates:
        for item in lst:
            if not isinstance(item, dict): 
                continue
            t = item.get('@type') or (item.get('type') if isinstance(item.get('type'), str) else None)
            v = item.get('@value') or item.get('value') or item.get('properties') or None
            if t and 'Vertex' in t:
                seen_v.append(item)
            elif t and 'Edge' in t:
                seen_e.append(item)
    if not seen_v and isinstance(root, list):
        for item in root:
            if isinstance(item, dict) and item.get('@type') and 'Vertex' in item.get('@type'):
                seen_v.append(item)
    for item in seen_v:
        val = unwrap(item.get('@value', item))
        vid = None
        label = val.get('label') if isinstance(val, dict) else None
        if isinstance(val, dict):
            id_field = val.get('id')
            if isinstance(id_field, dict):
                vid = unwrap(id_field)
            else:
                vid = id_field
            props = {}
            if 'properties' in val and isinstance(val['properties'], dict):
                for k, arr in val['properties'].items():
                    if isinstance(arr, list) and len(arr)>0:
                        first = arr[0]
                        if not isinstance(first, dict):
                            props[k] = unwrap(first)
                        else:
                            p = unwrap(first.get('@value', first))
                            if isinstance(p, dict):
                                props[k] = p.get('value', p)
                            else:
                                props[k] = p

            else:
                for kk, vv in val.items():
                    if kk not in ('id','label','properties'):
                        props[kk] = unwrap(vv)
        else:
            vid = unwrap(val)
            label = None
            props = {}
        nodes.append({'id': str(vid), 'label': label, 'props': props, 'raw': val})
    for item in seen_e:
        val = unwrap(item.get('@value', item))
        eid = val.get('id') if isinstance(val, dict) else None
        label = val.get('label') if isinstance(val, dict) else None
        outV = None; inV = None
        props = {}
        if isinstance(val, dict):
            outV = unwrap(val.get('out')) or unwrap(val.get('outV')) or unwrap(val.get('outVertex')) or unwrap(val.get('outId'))
            inV  = unwrap(val.get('in')) or unwrap(val.get('inV')) or unwrap(val.get('inVertex')) or unwrap(val.get('inId'))
            if 'properties' in val and isinstance(val['properties'], dict):
                for k,v in val['properties'].items():
                    props[k] = unwrap(v)
            else:
                for kk,vv in val.items():
                    if kk not in ('id','label','out','in','outV','inV','properties'):
                        props[kk] = unwrap(vv)
        edges.append({'id': str(eid), 'label': label, 'src': str(outV) if outV is not None else None, 'dst': str(inV) if inV is not None else None, 'props': props, 'raw': val})
    return nodes, edges

def build_indices(nodes, edges):
    byLabel = collections.defaultdict(list)
    for n in nodes:
        byLabel[n.get('label')].append(n['id'])
    nodeMap = {n['id']: n for n in nodes}
    return dict(byLabel), nodeMap

def guess_layer_hints(edges):
    """
    Zwróć hint mapę edge label -> layer (ast/cfg/pdg/other) bazując na znanych etykietach.
    Użyteczne dla LLM (szybkie rozróżnienie AST vs CFG vs PDG).
    """
    ast_labels = set(['AST','CONTAINS','IS_AST_PARENT','AST_EDGE','CONTAINS'])
    cfg_labels = set(['CFG','NEXT','REACHING_DEF','CFG_EDGE','FLOWS_TO','CFG_NEXT'])
    pdg_labels = set(['PDG','REACHING_DEF','DATA_DEP','CONTROLS','CONTROLS_EDGE'])
    mapping = {'ast': set(), 'cfg': set(), 'pdg': set(), 'other': set()}
    for e in edges:
        lab = (e.get('label') or '').upper()
        if any(x in lab for x in ast_labels):
            mapping['ast'].add(lab)
        elif any(x in lab for x in cfg_labels):
            mapping['cfg'].add(lab)
        elif any(x in lab for x in pdg_labels):
            mapping['pdg'].add(lab)
        else:
            mapping['other'].add(lab)
    return {k: sorted(list(v)) for k,v in mapping.items()}

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--graphson', required=True, help='wejściowy plik graphson (joern-export --format graphson)')
    ap.add_argument('--out', required=True, help='wyjściowy JSON LLM')
    ap.add_argument('--meta', default='', help='opcjonalne metadane')
    args = ap.parse_args()

    with open(args.graphson, 'r', encoding='utf-8') as f:
        raw = json.load(f)

    nodes, edges = collect_vertices_and_edges(raw)
    byLabel, nodeMap = build_indices(nodes, edges)
    layerHints = guess_layer_hints(edges)

    out = {
        'meta': {
            'source': args.meta,
            'original_format': 'graphson',
            'node_count': len(nodes),
            'edge_count': len(edges)
        },
        'nodes': nodes,
        'edges': edges,
        'byLabel': byLabel,
        'layerHints': layerHints
    }

    with open(args.out, 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, indent=2)

if __name__ == '__main__':
    main()
