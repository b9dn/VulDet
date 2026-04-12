import dotenv from "dotenv";
import sqlite from "sqlite3";
import fs from "fs";
import { GoogleGenAI } from "@google/genai";

dotenv.config();
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI });
const db = new sqlite.Database("./formatted_data/data.sqlite");

// const name = "gemini-2.5-flash";
const name = "google/gemma-4-31b-it:free";
const isGemini = false;
const graphType = "cfg"; // cfg, pdg, cpg14, cdg, ddg, json_graph_cpg_1, llm_textgraph, llm_textgraph_pdg
const path = `./results/${name.replace(/\//g, "")}-CHAIN.json`;

const sendMessageOR = async (data, model, key = process.env.OPENROUTER) => {

  const messages = [
    {
      role: "system",
      content:
        "You are a security analysis assistant. Your job is to review code with additional graph representation for vulnerabilities and security risks.",
    },
    {
      role: "user",
      content: `Analyze the following C or C++ code for vulnerabilities.

      Follow these steps:
      - Briefly describe the functionality of the code.
      - Identify possible errors or patterns that may lead to security vulnerabilities.
      - Decide whether the code is vulnerable.
      On the final line, return exactly one word: “Safe” or “Vulnerable”.

      Code:
      \`\`\`
      ${data.code}
      \`\`\`
      `,
    },
  ];
  
  // console.log("Id = " + data.id);
  // console.log(data.code);

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
  if (result.choices == null) {
    return null;
  }
  const result_content = result.choices[0].message.content.replace(/\n/g, "");
  if (result_content == null) {
    return null;
  }

  console.log(`Id: ${data.id} ====================================`)
  console.log(`Received: ${result_content} ====================================`)

  return {
    id: data.id,
    expected: data.isVulnerable ? "Vulnerable" : "Safe",
    received: result_content
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
  \`\`\`
  
  Graph Type: ${graphType}
  
  Graph Data:
  \`\`\`
  ${data[graphType]}
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

const whereClause = `WHERE id NOT IN (${checkedIds.join(",")}) AND ${graphType} IS NOT NULL`;
const MAX_PROMISE_BATCH = 10;

db.all(
  `SELECT * FROM data ${whereClause} ORDER BY RANDOM() LIMIT ${MAX_PROMISE_BATCH}`,
  async (err, rows) => {
    if (err) return console.error(err.message);

    const results = [];
    const promises = [];

    try {
      for (const data of rows) {
        const promise = isGemini
          ? sendMessageGemini(data, name)
          : sendMessageOR(data, name);

        promises.push(promise.then((res) => {
          if(res != null) {
            results.push(res);
          }
          console.log("Done id = " + data.id);
          return res;
        }));

        console.log("Success " + data.id);

        await sleep(3 * 1000);
      }
    } catch (err) {
      console.error(err)
      console.error("PROCESS STOPPED:", err.message);
    } finally {
      await Promise.all(promises);
      const combined = [...prevResults, ...results];
      fs.writeFileSync(path, JSON.stringify(combined, null, 2));
      process.exit(1);
    }
  }
);
