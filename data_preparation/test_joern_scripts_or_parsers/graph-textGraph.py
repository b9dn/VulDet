#!/usr/bin/env python3
import json, argparse, collections
from typing import Any

def prop_to_code_str(n):
    label = n.get('label') or ''
    props = n.get('props', {}) or {}

    if 'code' in props and props['code']:
        return str(props['code'])

    if label in ('METHOD', 'METHOD_PARAMETER_IN', 'METHOD_PARAMETER_OUT'):
        for key in ('name','fullName','signature'):
            if key in props and props[key]:
                return str(props[key]) + ('()' if label=='METHOD' else '')
    if label in ('IDENTIFIER', 'LOCAL', 'FIELD_IDENTIFIER', 'TYPE_REF'):
        for key in ('name','typeFullName','fullName','canonicalName'):
            if key in props and props[key]:
                return str(props[key])
    if label in ('LITERAL', 'MODIFIER'):
        for key in ('code','name','value'):
            if key in props and props[key]:
                return str(props[key])
    if label in ('BLOCK', 'IFSTATEMENT', 'CALL', 'RETURN', 'EXPRESSION'):
        if 'code' in props and props['code']:
            return str(props['code'])
    for v in props.values():
        s = prop_to_str(v)
        if s:
            return s
    return '<empty>'

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
    ast_labels = set(['AST','CONTAINS','IS_AST_PARENT','AST_EDGE'])
    cfg_labels = set(['CFG','NEXT','FLOWS_TO','CFG_NEXT'])
    pdg_labels = set(['PDG','REACHING_DEF','DATA_DEP','CONTROLS'])
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

def prop_to_str(v):
    if v is None:
        return ''
    if isinstance(v, (str, int, float, bool)):
        return str(v)
    if isinstance(v, list):
        for x in v:
            s = prop_to_str(x)
            if s:
                return s
        return ''
    if isinstance(v, dict):
        if 'value' in v:
            return prop_to_str(v['value'])
        for key in ('code','name','typeFullName','fullName','signature','canonicalName','type'):
            if key in v and v[key] is not None:
                return prop_to_str(v[key])
        for kk, vv in v.items():
            s = prop_to_str(vv)
            if s:
                return s
        return ''
    try:
        return str(v)
    except Exception:
        return ''

def export_text_graph(nodes, edges, out_prefix):
    with open(f"{out_prefix}_nodes.txt", "w", encoding="utf-8") as f:
        for n in nodes:
            nid = n.get('id','')
            ntype = n.get('label','UNKNOWN')
            code = prop_to_code_str(n)
            f.write(f"{nid}\t{ntype}\t{code}\n")

    EDGE_MAP = {
        "AST": "IS_AST_PARENT",
        "CONTAINS": "IS_AST_PARENT",
        "IS_AST_PARENT": "IS_AST_PARENT",
        "CFG": "FLOWS_TO",
        "NEXT": "FLOWS_TO",
        "FLOWS_TO": "FLOWS_TO",
        "REACHING_DEF": "REACHES",
        "CONTROLS": "CONTROLS",
        "DEF": "DEF",
        "USE": "USE"
    }
    with open(f"{out_prefix}_edges.txt", "w", encoding="utf-8") as f:
        for e in edges:
            src = e.get('src') or ''
            dst = e.get('dst') or ''
            label = e.get('label') or ''
            mapped = EDGE_MAP.get(label.upper(), label)
            f.write(f"{src}\t{dst}\t{mapped}\n")

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--graphson', required=True, help='wejściowy plik graphson (joern-export --format graphson)')
    ap.add_argument('--out', required=True, help='wyjściowy JSON LLM + prefix plików tekstowych')
    ap.add_argument('--meta', default='', help='opcjonalne metadane')
    args = ap.parse_args()

    with open(args.graphson, 'r', encoding='utf-8') as f:
        raw = json.load(f)

    nodes, edges = collect_vertices_and_edges(raw)
    byLabel, nodeMap = build_indices(nodes, edges)
    layerHints = guess_layer_hints(edges)

    out_json = {
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

    with open(f"{args.out}.json", 'w', encoding='utf-8') as f:
        json.dump(out_json, f, ensure_ascii=False, indent=2)

    export_text_graph(nodes, edges, args.out)

    print(f"OK — {len(nodes)} nodes, {len(edges)} edges zapisane w plikach {args.out}_nodes.txt / {args.out}_edges.txt / {args.out}.json")

if __name__ == '__main__':
    main()
