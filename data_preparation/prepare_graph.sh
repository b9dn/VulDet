#!/bin/bash
# ./prepare_graph.sh DB.slite [id opcjonalne]

set -eu

DB="$1"
ID_ARG="${2:-}"
graphs=("cfg" "pdg" "cpg14" "cdg" "ddg")

red='\033[0;31m'
green='\033[0;32m'
blue='\033[0;34m'
endcolor='\033[0m'

# wymagane narzędzia
for cmd in joern-parse joern-export sqlite3 base64 grep sed mktemp; do
    command -v "$cmd" >/dev/null 2>&1 || { echo "$cmd not found"; exit 1; }
done

for colname in ${graphs[@]}; do
    sqlite3 $DB "PRAGMA table_info(data);" | awk -F'|' '{print $2}' | grep -x "$colname" >/dev/null 2>&1 || \
    sqlite3 $DB "ALTER TABLE data ADD COLUMN '$colname' TEXT;"
done

esc() { printf "%s" "$*" | sed "s/'/''/g"; }

process_entry() {
    id=$1
    tmp=$(mktemp -d)
    src="$tmp/code.cpp"
    cpg="$tmp/cpg.bin"
    out="$tmp/out"
    # mkdir -p "$out"

    sqlite3 $DB "SELECT code FROM data WHERE id=$id;" > $src || { rm -r $tmp; return 1; }
    [[ -n $src ]] || { rm -r $tmp; return 1; }
    
    joern-parse $src -o $cpg || { rm -r $tmp; return 3; }

    for graphtype in ${graphs[@]}; do
        joern-export --repr $graphtype --out $out $cpg || { rm -r $tmp; return 4; }

        if [[ $graphtype == "cpg14" ]];then
            graphname="cpg"
        else
            graphname=$graphtype
        fi
        graphfile="$tmp/out/0-$graphname.dot"

        if [[ -f "$graphfile" ]]; then
            graph=$(cat $graphfile)
            echo Graph = $graph
            echo "UPDATE data SET $graphtype='$(esc $graph)' WHERE id=$id;" > "$tmp/graphsqlite3"
            sqlite3 $DB < "$tmp/graphsqlite3"
            echo -e "${green}Success id = $id, graphtype = $graphtype $endcolor"
        else
            echo -e "${red}Invalid output format for id = $id, graphtype = $graphtype $endcolor"
        fi

        rm -r $out
    done

    rm -r "$tmp"
    return 0
}

if [[ -n $ID_ARG ]]; then
    process_entry $ID_ARG
    exit $?
fi

recordn=$(sqlite3 $DB "SELECT COUNT(*) from data;")
i=1
sqlite3 $DB "SELECT id FROM data;" | while read -r id; do
    [[ -z $id ]] && continue
    process_entry $id || echo "id $id: error"

    echo -e "${blue}Done $i/$recordn ${endcolor}"
    ((i++))
done

exit 0
