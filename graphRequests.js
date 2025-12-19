import dotenv from "dotenv";
import sqlite from "sqlite3";
import fs from "fs";
import { GoogleGenAI } from "@google/genai";

dotenv.config();
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI });
const db = new sqlite.Database("./formatted_data/data.sqlite");

// const name = "gemini-2.5-flash";
const name = "kwaipilot/kat-coder-pro:free";
const isGemini = false;
const graphType = "pdg"; // cfg, pdg, cpg14, cdg, ddg

const sendMessageOR = async (data, model, key = process.env.OPENROUTER) => {

  const messages = [
    {
      role: "system",
      content:
        "You are a security analysis assistant. Your job is to review code with additional graph representation for vulnerabilities and security risks.",
    },
    {
      role: "user",
      content: `Analyze the following code and graph for security vulnerabilities.

      - If there are no vulnerabilities in the code and graph, answer "Safe".
      - If vulnerabilities are found, answer "Vulnerable".
      - Do not rewrite the code or graph or provide explanations unless explicitly asked.
      
      Code:
      \`\`\`
      ${data.code}
      \`\`\`

      Graph Type: ${graphType}

      Graph Data:
      \`\`\`
      ${data[graphType]}
      \`\`\`
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

  return {
    id: data.id,
    expected: data.isVulnerable ? "Vulnerable" : "Safe",
    received: result.choices[0].message.content.replace(/\n/g, ""),
  };
};

const sendMessageGemini = async (data, model) => {
  const message = `You are a security analysis assistant. Your job is to review code for vulnerabilities and security risks.
  
  Analyze the following code for security vulnerabilities.

  - Only answer "Safe" if there are no security vulnerabilities.
  - Otherwise, answer "Vulnerable".
  - Do not rewrite the code or provide explanations unless explicitly asked.
  
  Code:
  \`\`\`
  ${data.code}
  \`\`\``;

  const response = await ai.models.generateContent({
    model: model,
    contents: message,
  });

  return {
    id: data.id,
    expected: data.isVulnerable ? "Vulnerable" : "Safe",
    received: response.text.replace(/\n/g, ""),
  };
};

const sleep = (ms) => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

const path = `./results/${name.replace(/\//g, "")}-GRAPH.json`;
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
  `SELECT * FROM data ${whereClause} ORDER BY RANDOM() LIMIT 20`,
  async (err, rows) => {
    if (err) return console.error(err.message);
    for (const data of rows) {
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
      console.log("Success");

      await sleep(35 * 1000);
    }


    Promise.all(promises).then((currResults) => {
      const combined = [
        ...prevResults,
        ...currResults.filter((item) => item !== null),
      ];
      fs.writeFileSync(path, JSON.stringify(combined));
    });
  }
);
