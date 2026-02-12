#!/bin/bash
# ./prepare_graph.sh DB.slite [id opcjonalne]

set -eu

DB="$1"
ID_ARG="${2:-}"
graphname="json_graph_cpg_1"

red='\033[0;31m'
green='\033[0;32m'
blue='\033[0;34m'
endcolor='\033[0m'

# wymagane narzędzia
for cmd in joern-parse sqlite3 base64 grep sed mktemp; do
    command -v "$cmd" >/dev/null 2>&1 || { echo "$cmd not found"; exit 1; }
done

sqlite3 $DB "PRAGMA table_info(data);" | awk -F'|' '{print $2}' | grep -x "$graphname" >/dev/null 2>&1 || \
sqlite3 $DB "ALTER TABLE data ADD COLUMN '$graphname' TEXT;"

esc() { printf "%s" "$*" | sed "s/'/''/g"; }

process_entry() {
    id=$1
    tmp=$(mktemp -d)
    src="$tmp/code.cpp"
    cpg="$tmp/cpg.bin"

    sqlite3 $DB "SELECT code FROM data WHERE id=$id;" > $src || { rm -r $tmp; return 1; }
    [[ -n $src ]] || { rm -r $tmp; return 1; }
    
    joern-parse $src -o $cpg || { rm -r $tmp; return 3; }

    joern --script script-graph-json.sc $cpg
    graphfile="./graph.json"

    if [[ -f "$graphfile" ]]; then
        graph=$(cat $graphfile)
        echo Graph = $graph
        sqlite3 $DB "UPDATE data SET $graphname='$(esc $graph)' WHERE id=$id;"
        echo -e "${green}Success id = $id, graphname = $graphname $endcolor"
    else
        echo -e "${red}Invalid output format for id = $id, graphname = $graphname $endcolor"
    fi

    rm $graphfile

    rm -r "$tmp"
    return 0
}

if [[ -n $ID_ARG ]]; then
    process_entry $ID_ARG
    exit $?
fi

recordn=$(sqlite3 $DB "SELECT COUNT(*) from data;")
i=1
sqlite3 $DB "SELECT id FROM data LIMIT 50;" | while read -r id; do
    [[ -z $id ]] && continue
    process_entry $id || echo "id $id: error"

    echo -e "${blue}Done $i/$recordn ${endcolor}"
    ((i++))
done

exit 0
