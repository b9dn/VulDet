import dotenv from "dotenv";
import sqlite from "sqlite3";
import fs from "fs";
import { GoogleGenAI } from "@google/genai";

const samplesInOneRequestNum = 10;
const requestLimit = 20;
const sleepTime = 10;

const name = "tngtech/deepseek-r1t2-chimera:free";
// const name = "kwaipilot/kat-coder-pro:free";
// const name = "gemini-2.5-flash";
const graphType = "pdg"; // cfg, pdg, cpg14, cdg, ddg
const isGemini = false;

dotenv.config();
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI });
const db = new sqlite.Database("./formatted_data/data.sqlite");

const sendMessageOR = async (data, model, key = process.env.OPENROUTER) => {
  const messages = [
    {
      role: "system",
      content:
        "You are a security analysis assistant. Your job is to review code with additional graph representation for vulnerabilities and security risks.",
    },
    {
      role: "user",
      content: `Analyze the following code samples and ${graphType} graphs that describes them for security vulnerabilities.

Rules:
- Evaluate each code sample and its graph independently.
- For each sample, return exactly one word: "Safe" or "Vulnerable".
- Do not explain your answers.
- Do not rewrite code, graph or provide explanations.
- Do not add any extra text.

Output format:
Sample 1: Safe | Vulnerable
Sample 2: Safe | Vulnerable

...

Code and graph samples:
${data
  .map(
    (el, index) => `
Sample ${index + 1}:
\`\`\`
Code:
${el.code}
Graph describing code:
${el[graphType]}
\`\`\`
`
  )
  .join("\n")}
`,
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

  const result = await response.json();

  const formattedResponse = result.choices[0].message.content.split("\n");
  if (formattedResponse.length !== data.length) {
    console.error("Invalid response data length");
  }

  const results = [];

  for (let i = 0; i < data.length; i++) {
    results.push({
      id: data[i].id,
      expected: data[i].isVulnerable ? "Vulnerable" : "Safe",
      received: formattedResponse[i].split(":")[1].trim(),
    });
  }

  return results;
};

const sendMessageGemini = async (data, model) => {
  const message = `You are a security analysis assistant. Your job is to review code for vulnerabilities and security risks.

Analyze the following code samples and ${graphType} graphs that describes them for security vulnerabilities.

Rules:
- Evaluate each code sample and its graph independently.
- For each sample, return exactly one word: "Safe" or "Vulnerable".
- Do not explain your answers.
- Do not rewrite code, graph or provide explanations.
- Do not add any extra text.

Output format:
Sample 1: Safe | Vulnerable
Sample 2: Safe | Vulnerable

...

Code and graph samples:
${data
  .map(
    (el, index) => `
Sample ${index + 1}:
\`\`\`
Code:
${el.code}
Graph describing code:
${el[graphType]}
\`\`\`
`
  )
  .join("\n")}
`;
  const response = await ai.models.generateContent({
    model: model,
    contents: message,
  });

  const formattedResponse = response.text.split("\n");
  if (formattedResponse.length !== data.length) {
    console.error("Invalid response data length");
  }

  const results = [];

  for (let i = 0; i < data.length; i++) {
    results.push({
      id: data[i].id,
      expected: data[i].isVulnerable ? "Vulnerable" : "Safe",
      received: formattedResponse[i].split(":")[1].trim(),
    });
  }

  return results;
};

const sleep = (ms) => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

const path = `./results/${name.replace(/\//g, "")}-GRAPH-MULTIPLE.json`;
let prevResults;

if (fs.existsSync(path)) {
  const data = fs.readFileSync(path);
  prevResults = JSON.parse(data);
} else {
  prevResults = [];
}

const checkedIds = prevResults.map((val) => {
  return val.id;
});

const whereClause = checkedIds.length
  ? `WHERE id NOT IN (${checkedIds.join(",")})`
  : "";

const promises = [];

db.all(
  `SELECT * FROM data ${whereClause} ORDER BY RANDOM() LIMIT ${
    requestLimit * samplesInOneRequestNum
  }`,
  async (err, rows) => {
    if (err) return console.error(err.message);
    for (let i = 0; i < requestLimit; i++) {
      let data = rows.slice(
        i * samplesInOneRequestNum,
        (i + 1) * samplesInOneRequestNum
      );
      if (isGemini) {
        promises.push(
          sendMessageGemini(data, name).catch((err) => {
            console.error("Error", err.message);
            return null;
          })
        );
      } else {
        promises.push(
          sendMessageOR(data, name).catch((err) => {
            console.error("Error", err.message);
            return null;
          })
        );
      }

      await sleep(sleepTime * 1000);
    }

    Promise.all(promises).then((currResults) => {
      const combined = [
        ...prevResults,
        ...currResults.filter((item) => item !== null).flat(),
      ];
      fs.writeFileSync(path, JSON.stringify(combined));
    });
  }
);
