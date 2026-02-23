import dotenv from "dotenv";
import sqlite from "sqlite3";
import { GoogleGenAI } from "@google/genai";
import fs from "fs";

dotenv.config();
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI });
const db = new sqlite.Database("./formatted_data/data_test.sqlite");

// const name = "gemini-2.5-flash";
const name = "arcee-ai/trinity-large-preview:free";
// const name = "openai/gpt-oss-120b:free";
const isGemini = false;
// const graphType = "cpg14"; // cfg, pdg, cpg14, cdg, ddg, json_graph_cpg_1
const graphColName = "llm_textgraph_pdg"

const timingsFile = `./results/timings/timings_textgraph_${name.replace(/[\/:.]/g, "_")}.json`;

if (!fs.existsSync(timingsFile)) {
  fs.writeFileSync(timingsFile, JSON.stringify([], null, 2));
}


const prompt = `
Task: Convert source code to PDG (Program Dependence Graph) representation

Transform the given source code into a program dependence graph consisting of nodes and edges.

OUTPUT FORMAT:

1. NODES
Each node in format: node_id | node_type | code
One node per line.

Example:
3 | FunctionDef | foo()
5 | IdentifierDeclStmt | int a=43
6 | IdentifierDecl | a=43
7 | IdentifierDeclType | int
17 | IfStatement | if(a<55)
39 | Symbol | a

Node types:
- FunctionDef - function definition
- IdentifierDeclStmt - variable declaration statement
- IdentifierDecl - identifier declaration
- IdentifierDeclType - identifier type
- IfStatement, WhileStatement, ForStatement - control flow statements
- AssignmentExpr - assignment expression
- BinaryOp, UnaryOp - operators
- Symbol - variable usage
- ReturnStatement - return statement
- CallExpression - function call

2. EDGES
Each edge in format: node1 | node2 | edge_type
One edge per line.

Example:
6 | 7 | CONTROL_DEP
5 | 17 | CONTROL_DEP
18 | 39 | DATA_DEP
5 | 39 | DATA_DEP

Edge types:
- CONTROL_DEP - control dependence (node2 execution depends on node1 control flow decision)
- DATA_DEP - data dependence (node2 uses data defined/modified by node1)

REQUIREMENTS:
- Use unique IDs for each node
- Include all code elements
- No explanations, commentary
- No markdown formatting
- Deterministic output
- CONTROL_DEP: connect control flow statements with statements they control
- DATA_DEP: connect definitions with uses (def-use chains)
- Each statement should have control dependence on the condition/loop that controls it
- Each variable use should have data dependence on its most recent definition

GENERATE:
NODES section:
[list of nodes]

EDGES section:
[list of edges]

CODE TO PROCESS:
`

const sendMessageOR = async (data, model, key = process.env.OPENROUTER) => {
  const startTime = Date.now();

  const messages = [
    {
      role: "user",
      content: prompt + data["code"]
    },
  ];

  const response = await fetch(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: model,
        messages: messages,
        reasoning: { enabled: true },
      }),
    }
  );

  if (!response.ok) {
    const body = await response.text();
    console.error("HTTP ERROR:", response.status, body);
    throw new Error(`Request failed with status ${response.status}`);
  }

  const result = await response.json();

  const generatedGraph =
    result.choices[0].message.content.trim();

  const stmt = db.prepare(`
    UPDATE data
    SET ${graphColName} = ?
    WHERE id = ?
  `);

  stmt.run(generatedGraph, data.id);

  const elapsed = Date.now() - startTime;
  const fileData = JSON.parse(fs.readFileSync(timingsFile, "utf-8"));
  fileData.push({ id: data.id, ms: elapsed });
  fs.writeFileSync(timingsFile, JSON.stringify(fileData, null));

  console.log(`Zapisano graf dla ID ${data.id}`);
};

const sendMessageGemini = async (data, model) => {
  const startTime = Date.now();

  const response = await ai.models.generateContent({
    model: model,
    contents: prompt + data["code"],
  });

  const generatedGraph = response.text.trim();

  db.prepare(`
    UPDATE data
    SET ${graphColName} = ?
    WHERE id = ?
  `).run(generatedGraph, data.id);

  const elapsed = Date.now() - startTime;
  const fileData = JSON.parse(fs.readFileSync(timingsFile, "utf-8"));
  fileData.push({ id: data.id, ms: elapsed });
  fs.writeFileSync(timingsFile, JSON.stringify(fileData, null));

  console.log(`Zapisano graf (Gemini) dla ID ${data.id}`);
};


const sleep = (ms) => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};
const whereClause = `WHERE (${graphColName} IS NULL OR ${graphColName} = '')`;

// db.exec(`ALTER TABLE data ADD COLUMN ${graphColName} TEXT DEFAULT NULL`);

db.all(
  `SELECT * FROM data ${whereClause} ORDER BY RANDOM() LIMIT 100`,
  async (err, rows) => {
    if (err) return console.error(err.message);

    try {
      for (const data of rows) {
        const promise = isGemini
          ? sendMessageGemini(data, name)
          : sendMessageOR(data, name);

        await promise;

        console.log("Success");
        await sleep(1000);
      }
    } catch (err) {
      console.error("PROCESS STOPPED:", err.message);
    }
  }
);
